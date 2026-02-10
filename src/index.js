import { collectNews } from "./rss.js";
import { rewriteNews } from "./ai.js";
import { generateArticle } from "./generator.js";
import { publishPost, uploadImage, isPostDuplicate } from "./wordpress.js";
import { downloadImage } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";
import {
  cleanTitle,
  hoursSince,
  isSameCalendarDay,
  isRecent,
  normalizeText,
  stripHtml,
  truncate,
  truncateAtWord,
  uniqueStrings,
  wordCount,
} from "./utils.js";

const categories = [
  { name: "politica", id: 4058 },
  { name: "social", id: 4063 },
  { name: "economie", id: 4064 },
  { name: "externe", id: 4060 },
];

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const POSTS_PER_RUN = Number(process.env.POSTS_PER_RUN || "1");
const CANDIDATE_LIMIT = Number(process.env.CANDIDATE_LIMIT || "20");
const RECENT_HOURS = Number(process.env.RECENT_HOURS || "24");
const MIN_CONTENT_CHARS = Number(process.env.MIN_CONTENT_CHARS || "120");
const MIN_WORDS = Number(process.env.MIN_WORDS || "350");
const STRICT_RECENT = process.env.STRICT_RECENT !== "false";
const SAME_DAY_ONLY = process.env.SAME_DAY_ONLY !== "false";
const NEWS_TIMEZONE = process.env.NEWS_TIMEZONE || "Europe/Bucharest";
const ALLOW_FALLBACK = process.env.ALLOW_FALLBACK === "true";
const REQUIRE_IMAGE = process.env.REQUIRE_IMAGE === "true";
const USE_DYNAMIC_IMAGE = process.env.USE_DYNAMIC_IMAGE === "true";
const DEFAULT_FEATURED_MEDIA_ID = parsePositiveInt(
  process.env.WP_DEFAULT_FEATURED_MEDIA_ID || "0",
  0
);
const TITLE_MAX_CHARS = parsePositiveInt(process.env.TITLE_MAX_CHARS || "110", 110);
const SEO_TITLE_MAX_CHARS = parsePositiveInt(
  process.env.SEO_TITLE_MAX_CHARS || "60",
  60
);

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

const TITLE_END_STOPWORDS = new Set([
  "si",
  "sau",
  "cu",
  "de",
  "din",
  "la",
  "in",
  "pe",
  "pentru",
  "ca",
  "iar",
  "dar",
  "ori",
  "al",
  "ale",
  "a",
  "un",
  "o",
]);

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

function keywordFromText(text, maxWords = 4) {
  return (text || "")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function hasStrongTitle(title) {
  if (!title) return false;
  const normalized = normalizeText(title);
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 5) return false;
  if (/[,:;/-]$/.test(title.trim())) return false;
  const last = words[words.length - 1];
  if (TITLE_END_STOPWORDS.has(last)) return false;
  return true;
}

function ensureSeoFields(article, fallbackTitle = "") {
  if (!article) return article;

  const baseTitle = article.title || fallbackTitle || "";
  article.title = cleanTitle(baseTitle, TITLE_MAX_CHARS);
  if (!article.focus_keyword) {
    article.focus_keyword = keywordFromText(baseTitle, 4);
  }
  article.focus_keyword = truncateAtWord(article.focus_keyword || "", 80);

  const tags = Array.isArray(article.tags) ? article.tags : [];
  const seoTags = uniqueStrings([
    ...tags,
    article.focus_keyword,
    keywordFromText(baseTitle, 3),
    keywordFromText(baseTitle, 2),
  ]).slice(0, 5);
  article.tags = seoTags;

  if (!article.seo_title) {
    article.seo_title = article.title || baseTitle;
  }
  article.seo_title = cleanTitle(article.seo_title || baseTitle, SEO_TITLE_MAX_CHARS);

  if (!article.meta_description) {
    const raw = stripHtml(article.content_html || "").replace(/\s+/g, " ").trim();
    article.meta_description = truncate(raw, 160);
  } else {
    article.meta_description = truncate(article.meta_description, 160);
  }

  return article;
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
  if (!item?.publishedAt) return !STRICT_RECENT && !SAME_DAY_ONLY;
  if (SAME_DAY_ONLY && !isSameCalendarDay(item.publishedAt, new Date(), NEWS_TIMEZONE)) {
    return false;
  }
  if (!STRICT_RECENT) return true;
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

function candidateRejectionReason(item) {
  if (!item?.title) return "missing_title";
  if (!isRecentEnough(item)) {
    if (!item?.publishedAt) return "missing_published_at";
    return "not_same_day_or_not_recent";
  }
  const combined = `${item.title} ${item.content || ""}`;
  if (!item?.publishedAt && hasOnlyOldYears(combined)) {
    return "only_old_years_without_date";
  }
  const size = (item.content || "").length;
  const hasEnough = size >= MIN_CONTENT_CHARS || item.title.length > 20;
  if (!hasEnough) return "too_little_content";
  return null;
}

function prepareCandidates(items) {
  const stats = {};
  const accepted = [];
  for (const item of items) {
    const reason = candidateRejectionReason(item);
    if (reason) {
      stats[reason] = (stats[reason] || 0) + 1;
      continue;
    }
    if (isValidCandidate(item)) {
      accepted.push(item);
    } else {
      stats.unknown = (stats.unknown || 0) + 1;
    }
  }
  return {
    candidates: accepted.sort((a, b) => scoreItem(b) - scoreItem(a)),
    rejectionStats: stats,
  };
}

async function maybeUploadImage(article) {
  if (DEFAULT_FEATURED_MEDIA_ID > 0) {
    return DEFAULT_FEATURED_MEDIA_ID;
  }
  if (!USE_DYNAMIC_IMAGE) {
    return null;
  }
  let imageId = null;
  try {
    const query = article.focus_keyword || article.title;
    if (query) {
      await downloadImage(article.focus_keyword, article.title);
      imageId = await uploadImage({
        title: article.seo_title || article.title,
        altText: article.title || article.focus_keyword,
        caption: article.meta_description || "",
      });
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
  ensureSeoFields(article, item.title);

  if (!hasStrongTitle(article.title)) {
    const fallbackTitle = cleanTitle(item.title, TITLE_MAX_CHARS);
    if (!hasStrongTitle(fallbackTitle)) {
      console.log("Title quality too low. Skipping.");
      return false;
    }
    article.title = fallbackTitle;
    article.seo_title = cleanTitle(
      article.seo_title || fallbackTitle,
      SEO_TITLE_MAX_CHARS
    );
  }

  if (!hasMinimumContent(article.content_html)) {
    console.log("Sanitized content too short. Skipping.");
    return false;
  }

  return tryPublishArticle(article, item.categoryId, item.link);
}

async function publishFallbackArticle() {
  if (!ALLOW_FALLBACK) return false;
  const shuffled = [...categories];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (const cat of shuffled) {
    console.log("Fallback category:", cat.name);
    const article = await generateArticle(cat.name);
    if (!article) continue;

    article.content_html = sanitizeContent(article.content_html);
    ensureSeoFields(article, article.title);

    if (!hasStrongTitle(article.title)) {
      console.log("Fallback title quality too low. Trying next category.");
      continue;
    }

    if (!hasMinimumContent(article.content_html)) {
      console.log("Sanitized content too short. Skipping fallback article.");
      continue;
    }

    const success = await tryPublishArticle(article, cat.id, null);
    if (success) return true;
  }

  return false;
}

async function run() {
  console.log("START SCRIPT – auto publish");

  const postsTarget = Number.isFinite(POSTS_PER_RUN) && POSTS_PER_RUN > 0
    ? POSTS_PER_RUN
    : 1;

  const items = await collectNews(
    Math.max(CANDIDATE_LIMIT, postsTarget * 6)
  );
  console.log("Collected items:", items.length);

  const { candidates, rejectionStats } = prepareCandidates(items);
  console.log("Valid candidates:", candidates.length);
  if (candidates.length === 0) {
    console.log("Candidate rejection summary:", rejectionStats);
  }
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
