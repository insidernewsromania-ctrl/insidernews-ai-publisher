import { collectNews } from "./rss.js";
import { rewriteNews } from "./ai.js";
import { generateArticle } from "./generator.js";
import { publishPost, uploadImage, isPostDuplicate } from "./wordpress.js";
import { downloadImage } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";
import { hoursSince, isRecent, normalizeText, wordCount } from "./utils.js";

const categories = [
  { name: "politica", id: 4058 },
  { name: "social", id: 4063 },
  { name: "economie", id: 4064 },
  { name: "externe", id: 4060 },
];

const POSTS_PER_RUN = Number(process.env.POSTS_PER_RUN || "1");
const CANDIDATE_LIMIT = Number(process.env.CANDIDATE_LIMIT || "12");
const RECENT_HOURS = Number(process.env.RECENT_HOURS || "24");
const MIN_CONTENT_CHARS = Number(process.env.MIN_CONTENT_CHARS || "120");
const MIN_WORDS = Number(process.env.MIN_WORDS || "350");
const STRICT_RECENT = process.env.STRICT_RECENT !== "false";
const ALLOW_FALLBACK = process.env.ALLOW_FALLBACK === "true";
const REQUIRE_IMAGE = process.env.REQUIRE_IMAGE !== "false";

const BREAKING_KEYWORDS = [
  "breaking",
  "ultima ora",
  "alerta",
  "urgent",
  "cutremur",
  "explozie",
  "incendiu",
  "atac",
  "tragedie",
  "accident",
  "evacuare",
  "victime",
];

function pickRandomCategory() {
  return categories[Math.floor(Math.random() * categories.length)];
}

function isBreakingTitle(title) {
  const normalized = normalizeText(title);
  return BREAKING_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function scoreItem(item) {
  let score = 0;
  if (item.title && isBreakingTitle(item.title)) score += 4;
  if (item.source && normalizeText(item.source).includes("breaking")) score += 2;
  const hours = hoursSince(item.publishedAt);
  if (hours !== null) {
    if (hours <= 3) score += 3;
    else if (hours <= 12) score += 2;
    else if (hours <= 24) score += 1;
  }
  if ((item.content || "").length > 160) score += 1;
  return score;
}

function stripH1(html) {
  if (!html) return "";
  const removed = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "").trim();
  if (wordCount(removed) > 20) return removed;
  return html.trim();
}

function sanitizeContent(html) {
  const cleaned = stripH1(html);
  if (wordCount(cleaned) === 0) return html || "";
  return cleaned;
}

function hasMinimumContent(html) {
  return wordCount(html) >= MIN_WORDS;
}

function extractYears(text) {
  const matches = (text || "").match(/\b(20\d{2})\b/g);
  if (!matches) return [];
  return [...new Set(matches.map(year => Number(year)))].filter(
    year => !Number.isNaN(year)
  );
}

function hasOnlyOldYears(text) {
  const years = extractYears(text);
  if (years.length === 0) return false;
  const currentYear = new Date().getFullYear();
  return years.every(year => year < currentYear);
}

function isRecentEnough(item) {
  if (!item?.publishedAt) return !STRICT_RECENT;
  return isRecent(item.publishedAt, RECENT_HOURS);
}

function isValidCandidate(item) {
  if (!item?.title) return false;
  if (!isRecentEnough(item)) return false;
  const combined = `${item.title} ${item.content || ""}`;
  // Heuristica pe an e utilă doar când feed-ul nu oferă o dată clară.
  if (!item?.publishedAt && hasOnlyOldYears(combined)) return false;
  return true;
}

function prepareCandidates(items) {
  const withContent = items.filter(item => {
    const size = (item.content || "").length;
    const hasEnough = size >= MIN_CONTENT_CHARS || item.title.length > 20;
    return hasEnough && isValidCandidate(item);
  });

  return withContent.sort((a, b) => scoreItem(b) - scoreItem(a));
}

async function maybeUploadImage(article) {
  let imageId = null;
  try {
    const query = article.focus_keyword || article.title;
    if (query) {
      await downloadImage(article.focus_keyword, article.title);
      imageId = await uploadImage();
    }
  } catch (err) {
    console.log("Image skipped:", err.message);
  }
  return imageId;
}

async function tryPublishArticle(article, categoryId, sourceUrl) {
  if (isDuplicate({ title: article.title, url: sourceUrl })) {
    console.log("Duplicate detected in history. Skipping.");
    return false;
  }

  if (!article.content_html || !hasMinimumContent(article.content_html)) {
    console.log("Content too short or missing. Skipping.");
    return false;
  }

  try {
    const titlesToCheck = [article.title, article.seo_title]
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index);

    for (const title of titlesToCheck) {
      if (await isPostDuplicate(title)) {
        console.log("Duplicate detected in WordPress. Skipping.");
        return false;
      }
    }
  } catch (err) {
    console.warn("WP duplicate check failed:", err.message);
  }

  const imageId = await maybeUploadImage(article);

  if (REQUIRE_IMAGE && !imageId) {
    console.log("Image required but missing. Skipping.");
    return false;
  }

  try {
    await publishPost(article, categoryId, imageId);
  } catch (err) {
    console.error("Publish failed:", err.message);
    return false;
  }

  saveTopic({ title: article.title, url: sourceUrl });
  console.log("Published:", article.title);
  return true;
}

async function publishFromRssItem(item) {
  if (isDuplicate({ title: item.title, url: item.link })) {
    console.log("Duplicate source item. Skipping:", item.title);
    return false;
  }

  const raw = [item.title, item.content].filter(Boolean).join("\n\n");
  const article = await rewriteNews(raw, item.title, {
    publishedAt: item.publishedAt,
    source: item.source,
    link: item.link,
  });

  if (!article) return false;

  article.content_html = sanitizeContent(article.content_html);

  if (!hasMinimumContent(article.content_html)) {
    console.log("Sanitized content too short. Skipping.");
    return false;
  }

  if (!article.focus_keyword) {
    article.focus_keyword = item.title
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
  }

  if (!Array.isArray(article.tags) || article.tags.length === 0) {
    const fallbackTag = item.title.split(/\s+/).slice(0, 4).join(" ");
    article.tags = fallbackTag ? [fallbackTag] : [];
  }

  return tryPublishArticle(article, item.categoryId, item.link);
}

async function publishFallbackArticle() {
  if (!ALLOW_FALLBACK) return false;
  const cat = pickRandomCategory();
  console.log("Fallback category:", cat.name);
  const article = await generateArticle(cat.name);
  if (!article) return false;

  article.content_html = sanitizeContent(article.content_html);

  if (!hasMinimumContent(article.content_html)) {
    console.log("Sanitized content too short. Skipping.");
    return false;
  }

  if (!article.focus_keyword) {
    article.focus_keyword = article.title
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
  }

  return tryPublishArticle(article, cat.id, null);
}

async function run() {
  console.log("START SCRIPT – auto publish");

  const postsTarget = Number.isFinite(POSTS_PER_RUN) && POSTS_PER_RUN > 0
    ? POSTS_PER_RUN
    : 1;

  const items = await collectNews(
    Math.max(CANDIDATE_LIMIT, postsTarget * 4)
  );
  console.log("Collected items:", items.length);

  const candidates = prepareCandidates(items);
  console.log("Valid candidates:", candidates.length);
  let published = 0;

  for (const item of candidates) {
    if (published >= postsTarget) break;
    const success = await publishFromRssItem(item);
    if (success) published += 1;
  }

  if (published === 0) {
    console.log("No RSS article published. Trying fallback generation.");
    const fallback = await publishFallbackArticle();
    if (fallback) published += 1;
  }

  console.log(`DONE – published ${published} article(s)`);
  process.exit(0);
}

run();
