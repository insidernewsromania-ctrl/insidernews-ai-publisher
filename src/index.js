import { collectNews } from "./rss.js";
import { rewriteNews } from "./ai.js";
import { generateArticle } from "./generator.js";
import {
  getRecentPostsForInternalLinks,
  publishPost,
  uploadImage,
  isPostDuplicate,
} from "./wordpress.js";
import { addInternalLinksToHtml } from "./internal-links.js";
import { downloadImage } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";
import {
  buildRoleConstraintsFromClaims,
  extractPersonRoleClaims,
  findRoleMismatches,
  formatRoleMismatchSummary,
} from "./facts.js";
import {
  cleanTitle,
  hoursSince,
  isStrongTitle,
  isSameCalendarDay,
  isRecent,
  normalizeText,
  stripHtml,
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
const categoryById = new Map(categories.map(category => [category.id, category]));

const CATEGORY_KEYWORDS = {
  4058: {
    strong: [
      "presedinte",
      "premier",
      "prim ministru",
      "guvern",
      "parlament",
      "senat",
      "camera deputatilor",
      "partid",
      "alegeri",
      "coalitie",
      "opozitie",
      "ministru",
    ],
    normal: [
      "politica",
      "deputat",
      "senator",
      "lege",
      "ordonanta",
      "vot",
      "candidat",
      "campanie",
      "administratie",
      "reforma administrativa",
    ],
  },
  4063: {
    strong: [
      "educatie",
      "scoala",
      "elev",
      "profesor",
      "sanatate",
      "spital",
      "pacient",
      "social",
      "ghid",
      "inot",
      "inoate",
      "invata",
      "comunitate",
    ],
    normal: [
      "copii",
      "familie",
      "universitate",
      "liceu",
      "gradinita",
      "trafic",
      "meteo",
      "vremea",
      "transport public",
      "consumator",
      "sport",
      "turism",
      "cultura",
      "societate",
    ],
  },
  4064: {
    strong: [
      "economie",
      "economic",
      "business",
      "afaceri",
      "companie",
      "investitie",
      "profit",
      "cifra de afaceri",
      "bursa",
      "fiscal",
      "taxe",
      "inflatie",
    ],
    normal: [
      "banca",
      "credit",
      "impozit",
      "piata",
      "energie",
      "industrie",
      "financiar",
      "salariu",
      "cariera",
      "antreprenor",
      "startup",
      "export",
      "import",
    ],
  },
  4060: {
    strong: [
      "international",
      "extern",
      "sua",
      "statele unite",
      "rusia",
      "ucraina",
      "nato",
      "ue",
      "uniunea europeana",
      "macron",
      "trump",
      "putin",
      "zelenski",
    ],
    normal: [
      "franta",
      "germania",
      "italia",
      "spania",
      "china",
      "turcia",
      "moldova",
      "belgia",
      "polonia",
      "israel",
      "iran",
      "razboi",
      "diplomatic",
    ],
  },
};

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
const META_DESCRIPTION_MIN_CHARS = parsePositiveInt(
  process.env.META_DESCRIPTION_MIN_CHARS || "130",
  130
);
const META_DESCRIPTION_MAX_CHARS = parsePositiveInt(
  process.env.META_DESCRIPTION_MAX_CHARS || "160",
  160
);
const MIN_LEAD_WORDS = parsePositiveInt(process.env.MIN_LEAD_WORDS || "18", 18);
const STRICT_QUALITY_GATE = process.env.STRICT_QUALITY_GATE !== "false";
const PUBLISH_WINDOW_ENABLED = process.env.PUBLISH_WINDOW_ENABLED !== "false";
const PUBLISH_WINDOW_START_HOUR = parsePositiveInt(
  process.env.PUBLISH_WINDOW_START_HOUR || "8",
  8
);
const PUBLISH_WINDOW_END_HOUR = parsePositiveInt(
  process.env.PUBLISH_WINDOW_END_HOUR || "20",
  20
);
const PUBLISH_WINDOW_TIMEZONE =
  process.env.PUBLISH_WINDOW_TIMEZONE || NEWS_TIMEZONE;
const INTERNAL_LINKING_ENABLED = process.env.INTERNAL_LINKING_ENABLED !== "false";
const INTERNAL_LINK_MAX = parsePositiveInt(process.env.INTERNAL_LINK_MAX || "3", 3);
const INTERNAL_LINK_FETCH_LIMIT = parsePositiveInt(
  process.env.INTERNAL_LINK_FETCH_LIMIT || "30",
  30
);
const INTERNAL_LINK_CATEGORY_STRICT =
  process.env.INTERNAL_LINK_CATEGORY_STRICT !== "false";
const INTERNAL_LINK_ALLOW_CROSS_CATEGORY_FALLBACK =
  process.env.INTERNAL_LINK_ALLOW_CROSS_CATEGORY_FALLBACK === "true";
const REQUIRE_INTERNAL_LINK = process.env.REQUIRE_INTERNAL_LINK === "true";
const MIN_INTERNAL_LINKS = parsePositiveInt(process.env.MIN_INTERNAL_LINKS || "1", 1);
const ROLE_FACT_CHECK_ENABLED = process.env.ROLE_FACT_CHECK_ENABLED !== "false";
const ROLE_FACT_MAX_CLAIMS = parsePositiveInt(
  process.env.ROLE_FACT_MAX_CLAIMS || "6",
  6
);
const WP_PUBLISH_RETRIES = parsePositiveInt(process.env.WP_PUBLISH_RETRIES || "3", 3);
const WP_PUBLISH_RETRY_BASE_MS = parsePositiveInt(
  process.env.WP_PUBLISH_RETRY_BASE_MS || "2500",
  2500
);
const CATEGORY_OVERRIDE_ENABLED = process.env.CATEGORY_OVERRIDE_ENABLED !== "false";
const CATEGORY_SOURCE_BIAS = parsePositiveInt(process.env.CATEGORY_SOURCE_BIAS || "2", 2);
const CATEGORY_OVERRIDE_MARGIN = parsePositiveInt(
  process.env.CATEGORY_OVERRIDE_MARGIN || "2",
  2
);
const CATEGORY_MIN_SCORE = parsePositiveInt(process.env.CATEGORY_MIN_SCORE || "3", 3);

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

const LOW_EDITORIAL_VALUE_PATTERNS = [
  /^comunicat de presa\b/i,
  /^publicitate\b/i,
  /advertorial/i,
  /\bhoroscop\b/i,
  /\bcurs valutar\b/i,
  /\bprogram tv\b/i,
  /\brezultate loto\b/i,
];

const internalLinkTargetsCache = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryablePublishError(err) {
  const status = Number(err?.response?.status || 0);
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  const code = `${err?.code || ""}`.toUpperCase();
  if (["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN"].includes(code)) {
    return true;
  }
  return false;
}

function clampHour(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(23, Math.max(0, Math.floor(value)));
}

function localTimeParts(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const get = type => Number(parts.find(part => part.type === type)?.value || "0");
    return {
      hour: get("hour"),
      minute: get("minute"),
      second: get("second"),
    };
  } catch {
    return {
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }
}

function localTimeLabel(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("ro-RO", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function isWithinPublishWindow(date = new Date()) {
  if (!PUBLISH_WINDOW_ENABLED) return true;

  const start = clampHour(PUBLISH_WINDOW_START_HOUR);
  const end = clampHour(PUBLISH_WINDOW_END_HOUR);
  if (start === end) return true;

  const { hour, minute } = localTimeParts(date, PUBLISH_WINDOW_TIMEZONE);
  const inNormalRange = start < end;

  if (inNormalRange) {
    if (hour < start || hour > end) return false;
    if (hour === end) return minute === 0;
    return true;
  }

  // Fereastră care trece peste miezul nopții.
  if (hour > end && hour < start) return false;
  if (hour === end) return minute === 0;
  return true;
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

function keywordFromText(text, maxWords = 4) {
  return (text || "")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function categoryNameById(categoryId) {
  return categoryById.get(categoryId)?.name || `cat_${categoryId || "none"}`;
}

function countKeywordMatches(text, keywords = []) {
  if (!text) return 0;
  let matches = 0;
  for (const keyword of keywords) {
    const term = normalizeText(keyword);
    if (!term) continue;
    if (text.includes(term)) matches += 1;
  }
  return matches;
}

function computeCategoryScores(item, article) {
  const text = normalizeText(
    [
      article?.title,
      article?.focus_keyword,
      Array.isArray(article?.tags) ? article.tags.join(" ") : "",
      stripHtml(article?.content_html || "").slice(0, 2000),
      item?.title,
      item?.content,
      item?.source,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const scores = {};
  for (const category of categories) {
    const rule = CATEGORY_KEYWORDS[category.id] || { strong: [], normal: [] };
    const strongMatches = countKeywordMatches(text, rule.strong);
    const normalMatches = countKeywordMatches(text, rule.normal);
    scores[category.id] = strongMatches * 3 + normalMatches;
  }

  if (categoryById.has(item?.categoryId)) {
    scores[item.categoryId] = (scores[item.categoryId] || 0) + CATEGORY_SOURCE_BIAS;
  }

  return scores;
}

function pickBestCategory(scores, fallbackCategoryId) {
  const entries = categories.map(category => ({
    id: category.id,
    score: Number(scores?.[category.id] || 0),
  }));
  entries.sort((a, b) => b.score - a.score);
  const best = entries[0] || {
    id: fallbackCategoryId,
    score: Number(scores?.[fallbackCategoryId] || 0),
  };
  return {
    bestId: best.id,
    bestScore: best.score,
    currentScore: Number(scores?.[fallbackCategoryId] || 0),
    entries,
  };
}

function resolveCategoryId(item, article) {
  const fallbackCategoryId = categoryById.has(item?.categoryId)
    ? item.categoryId
    : 4063;

  if (!CATEGORY_OVERRIDE_ENABLED) {
    return {
      categoryId: fallbackCategoryId,
      changed: false,
      scores: {},
      reason: "override_disabled",
    };
  }

  const scores = computeCategoryScores(item, article);
  const { bestId, bestScore, currentScore } = pickBestCategory(
    scores,
    fallbackCategoryId
  );

  if (bestId === fallbackCategoryId) {
    return {
      categoryId: fallbackCategoryId,
      changed: false,
      scores,
      reason: "same_as_source",
    };
  }

  if (bestScore < CATEGORY_MIN_SCORE) {
    return {
      categoryId: fallbackCategoryId,
      changed: false,
      scores,
      reason: "below_min_score",
    };
  }

  if (bestScore < currentScore + CATEGORY_OVERRIDE_MARGIN) {
    return {
      categoryId: fallbackCategoryId,
      changed: false,
      scores,
      reason: "insufficient_margin",
    };
  }

  return {
    categoryId: bestId,
    changed: true,
    scores,
    reason: "keyword_override",
  };
}

function buildSourceRoleClaims(item) {
  const claimsFromTitle = extractPersonRoleClaims(item?.title || "", {
    maxClaims: ROLE_FACT_MAX_CLAIMS,
  });
  if (claimsFromTitle.size > 0) return claimsFromTitle;

  const fallbackText = `${item?.title || ""}\n${item?.content || ""}`.trim();
  return extractPersonRoleClaims(fallbackText, {
    maxClaims: ROLE_FACT_MAX_CLAIMS,
  });
}

function roleMismatchSummary(item, article, sourceClaims) {
  if (!(sourceClaims instanceof Map) || sourceClaims.size === 0) {
    return [];
  }
  const generatedText = `${article?.title || ""}\n${stripHtml(
    article?.content_html || ""
  ).slice(0, 2500)}`;
  return findRoleMismatches(sourceClaims, generatedText);
}

function containsNormalized(haystack, needle) {
  const left = normalizeText(haystack || "");
  const right = normalizeText(needle || "");
  if (!left || !right) return false;
  return left.includes(right);
}

function firstParagraphText(html) {
  const source = html || "";
  const match = source.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const raw = match ? match[1] : source;
  return stripHtml(raw).replace(/\s+/g, " ").trim();
}

function hasH2Heading(html) {
  return /<h2\b[^>]*>/i.test(html || "");
}

function escapeHtmlText(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureH2WithKeyword(article) {
  if (!article?.content_html || hasH2Heading(article.content_html)) return;
  const headingText = cleanTitle(
    article.focus_keyword || article.title || "Detalii",
    80
  );
  if (!headingText) return;
  const h2 = `<h2>${escapeHtmlText(headingText)}</h2>`;
  const closeP = article.content_html.match(/<\/p>/i);
  if (!closeP?.index && closeP?.index !== 0) {
    article.content_html = `${h2}\n${article.content_html}`;
    return;
  }
  const insertAt = closeP.index + closeP[0].length;
  article.content_html =
    `${article.content_html.slice(0, insertAt)}\n${h2}\n` +
    article.content_html.slice(insertAt);
}

function isLowEditorialValueTitle(title) {
  const normalized = normalizeText(title || "");
  return LOW_EDITORIAL_VALUE_PATTERNS.some(pattern => pattern.test(normalized));
}

function buildMetaDescription(article) {
  const lead = firstParagraphText(article?.content_html || "");
  const body = stripHtml(article?.content_html || "").replace(/\s+/g, " ").trim();
  let candidate = (lead || article?.meta_description || article?.title || "")
    .replace(/\s+/g, " ")
    .trim();

  if (article?.focus_keyword && !containsNormalized(candidate, article.focus_keyword)) {
    candidate = `${article.focus_keyword}: ${candidate}`.trim();
  }

  if (candidate.length < META_DESCRIPTION_MIN_CHARS && body) {
    candidate = `${candidate} ${body}`.replace(/\s+/g, " ").trim();
  }

  candidate = truncateAtWord(candidate, META_DESCRIPTION_MAX_CHARS);

  if (candidate.length < META_DESCRIPTION_MIN_CHARS) {
    const fallback = `${article?.title || ""}. ${lead || ""}`
      .replace(/\s+/g, " ")
      .trim();
    if (fallback.length > candidate.length) {
      candidate = truncateAtWord(fallback, META_DESCRIPTION_MAX_CHARS);
    }
  }

  return candidate;
}

function qualityGateIssues(article) {
  const issues = [];
  if (!isStrongTitle(article?.title || "")) issues.push("weak_title");
  if (!hasH2Heading(article?.content_html || "")) issues.push("missing_h2");
  const lead = firstParagraphText(article?.content_html || "");
  if (wordCount(lead) < MIN_LEAD_WORDS) issues.push("lead_too_short");
  const metaLength = (article?.meta_description || "").trim().length;
  if (
    metaLength < META_DESCRIPTION_MIN_CHARS ||
    metaLength > META_DESCRIPTION_MAX_CHARS
  ) {
    issues.push("meta_description_length");
  }
  if (article?.focus_keyword) {
    if (!containsNormalized(article.title, article.focus_keyword)) {
      issues.push("keyword_not_in_title");
    }
  }
  if (
    REQUIRE_INTERNAL_LINK &&
    countInternalLinks(article?.content_html || "") < MIN_INTERNAL_LINKS
  ) {
    issues.push("missing_internal_links");
  }
  return issues;
}

function wpBaseHost() {
  const value = process.env.WP_URL || "";
  try {
    const url = new URL(value);
    return (url.hostname || "").replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function countInternalLinks(html) {
  const source = html || "";
  const matches = [...source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)];
  if (matches.length === 0) return 0;

  const internalHost = wpBaseHost();
  if (!internalHost) return matches.length;

  let count = 0;
  for (const [, hrefRaw] of matches) {
    const href = (hrefRaw || "").trim();
    if (!href) continue;
    if (href.startsWith("/")) {
      count += 1;
      continue;
    }
    try {
      const url = new URL(href);
      const host = (url.hostname || "").replace(/^www\./i, "").toLowerCase();
      if (host === internalHost) count += 1;
    } catch {
      // Ignore malformed links in quality count.
    }
  }
  return count;
}

function isInternalHref(href, internalHost) {
  const value = (href || "").trim();
  if (!value) return false;
  if (value.startsWith("/")) return true;
  if (!internalHost) return true;
  try {
    const url = new URL(value);
    const host = (url.hostname || "").replace(/^www\./i, "").toLowerCase();
    return host === internalHost;
  } catch {
    return false;
  }
}

function removeExternalLinks(html) {
  const source = html || "";
  const internalHost = wpBaseHost();
  return source.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (full, href, innerText) => {
      if (isInternalHref(href, internalHost)) return full;
      return innerText;
    }
  );
}

async function fetchInternalLinkTargetsCached(cacheKey, categoryId) {
  if (internalLinkTargetsCache.has(cacheKey)) {
    return internalLinkTargetsCache.get(cacheKey) || [];
  }
  const targets = await getRecentPostsForInternalLinks({
    categoryId,
    limit: INTERNAL_LINK_FETCH_LIMIT,
  });
  internalLinkTargetsCache.set(cacheKey, targets);
  return targets;
}

async function loadInternalLinkTargets(categoryId) {
  const hasScopedCategory = Number.isFinite(categoryId) && categoryId > 0;
  const scoped = hasScopedCategory
    ? await fetchInternalLinkTargetsCached(`cat:${categoryId}`, categoryId)
    : [];

  if (INTERNAL_LINK_CATEGORY_STRICT) {
    if (scoped.length > 0) return scoped;
    if (!INTERNAL_LINK_ALLOW_CROSS_CATEGORY_FALLBACK) return [];
  }

  const generic = await fetchInternalLinkTargetsCached("cat:all", null);

  if (!hasScopedCategory) return generic;

  const byUrl = new Map();
  for (const target of [...scoped, ...generic]) {
    const url = (target?.url || "").trim();
    const title = (target?.title || "").trim();
    if (!url || !title) continue;
    if (!byUrl.has(url)) byUrl.set(url, target);
  }
  return [...byUrl.values()];
}

async function addInternalLinks(article, categoryId) {
  if (
    !INTERNAL_LINKING_ENABLED ||
    INTERNAL_LINK_MAX <= 0 ||
    !article?.content_html
  ) {
    return 0;
  }
  try {
    const targets = await loadInternalLinkTargets(categoryId);
    if (targets.length === 0) return 0;
    const { contentHtml, linkedCount } = addInternalLinksToHtml(
      article.content_html,
      {
        articleTitle: article.title,
        focusKeyword: article.focus_keyword,
        targets,
        maxLinks: INTERNAL_LINK_MAX,
      }
    );
    if (linkedCount > 0) {
      article.content_html = contentHtml;
    }
    return linkedCount;
  } catch (err) {
    console.warn("Internal linking skipped:", err.message);
    return 0;
  }
}

function ensureSeoFields(article, fallbackTitle = "") {
  if (!article) return article;

  const baseTitle = article.title || fallbackTitle || "";
  article.title = cleanTitle(baseTitle, TITLE_MAX_CHARS);

  if (!article.focus_keyword) {
    article.focus_keyword = keywordFromText(baseTitle, 4);
  }
  article.focus_keyword = cleanTitle(article.focus_keyword || "", 80);

  if (!containsNormalized(article.title, article.focus_keyword)) {
    article.focus_keyword = keywordFromText(article.title, 3);
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
  if (!containsNormalized(article.seo_title, article.focus_keyword)) {
    article.seo_title = cleanTitle(article.title, SEO_TITLE_MAX_CHARS);
  }

  article.meta_description = truncateAtWord(
    (article.meta_description || "").replace(/\s+/g, " ").trim(),
    META_DESCRIPTION_MAX_CHARS
  );
  if (
    !article.meta_description ||
    article.meta_description.length < META_DESCRIPTION_MIN_CHARS
  ) {
    article.meta_description = buildMetaDescription(article);
  }

  ensureH2WithKeyword(article);
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
  if (isLowEditorialValueTitle(item.title)) return false;
  if (!isRecentEnough(item)) return false;
  const combined = `${item.title} ${item.content || ""}`;
  // Heuristica pe an e utilă doar când feed-ul nu oferă o dată clară.
  if (!item?.publishedAt && hasOnlyOldYears(combined)) return false;
  return true;
}

function candidateRejectionReason(item) {
  if (!item?.title) return "missing_title";
  if (isLowEditorialValueTitle(item.title)) return "low_editorial_value_title";
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

async function publishPostWithRetry(article, categoryId, imageId) {
  const maxAttempts = Math.max(1, WP_PUBLISH_RETRIES);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await publishPost(article, categoryId, imageId);
      return true;
    } catch (err) {
      const retryable = isRetryablePublishError(err);
      const status = Number(err?.response?.status || 0);
      if (!retryable || attempt >= maxAttempts) {
        throw err;
      }
      const waitMs = WP_PUBLISH_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(
        `Publish retry ${attempt}/${maxAttempts} after ${
          status || err.code || "error"
        }; waiting ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }
  return false;
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
    await publishPostWithRetry(article, categoryId, imageId);
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
  const sourceRoleClaims = ROLE_FACT_CHECK_ENABLED
    ? buildSourceRoleClaims(item)
    : new Map();
  const roleConstraints = buildRoleConstraintsFromClaims(sourceRoleClaims);

  let article = await rewriteNews(raw, item.title, {
    publishedAt: item.publishedAt,
    source: item.source,
    link: item.link,
    roleConstraints,
  });

  if (!article) return false;

  if (ROLE_FACT_CHECK_ENABLED && sourceRoleClaims.size > 0) {
    let mismatches = roleMismatchSummary(item, article, sourceRoleClaims);
    if (mismatches.length > 0) {
      console.log(
        "Role mismatch detected, retrying strict factual mode:",
        formatRoleMismatchSummary(mismatches)
      );
      article = await rewriteNews(raw, item.title, {
        publishedAt: item.publishedAt,
        source: item.source,
        link: item.link,
        roleConstraints,
        strictRoleMode: true,
      });
      if (!article) return false;

      mismatches = roleMismatchSummary(item, article, sourceRoleClaims);
      if (mismatches.length > 0) {
        console.log(
          "Role mismatch persists. Skipping article:",
          formatRoleMismatchSummary(mismatches)
        );
        return false;
      }
    }
  }

  article.content_html = sanitizeContent(article.content_html);
  ensureSeoFields(article, item.title);

  if (!isStrongTitle(article.title)) {
    const fallbackTitle = cleanTitle(item.title, TITLE_MAX_CHARS);
    if (!isStrongTitle(fallbackTitle)) {
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

  const categoryDecision = resolveCategoryId(item, article);
  const targetCategoryId = categoryDecision.categoryId;
  if (categoryDecision.changed) {
    const scoreText = categories
      .map(category => `${category.name}:${categoryDecision.scores[category.id] || 0}`)
      .join(", ");
    console.log(
      `Category override: ${categoryNameById(item.categoryId)} -> ${categoryNameById(
        targetCategoryId
      )} (${scoreText})`
    );
  }

  const linkedCount = await addInternalLinks(article, targetCategoryId);
  if (linkedCount > 0) {
    console.log(`Internal links added: ${linkedCount}`);
  }
  article.content_html = removeExternalLinks(article.content_html);

  if (STRICT_QUALITY_GATE) {
    const issues = qualityGateIssues(article);
    if (issues.length > 0) {
      console.log("Quality gate failed:", issues.join(", "));
      return false;
    }
  }

  return tryPublishArticle(article, targetCategoryId, item.link);
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

    if (!isStrongTitle(article.title)) {
      console.log("Fallback title quality too low. Trying next category.");
      continue;
    }

    if (!hasMinimumContent(article.content_html)) {
      console.log("Sanitized content too short. Skipping fallback article.");
      continue;
    }

    const linkedCount = await addInternalLinks(article, cat.id);
    if (linkedCount > 0) {
      console.log(`Fallback internal links added: ${linkedCount}`);
    }
    article.content_html = removeExternalLinks(article.content_html);

    if (STRICT_QUALITY_GATE) {
      const issues = qualityGateIssues(article);
      if (issues.length > 0) {
        console.log("Fallback quality gate failed:", issues.join(", "));
        continue;
      }
    }

    const success = await tryPublishArticle(article, cat.id, null);
    if (success) return true;
  }

  return false;
}

async function run() {
  console.log("START SCRIPT – auto publish");

  if (!isWithinPublishWindow(new Date())) {
    const nowLabel = localTimeLabel(new Date(), PUBLISH_WINDOW_TIMEZONE);
    console.log(
      `Outside publish window ${clampHour(PUBLISH_WINDOW_START_HOUR)}:00-${clampHour(
        PUBLISH_WINDOW_END_HOUR
      )}:00 (${PUBLISH_WINDOW_TIMEZONE}). Local time: ${nowLabel}. Skipping run.`
    );
    process.exit(0);
  }

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
