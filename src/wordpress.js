import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import {
  buildTopicKey,
  normalizeText,
  slugify,
  stripHtml,
  topicOverlapRatio,
  topicTokens,
  truncate,
  uniqueStrings,
} from "./utils.js";

const auth = {
  username: process.env.WP_USER,
  password: process.env.WP_APP_PASSWORD,
};

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const TOPIC_DEDUP_ENABLED = process.env.TOPIC_DEDUP_ENABLED !== "false";
const TOPIC_OVERLAP_MIN = parsePositiveInt(process.env.TOPIC_OVERLAP_MIN || "4", 4);
const TOPIC_OVERLAP_RATIO = parsePositiveNumber(
  process.env.TOPIC_OVERLAP_RATIO || "0.8",
  0.8
);
const RECENT_DUPLICATE_POSTS_LIMIT = parsePositiveInt(
  process.env.RECENT_DUPLICATE_POSTS_LIMIT || "25",
  25
);

function wpBaseUrl() {
  const base = process.env.WP_URL || "";
  return base.replace(/\/$/, "");
}

function wpApi(path) {
  return `${wpBaseUrl()}/wp-json/wp/v2${path}`;
}

function canonicalSourceUrl(sourceUrl) {
  if (!sourceUrl) return "";
  try {
    const parsed = new URL(sourceUrl);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return `${sourceUrl}`.trim().toLowerCase();
  }
}

function sourceSlug(sourceUrl) {
  const canonical = canonicalSourceUrl(sourceUrl);
  if (!canonical) return "";
  const digest = crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 16);
  return `src-${digest}`;
}

function normalizeDuplicateInput(input) {
  if (!input) {
    return {
      title: "",
      seoTitle: "",
      sourceTitle: "",
      sourceUrl: "",
      slug: "",
    };
  }
  if (typeof input === "string") {
    return {
      title: input,
      seoTitle: "",
      sourceTitle: "",
      sourceUrl: "",
      slug: "",
    };
  }
  return {
    title: input.title || "",
    seoTitle: input.seoTitle || "",
    sourceTitle: input.sourceTitle || "",
    sourceUrl: input.sourceUrl || "",
    slug: input.slug || "",
  };
}

export function buildStablePostSlug(article = {}, sourceUrl = "") {
  const fromSource = sourceSlug(sourceUrl);
  if (fromSource) return fromSource;
  return slugify(article?.seo_title || article?.title || "");
}

export async function uploadImage(options = {}) {
  const img = fs.readFileSync("image.jpg");
  const fileBase = slugify(options.title || options.altText || "image") || "image";
  const fileName = `${fileBase}.jpg`;

  const res = await axios.post(wpApi("/media"), img, {
    auth,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename=${fileName}`,
    },
  });

  const mediaId = res.data.id;
  const payload = {};

  if (options.altText) payload.alt_text = truncate(options.altText, 120);
  if (options.title) payload.title = truncate(options.title, 120);
  if (options.caption) payload.caption = truncate(options.caption, 300);

  if (Object.keys(payload).length > 0) {
    try {
      await axios.post(wpApi(`/media/${mediaId}`), payload, { auth });
    } catch (err) {
      console.warn("MEDIA META ERROR:", err.message);
    }
  }

  return mediaId;
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

function overlapCount(aTokens = [], bTokens = []) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap;
}

function isNearTopicDuplicate(aTokens = [], bTokens = []) {
  if (!Array.isArray(aTokens) || !Array.isArray(bTokens)) return false;
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  const ratio = topicOverlapRatio(aTokens, bTokens);
  if (!Number.isFinite(ratio) || ratio < TOPIC_OVERLAP_RATIO) return false;
  return overlapCount(aTokens, bTokens) >= TOPIC_OVERLAP_MIN;
}

async function recentPostsForDuplicateCheck() {
  const limit = Math.max(5, Math.min(RECENT_DUPLICATE_POSTS_LIMIT, 50));
  const path = wpApi(
    `/posts?per_page=${limit}&orderby=date&order=desc&_fields=id,title.rendered,date,slug`
  );
  const res = await axios.get(path, { auth });
  return res.data || [];
}

export async function isPostDuplicate(input) {
  const {
    title,
    seoTitle,
    sourceTitle,
    sourceUrl,
    slug,
  } = normalizeDuplicateInput(input);

  const slugCandidates = uniqueStrings([
    slug,
    sourceSlug(sourceUrl),
    slugify(seoTitle),
    slugify(title),
  ]);

  for (const slugCandidate of slugCandidates) {
    if (!slugCandidate) continue;
    const existing = await findPostBySlug(slugCandidate);
    if (existing) return true;
  }

  const titleCandidates = uniqueStrings([title, seoTitle]);
  for (const titleCandidate of titleCandidates) {
    if (!titleCandidate) continue;
    const results = await searchPostsByTitle(titleCandidate);
    const normalized = normalizeText(titleCandidate);
    const tokens = normalized.split(" ").filter(Boolean);
    const shortKey = tokens.slice(0, 6).join(" ");
    const useShortKey = tokens.length >= 6;
    const hasMatch = results.some(post => {
      const rendered = post?.title?.rendered || "";
      const postTitle = normalizeText(rendered);
      if (postTitle === normalized) return true;
      if (useShortKey && postTitle.startsWith(shortKey)) return true;
      return false;
    });
    if (hasMatch) return true;
  }

  if (TOPIC_DEDUP_ENABLED) {
    const inputTopicKey = buildTopicKey(sourceTitle || title || seoTitle);
    if (inputTopicKey) {
      const inputTopicTokens = topicTokens(inputTopicKey);
      try {
        const recentPosts = await recentPostsForDuplicateCheck();
        for (const post of recentPosts) {
          const rendered = stripHtml(post?.title?.rendered || "")
            .replace(/\s+/g, " ")
            .trim();
          const postTopicKey = buildTopicKey(rendered);
          if (!postTopicKey) continue;
          if (postTopicKey === inputTopicKey) return true;
          if (isNearTopicDuplicate(inputTopicTokens, topicTokens(postTopicKey))) {
            return true;
          }
        }
      } catch (err) {
        console.warn("WP semantic duplicate check skipped:", err.message);
      }
    }
  }

  return false;
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

export async function getRecentPostsForInternalLinks(options = {}) {
  const limitRaw = Number(options.limit || 30);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.floor(limitRaw), 50))
    : 30;
  const categoryId = Number(options.categoryId || 0);
  const params = new URLSearchParams({
    per_page: String(limit),
    orderby: "date",
    order: "desc",
    _fields: "id,link,title.rendered,slug,categories,date",
  });
  if (Number.isFinite(categoryId) && categoryId > 0) {
    params.set("categories", String(categoryId));
  }

  const requestPath = wpApi(`/posts?${params.toString()}`);

  try {
    const res = await axios.get(requestPath, { auth });
    return (res.data || [])
      .map(post => ({
        id: post?.id || null,
        url: post?.link || "",
        title: stripHtml(post?.title?.rendered || "").replace(/\s+/g, " ").trim(),
      }))
      .filter(post => post.url && post.title);
  } catch (authErr) {
    try {
      const res = await axios.get(requestPath);
      return (res.data || [])
        .map(post => ({
          id: post?.id || null,
          url: post?.link || "",
          title: stripHtml(post?.title?.rendered || "").replace(/\s+/g, " ").trim(),
        }))
        .filter(post => post.url && post.title);
    } catch (err) {
      console.warn("INTERNAL LINKS FETCH ERROR:", err.message);
      return [];
    }
  }
}

export async function publishPost(article, categoryId, imageId, options = {}) {
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
  const excerptSource =
    article.meta_description ||
    stripHtml(article.content_html || "").replace(/\s+/g, " ").trim();
  if (excerptSource) payload.excerpt = truncate(excerptSource, 160);

  const slug =
    options.slug || buildStablePostSlug(article, options.sourceUrl || "");
  if (slug) payload.slug = slug;

  const seoTags = uniqueStrings([
    ...(article.tags || []),
    article.focus_keyword,
  ]).slice(0, 5);
  if (seoTags.length > 0) {
    const tagIds = await resolveTagIds(seoTags);
    if (tagIds.length > 0) payload.tags = tagIds;
  }

  if (Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  await axios.post(wpApi("/posts"), payload, { auth });
}
