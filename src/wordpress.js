import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  normalizeText,
  slugify,
  stripHtml,
  truncate,
  uniqueStrings,
} from "./utils.js";

const auth = {
  username: process.env.WP_USER,
  password: process.env.WP_APP_PASSWORD,
};

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const DEFAULT_WP_AUTHOR_ID = parsePositiveInt(process.env.WP_AUTHOR_ID || "0", 0);

function wpBaseUrl() {
  const base = process.env.WP_URL || "";
  return base.replace(/\/$/, "");
}

function wpApi(path) {
  return `${wpBaseUrl()}/wp-json/wp/v2${path}`;
}

function dayKeyInTimeZone(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function parseWpPostDate(post) {
  const gmtRaw = `${post?.date_gmt || ""}`.trim();
  if (gmtRaw && gmtRaw !== "0000-00-00T00:00:00") {
    const gmtIso = gmtRaw.endsWith("Z") ? gmtRaw : `${gmtRaw}Z`;
    const gmtDate = new Date(gmtIso);
    if (!Number.isNaN(gmtDate.getTime())) return gmtDate;
  }

  const localRaw = `${post?.date || ""}`.trim();
  if (localRaw) {
    const localDate = new Date(localRaw);
    if (!Number.isNaN(localDate.getTime())) return localDate;
  }

  return null;
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

function sourceHash(sourceUrl) {
  const canonical = canonicalSourceUrl(sourceUrl);
  if (!canonical) return "";
  return crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 12);
}

function legacySourceSlugByHash(hash) {
  if (!hash) return "";
  return `src-${hash}`;
}

function slugWithHash(baseText, hash) {
  if (!hash) return "";
  const base = slugify(baseText || "", 120);
  if (!base) return "";
  return `${base}-${hash}`.replace(/-+$/, "");
}

function sourceSlug(sourceUrl, preferredTitle = "") {
  const hash = sourceHash(sourceUrl);
  if (!hash) return "";
  const readable = slugWithHash(preferredTitle, hash);
  return readable || legacySourceSlugByHash(hash);
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

export function buildStablePostSlug(article = {}, sourceUrl = "", sourceTitle = "") {
  const fromSource = sourceSlug(
    sourceUrl,
    sourceTitle || article?.seo_title || article?.title || ""
  );
  if (fromSource) return fromSource;
  return slugify(article?.seo_title || article?.title || "");
}

export async function uploadImage(options = {}) {
  const filePath = options.filePath || "image.jpg";
  const img = fs.readFileSync(filePath);
  const explicitFileName = `${options.fileName || ""}`.trim();
  const fileExt = path.extname(filePath || "").replace(/^\./, "").toLowerCase() || "jpg";
  const fileBase = slugify(options.title || options.altText || "image") || "image";
  const fileName = explicitFileName || `${fileBase}.${fileExt}`;
  const contentType = `${options.contentType || ""}`.trim() || "image/jpeg";

  try {
    const res = await axios.post(wpApi("/media"), img, {
      auth,
      headers: {
        "Content-Type": contentType,
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
  } finally {
    if (options.cleanupFile === true && filePath && filePath !== "image.jpg") {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore temp cleanup errors
      }
    }
  }
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

async function hasRecentPostWithSourceHash(hash) {
  if (!hash) return false;
  const params = new URLSearchParams({
    per_page: "30",
    orderby: "date",
    order: "desc",
    _fields: "id,slug",
  });
  const res = await axios.get(wpApi(`/posts?${params.toString()}`), { auth });
  const legacy = legacySourceSlugByHash(hash);
  return (res.data || []).some(post => {
    const slug = `${post?.slug || ""}`.trim().toLowerCase();
    if (!slug) return false;
    if (slug === legacy) return true;
    return slug.endsWith(`-${hash}`);
  });
}

export async function isPostDuplicate(input) {
  const {
    title,
    seoTitle,
    sourceTitle,
    sourceUrl,
    slug,
  } = normalizeDuplicateInput(input);

  const sourceHashValue = sourceHash(sourceUrl);

  const slugCandidates = uniqueStrings([
    slug,
    sourceSlug(sourceUrl, sourceTitle || seoTitle || title),
    sourceSlug(sourceUrl, sourceTitle),
    legacySourceSlugByHash(sourceHashValue),
    slugWithHash(sourceTitle, sourceHashValue),
    slugWithHash(seoTitle, sourceHashValue),
    slugWithHash(title, sourceHashValue),
    slugify(seoTitle),
    slugify(title),
  ]);

  for (const slugCandidate of slugCandidates) {
    if (!slugCandidate) continue;
    const existing = await findPostBySlug(slugCandidate);
    if (existing) return true;
  }

  if (sourceHashValue) {
    const hashMatch = await hasRecentPostWithSourceHash(sourceHashValue);
    if (hashMatch) return true;
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
  try {
    const res = await axios.post(wpApi("/tags"), { name }, { auth });
    return res.data;
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    const termId = Number(err?.response?.data?.data?.term_id || 0);
    if (status === 400 && termId > 0) {
      return { id: termId };
    }
    throw err;
  }
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
      console.log("TAG WARN:", name, err.message);
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

export async function countPostsPublishedTodayByCategory(categoryId, options = {}) {
  const category = Number(categoryId || 0);
  if (!Number.isFinite(category) || category <= 0) return 0;

  const timeZone = `${options.timeZone || "Europe/Bucharest"}`.trim() || "Europe/Bucharest";
  const now = options.now instanceof Date ? options.now : new Date();
  const todayKey = dayKeyInTimeZone(now, timeZone);

  const params = new URLSearchParams({
    per_page: "100",
    orderby: "date",
    order: "desc",
    categories: String(category),
    _fields: "id,status,date,date_gmt",
  });

  const requestPath = wpApi(`/posts?${params.toString()}`);

  const toCount = posts =>
    (posts || []).filter(post => {
      const status = `${post?.status || "publish"}`.toLowerCase();
      if (status !== "publish") return false;
      const date = parseWpPostDate(post);
      if (!date) return false;
      return dayKeyInTimeZone(date, timeZone) === todayKey;
    }).length;

  try {
    const res = await axios.get(requestPath, { auth });
    return toCount(res.data);
  } catch (authErr) {
    try {
      const res = await axios.get(requestPath);
      return toCount(res.data);
    } catch (err) {
      console.warn("COUNT POSTS ERROR:", err.message);
      return 0;
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

  const authorId = parsePositiveInt(options.authorId || DEFAULT_WP_AUTHOR_ID, 0);
  if (authorId > 0) payload.author = authorId;

  if (categoryId) payload.categories = [categoryId];
  if (imageId) payload.featured_media = imageId;
  const excerptSource =
    article.meta_description ||
    stripHtml(article.content_html || "").replace(/\s+/g, " ").trim();
  if (excerptSource) payload.excerpt = truncate(excerptSource, 160);

  const slug =
    options.slug ||
    buildStablePostSlug(article, options.sourceUrl || "", options.sourceTitle || "");
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
