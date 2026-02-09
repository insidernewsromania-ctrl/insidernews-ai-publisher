import axios from "axios";
import fs from "fs";
import { normalizeText, slugify, uniqueStrings } from "./utils.js";

const auth = {
  username: process.env.WP_USER,
  password: process.env.WP_APP_PASSWORD,
};

function wpBaseUrl() {
  const base = process.env.WP_URL || "";
  return base.replace(/\/$/, "");
}

function wpApi(path) {
  return `${wpBaseUrl()}/wp-json/wp/v2${path}`;
}

export async function uploadImage() {
  const img = fs.readFileSync("image.jpg");

  const res = await axios.post(wpApi("/media"), img, {
    auth,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": "attachment; filename=image.jpg",
    },
  });

  return res.data.id;
}

async function findPostBySlug(slug) {
  const res = await axios.get(
    wpApi(`/posts?slug=${encodeURIComponent(slug)}&per_page=1`),
    { auth }
  );
  return res.data?.[0] || null;
}

async function searchPostsByTitle(title) {
  const res = await axios.get(
    wpApi(`/posts?search=${encodeURIComponent(title)}&per_page=5`),
    { auth }
  );
  return res.data || [];
}

export async function isPostDuplicate(title) {
  if (!title) return false;
  const slug = slugify(title);
  if (slug) {
    const existing = await findPostBySlug(slug);
    if (existing) return true;
  }
  const results = await searchPostsByTitle(title);
  const normalized = normalizeText(title);
  const tokens = normalized.split(" ").filter(Boolean);
  const shortKey = tokens.slice(0, 6).join(" ");
  const useShortKey = tokens.length >= 6;
  return results.some(post => {
    const rendered = post?.title?.rendered || "";
    const postTitle = normalizeText(rendered);
    if (postTitle === normalized) return true;
    if (useShortKey && postTitle.startsWith(shortKey)) return true;
    return false;
  });
}

async function findTagByName(name) {
  const res = await axios.get(
    wpApi(`/tags?search=${encodeURIComponent(name)}&per_page=20`),
    { auth }
  );
  const normalized = normalizeText(name);
  return (res.data || []).find(
    tag => normalizeText(tag?.name || "") === normalized
  );
}

async function createTag(name) {
  const res = await axios.post(wpApi("/tags"), { name }, { auth });
  return res.data;
}

async function resolveTagIds(tags) {
  const names = uniqueStrings(tags).slice(0, 5);
  const ids = [];
  for (const name of names) {
    try {
      const existing = await findTagByName(name);
      if (existing?.id) {
        ids.push(existing.id);
        continue;
      }
      const created = await createTag(name);
      if (created?.id) ids.push(created.id);
    } catch (err) {
      console.warn("TAG ERROR:", name, err.message);
    }
  }
  return ids;
}

export async function publishPost(article, categoryId, imageId) {
  const meta = {};

  if (article.focus_keyword) {
    meta.yoast_wpseo_focuskw = article.focus_keyword;
    meta.rank_math_focus_keyword = article.focus_keyword;
  }
  if (article.seo_title) {
    meta.yoast_wpseo_title = article.seo_title;
    meta.rank_math_title = article.seo_title;
  }
  if (article.meta_description) {
    meta.yoast_wpseo_metadesc = article.meta_description;
    meta.rank_math_description = article.meta_description;
  }

  const payload = {
    title: article.title,
    content: article.content_html,
    status: "publish",
  };

  if (categoryId) payload.categories = [categoryId];
  if (imageId) payload.featured_media = imageId;
  if (article.meta_description) payload.excerpt = article.meta_description;

  const slug = slugify(article.seo_title || article.title);
  if (slug) payload.slug = slug;

  if (article.tags && article.tags.length > 0) {
    const tagIds = await resolveTagIds(article.tags);
    if (tagIds.length > 0) payload.tags = tagIds;
  }

  if (Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  await axios.post(wpApi("/posts"), payload, { auth });
}
