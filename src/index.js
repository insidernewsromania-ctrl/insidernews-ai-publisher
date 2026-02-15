import { collectNews } from "./rss.js";
import { rewriteNews } from "./ai.js";
import { generateArticle, generateHowToArticle } from "./generator.js";
import {
  buildStablePostSlug,
  countPostsPublishedTodayByCategory,
  getRecentPostsForInternalLinks,
  publishPost,
  uploadImage,
  isPostDuplicate,
} from "./wordpress.js";
import { addInternalLinksToHtml } from "./internal-links.js";
import { downloadImage, downloadImageFromSource } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";
import {
  buildRoleConstraintsFromClaims,
  extractPersonRoleClaims,
  findRoleMismatches,
  formatRoleMismatchSummary,
} from "./facts.js";
import {
  isGoogleNewsArticleUrl,
  resolveCanonicalSourceUrl,
  resolveSourceName,
} from "./source-link.js";
import {
  cleanTitle,
  hasEnigmaticTitleSignals,
  hasSuperlativeTitleSignals,
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
  { name: "sport", id: 821 },
  { name: "auto", id: 4780 },
];
const categoryById = new Map(categories.map(category => [category.id, category]));

const CATEGORY_KEYWORDS = {
  4058: {
    strong: [
      "presedinte",
      "premier",
      "prim ministru",
      "prim ministrul",
      "guvern",
      "parlament",
      "senat",
      "camera deputatilor",
      "partid",
      "alegeri",
      "coalitie",
      "opozitie",
      "motiune de cenzura",
      "cabinet",
    ],
    normal: [
      "politica",
      "deputat",
      "senator",
      "ministru",
      "minister",
      "primar",
      "consiliu local",
      "lege",
      "ordonanta",
      "vot",
      "candidat",
      "campanie",
      "mandat",
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
      "ghid",
      "inot",
      "inoate",
      "invata",
      "comunitate",
      "accident",
      "incendiu",
      "cutremur",
    ],
    normal: [
      "social",
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
      "turism",
      "cultura",
      "societate",
      "ajutor social",
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
  821: {
    strong: [
      "sport",
      "fotbal",
      "meci",
      "campionat",
      "liga 1",
      "superliga",
      "fcsb",
      "dinamo",
      "rapid",
      "cfr cluj",
      "simona halep",
      "tenis",
      "handbal",
      "baschet",
      "olimpiada",
    ],
    normal: [
      "antrenor",
      "jucator",
      "transfer",
      "scor",
      "gol",
      "stadion",
      "arbitru",
      "derby",
      "cupa",
      "finala",
      "calificare",
      "nationala",
      "echipa",
      "campion",
    ],
  },
  4780: {
    strong: [
      "auto",
      "masina",
      "masini",
      "automobil",
      "autoturism",
      "dacia",
      "renault",
      "bmw",
      "mercedes",
      "audi",
      "toyota",
      "tesla",
      "electrica",
      "hibrid",
      "service auto",
      "itp",
      "rovigneta",
    ],
    normal: [
      "sofer",
      "soferi",
      "caroserie",
      "motor",
      "consum",
      "asigurare rca",
      "casco",
      "anvelope",
      "vulcanizare",
      "inmatriculare",
      "drumuri",
      "trafic rutier",
      "accident rutier",
      "cod rutier",
    ],
  },
};

const POLITICS_DECISIVE_TERMS = [
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
  "motiune de cenzura",
];

const SOCIAL_DECISIVE_TERMS = [
  "educatie",
  "scoala",
  "elev",
  "profesor",
  "sanatate",
  "spital",
  "pacient",
  "comunitate",
  "familie",
  "accident",
  "incendiu",
  "cutremur",
  "ghid",
];

const SPORT_DECISIVE_TERMS = [
  "sport",
  "fotbal",
  "meci",
  "campionat",
  "liga 1",
  "superliga",
  "tenis",
  "handbal",
  "baschet",
  "antrenor",
  "jucator",
];

const AUTO_DECISIVE_TERMS = [
  "auto",
  "masina",
  "masini",
  "automobil",
  "dacia",
  "bmw",
  "mercedes",
  "audi",
  "toyota",
  "tesla",
  "sofer",
  "cod rutier",
];

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function parseHowToSlots(value) {
  const raw = `${value || ""}`.trim();
  if (!raw) return [];
  const slots = raw
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
      return hour * 60 + minute;
    })
    .filter(valueMinute => Number.isFinite(valueMinute));
  return [...new Set(slots)].sort((a, b) => a - b);
}

const POSTS_PER_RUN = Number(process.env.POSTS_PER_RUN || "1");
const CANDIDATE_LIMIT = Number(process.env.CANDIDATE_LIMIT || "20");
const RECENT_HOURS = Number(process.env.RECENT_HOURS || "24");
const MIN_CONTENT_CHARS = Number(process.env.MIN_CONTENT_CHARS || "120");
const PUBLISH_MIN_WORDS = Number(process.env.PUBLISH_MIN_WORDS || process.env.MIN_WORDS || "350");
const ENFORCE_PUBLISH_MIN_WORDS = process.env.ENFORCE_PUBLISH_MIN_WORDS === "true";
const STRICT_RECENT = process.env.STRICT_RECENT !== "false";
const SAME_DAY_ONLY = process.env.SAME_DAY_ONLY !== "false";
const NEWS_TIMEZONE = process.env.NEWS_TIMEZONE || "Europe/Bucharest";
const ALLOW_FALLBACK = process.env.ALLOW_FALLBACK === "true";
const REQUIRE_IMAGE = process.env.REQUIRE_IMAGE === "true";
const USE_DYNAMIC_IMAGE = process.env.USE_DYNAMIC_IMAGE === "true";
const SOURCE_FEATURED_IMAGE_ENABLED = process.env.SOURCE_FEATURED_IMAGE_ENABLED !== "false";
const SOURCE_FEATURED_IMAGE_OVERRIDE_DEFAULT =
  process.env.SOURCE_FEATURED_IMAGE_OVERRIDE_DEFAULT !== "false";
const SOURCE_FEATURED_IMAGE_REQUIRED =
  process.env.SOURCE_FEATURED_IMAGE_REQUIRED === "true";
const IMAGE_DEBUG = process.env.IMAGE_DEBUG === "true";
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
const ENFORCE_LENGTH_QUALITY = process.env.ENFORCE_LENGTH_QUALITY === "true";
const PUBLISH_WINDOW_ENABLED = process.env.PUBLISH_WINDOW_ENABLED !== "false";
const PUBLISH_WINDOW_START_HOUR = parsePositiveInt(
  process.env.PUBLISH_WINDOW_START_HOUR || "8",
  8
);
const PUBLISH_WINDOW_END_HOUR = parsePositiveInt(
  process.env.PUBLISH_WINDOW_END_HOUR || "22",
  22
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
const FORCE_CATEGORY_ID = parseNonNegativeInt(
  process.env.FORCE_CATEGORY_ID || "0",
  0
);
const CATEGORY_OVERRIDE_ENABLED = process.env.CATEGORY_OVERRIDE_ENABLED !== "false";
const CATEGORY_SOURCE_BIAS = parsePositiveInt(process.env.CATEGORY_SOURCE_BIAS || "2", 2);
const CATEGORY_OVERRIDE_MARGIN = parsePositiveInt(
  process.env.CATEGORY_OVERRIDE_MARGIN || "2",
  2
);
const CATEGORY_MIN_SCORE = parsePositiveInt(process.env.CATEGORY_MIN_SCORE || "3", 3);
const CATEGORY_MIN_SOURCE_SIGNAL = parsePositiveInt(
  process.env.CATEGORY_MIN_SOURCE_SIGNAL || "6",
  6
);
const CATEGORY_SECOND_BEST_MARGIN = parsePositiveInt(
  process.env.CATEGORY_SECOND_BEST_MARGIN || "2",
  2
);
const DEFAULT_UNCERTAIN_CATEGORY_ID = parsePositiveInt(
  process.env.DEFAULT_UNCERTAIN_CATEGORY_ID || "7",
  7
);
const SOURCE_ATTRIBUTION_ENABLED = process.env.SOURCE_ATTRIBUTION_ENABLED !== "false";
const SOURCE_ATTRIBUTION_REQUIRE_LINK =
  process.env.SOURCE_ATTRIBUTION_REQUIRE_LINK !== "false";
const EDITORIAL_NOTE_ENABLED = process.env.EDITORIAL_NOTE_ENABLED !== "false";
const EDITORIAL_AUTHOR_NAME = (
  process.env.EDITORIAL_AUTHOR_NAME || "Gabriel Andrei"
)
  .toString()
  .trim();
const EDITORIAL_AUTHOR_PROFILE_URL = (
  process.env.EDITORIAL_AUTHOR_PROFILE_URL || "https://insidernews.ro/author/gabriel/"
)
  .toString()
  .trim();
const EDITORIAL_POLICY_URL = (process.env.EDITORIAL_POLICY_URL || "")
  .toString()
  .trim();
const RIGHT_OF_REPLY_URL = (process.env.RIGHT_OF_REPLY_URL || "")
  .toString()
  .trim();
const CORRECTIONS_EMAIL = (process.env.CORRECTIONS_EMAIL || "")
  .toString()
  .trim();
const BLOCK_TABLOID_TITLES = process.env.BLOCK_TABLOID_TITLES !== "false";
const BLOCK_ENIGMATIC_TITLES = process.env.BLOCK_ENIGMATIC_TITLES !== "false";
const BLOCK_SUPERLATIVE_TITLES = process.env.BLOCK_SUPERLATIVE_TITLES !== "false";
const TABLE_OF_CONTENTS_ENABLED = process.env.TABLE_OF_CONTENTS_ENABLED !== "false";
const TABLE_OF_CONTENTS_TITLE = (process.env.TABLE_OF_CONTENTS_TITLE || "Cuprins")
  .toString()
  .trim();
const TABLE_OF_CONTENTS_MAX_ITEMS = parsePositiveInt(
  process.env.TABLE_OF_CONTENTS_MAX_ITEMS || "8",
  8
);
const TABLE_OF_CONTENTS_MIN_HEADINGS = parsePositiveInt(
  process.env.TABLE_OF_CONTENTS_MIN_HEADINGS || "1",
  1
);
const TABLE_OF_CONTENTS_REQUIRED = process.env.TABLE_OF_CONTENTS_REQUIRED === "true";
const PREMIUM_EDITORIAL_PROFILE = process.env.PREMIUM_EDITORIAL_PROFILE !== "false";
const PREMIUM_REQUIRE_KEY_FACTS = process.env.PREMIUM_REQUIRE_KEY_FACTS !== "false";
const PREMIUM_REQUIRE_WHATS_NEXT = process.env.PREMIUM_REQUIRE_WHATS_NEXT !== "false";
const PREMIUM_KEY_FACTS_MIN_ITEMS = parsePositiveInt(
  process.env.PREMIUM_KEY_FACTS_MIN_ITEMS || "3",
  3
);
const PREMIUM_KEY_FACTS_MAX_ITEMS = parsePositiveInt(
  process.env.PREMIUM_KEY_FACTS_MAX_ITEMS || "5",
  5
);
const HOWTO_DAILY_ENABLED = process.env.HOWTO_DAILY_ENABLED !== "false";
const HOWTO_DAILY_CATEGORY_ID = parsePositiveInt(
  process.env.HOWTO_DAILY_CATEGORY_ID || "6064",
  6064
);
const HOWTO_DAILY_TARGET = parsePositiveInt(process.env.HOWTO_DAILY_TARGET || "2", 2);
const HOWTO_DAILY_POSTS_PER_RUN = parsePositiveInt(
  process.env.HOWTO_DAILY_POSTS_PER_RUN || "1",
  1
);
const HOWTO_DAILY_TIMEZONE = process.env.HOWTO_DAILY_TIMEZONE || NEWS_TIMEZONE;
const HOWTO_TOPIC_HINT = (process.env.HOWTO_TOPIC_HINT || "").toString().trim();
const HOWTO_DAILY_SLOTS = parseHowToSlots(
  process.env.HOWTO_DAILY_SLOTS || "10:15,18:15"
);
const HOWTO_SLOT_GRACE_MINUTES = parsePositiveInt(
  process.env.HOWTO_SLOT_GRACE_MINUTES || "20",
  20
);
const HOWTO_SLOT_STRICT = process.env.HOWTO_SLOT_STRICT !== "false";

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

const TABLOID_TITLE_PHRASES = [
  "soc total",
  "bomba",
  "incredibil",
  "de necrezut",
  "nu o sa iti vina sa crezi",
  "halucinant",
  "uluitor",
  "senzational",
  "wow",
];

const BLOCK_MEDIA_OUTLET_PROMO = process.env.BLOCK_MEDIA_OUTLET_PROMO !== "false";
const CONTEXT_WORD_MAX_OCCURRENCES = parseNonNegativeInt(
  process.env.CONTEXT_WORD_MAX_OCCURRENCES || "2",
  2
);

const MEDIA_OUTLET_TERMS = [
  "stirile protv",
  "protv",
  "news ro",
  "digi24",
  "observator",
  "antena 1",
  "antena 3",
  "romania tv",
  "realitatea",
  "hotnews",
  "g4media",
  "libertatea",
  "adevarul",
  "euronews",
];

const MEDIA_PROMO_VERBS = [
  "publica",
  "lanseaza",
  "prezinta",
  "difuzeaza",
  "transmite",
  "anunta",
  "promoveaza",
];

const MEDIA_PROMO_TARGET_TERMS = [
  "stiri video",
  "stiri online",
  "stiri de actualitate online",
  "ultimele stiri",
  "actualizari",
  "informatii",
  "online",
  "pagina",
  "page",
  "site",
  "canal",
  "emisiune",
  "aplicatie",
  "cont oficial",
  "youtube",
  "facebook",
  "tiktok",
  "serie",
];

const MEDIA_PROMO_PHRASES = [
  "cele mai recente stiri online",
  "in format de stiri online",
  "format de stiri online",
  "serie de stiri video",
  "fluxului de stiri",
  "de ultima ora pagina",
];

const GENERIC_MEDIA_PROMO_PATTERNS = [
  /\b(?:publica|publicate|publicat|lanseaza|prezinta|difuzeaza|transmite|anunta)\b[\s\S]{0,60}\b(?:stiri|news)\b[\s\S]{0,30}\b(?:online|video)\b/,
  /\b(?:news|stiri)\s+ro\b[\s\S]{0,24}\b(?:publica|lanseaza|prezinta|difuzeaza|transmite|anunta)\b/,
  /\b(?:publica|lanseaza|prezinta|difuzeaza|transmite|anunta)\b[\s\S]{0,24}\bultimele\s+(?:stiri|news)\b/,
  /\bin\s+format\s+de\s+(?:stiri|news)\s+(?:online|video)\b/,
  /\b(?:stiri|news)\s+de\s+ultima\s+ora\s+pagina\s+\d{2,}\b/,
  /\b(?:pagina|page)\s+\d{3,}\b/,
  /\bpublicate?\s+de\s+[a-z0-9][a-z0-9 .-]{1,40}\b/,
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

function minutesOfDay(parts) {
  const hour = Number(parts?.hour || 0);
  const minute = Number(parts?.minute || 0);
  return hour * 60 + minute;
}

function hhmmFromMinutes(totalMinutes) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.floor(totalMinutes)));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
  const plain = stripHtml(html || "").replace(/\s+/g, " ").trim();
  if (!plain) return false;
  if (!ENFORCE_PUBLISH_MIN_WORDS) return true;
  return wordCount(plain) >= Math.max(1, Number(PUBLISH_MIN_WORDS) || 1);
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
  if (categoryId === 7) return "ultimele_stiri";
  if (categoryId === 6064) return "cum_sa";
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

function decisiveCategoryMatches(item, terms = []) {
  const sourceText = normalizeText(
    [item?.title, item?.content, item?.source].filter(Boolean).join(" ")
  );
  return countKeywordMatches(sourceText, terms);
}

function computeCategoryScores(item, article) {
  const sourceTitleText = normalizeText(item?.title || "");
  const sourceBodyText = normalizeText(
    [item?.content, item?.source].filter(Boolean).join(" ")
  );
  const generatedText = normalizeText(
    [
      article?.title,
      article?.focus_keyword,
      Array.isArray(article?.tags) ? article.tags.join(" ") : "",
      stripHtml(article?.content_html || "").slice(0, 1200),
    ]
      .filter(Boolean)
      .join(" ")
  );

  const scores = {};
  const scoreDetails = {};
  for (const category of categories) {
    const rule = CATEGORY_KEYWORDS[category.id] || { strong: [], normal: [] };

    const titleStrongMatches = countKeywordMatches(sourceTitleText, rule.strong);
    const titleNormalMatches = countKeywordMatches(sourceTitleText, rule.normal);
    const bodyStrongMatches = countKeywordMatches(sourceBodyText, rule.strong);
    const bodyNormalMatches = countKeywordMatches(sourceBodyText, rule.normal);
    const generatedStrongMatches = countKeywordMatches(generatedText, rule.strong);
    const generatedNormalMatches = countKeywordMatches(generatedText, rule.normal);

    // Favorizăm puternic semnalele din sursa RSS față de textul rescris de AI.
    const sourceSignal =
      titleStrongMatches * 7 +
      titleNormalMatches * 3 +
      bodyStrongMatches * 4 +
      bodyNormalMatches * 2;
    const generatedSignal = generatedStrongMatches + generatedNormalMatches;

    scores[category.id] = sourceSignal + generatedSignal;
    scoreDetails[category.id] = {
      sourceSignal,
      generatedSignal,
      titleStrongMatches,
      titleNormalMatches,
      bodyStrongMatches,
      bodyNormalMatches,
      generatedStrongMatches,
      generatedNormalMatches,
    };
  }

  if (categoryById.has(item?.categoryId)) {
    scores[item.categoryId] = (scores[item.categoryId] || 0) + CATEGORY_SOURCE_BIAS;
  }

  return {
    scores,
    scoreDetails,
  };
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
  const second = entries[1] || {
    id: fallbackCategoryId,
    score: Number(scores?.[fallbackCategoryId] || 0),
  };
  return {
    bestId: best.id,
    bestScore: best.score,
    secondId: second.id,
    secondScore: second.score,
    currentScore: Number(scores?.[fallbackCategoryId] || 0),
    entries,
  };
}

function resolveCategoryId(item, article) {
  if (FORCE_CATEGORY_ID > 0) {
    return {
      categoryId: FORCE_CATEGORY_ID,
      changed: Number(item?.categoryId || 0) !== FORCE_CATEGORY_ID,
      scores: {},
      reason: "forced_category",
    };
  }

  const sourceCategoryId = Number(item?.categoryId || 0);
  const sourceCategoryKnown = categoryById.has(sourceCategoryId);
  const uncertainCategoryId = DEFAULT_UNCERTAIN_CATEGORY_ID;
  const fallbackCategoryId = sourceCategoryKnown ? sourceCategoryId : uncertainCategoryId;

  const { scores, scoreDetails } = computeCategoryScores(item, article);
  const {
    bestId,
    bestScore,
    secondScore,
    currentScore,
  } = pickBestCategory(scores, fallbackCategoryId);

  if (!CATEGORY_OVERRIDE_ENABLED) {
    return {
      categoryId: fallbackCategoryId,
      changed: false,
      scores,
      reason: "override_disabled",
    };
  }

  const bestSourceSignal = Number(scoreDetails?.[bestId]?.sourceSignal || 0);

  if (!sourceCategoryKnown) {
    if (bestScore < CATEGORY_MIN_SCORE) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "unknown_source_below_min_score",
      };
    }
    if (bestSourceSignal < CATEGORY_MIN_SOURCE_SIGNAL) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "unknown_source_low_source_signal",
      };
    }
    if (bestScore < secondScore + CATEGORY_SECOND_BEST_MARGIN) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "unknown_source_low_confidence",
      };
    }
    return {
      categoryId: bestId,
      changed: bestId !== sourceCategoryId,
      scores,
      reason: "unknown_source_inferred",
    };
  }

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

  if (bestSourceSignal < CATEGORY_MIN_SOURCE_SIGNAL) {
    return {
      categoryId: fallbackCategoryId,
      changed: false,
      scores,
      reason: "low_source_signal",
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

  if (bestScore < secondScore + CATEGORY_SECOND_BEST_MARGIN) {
    return {
      categoryId: fallbackCategoryId,
      changed: false,
      scores,
      reason: "too_close_to_second_best",
    };
  }

  if (fallbackCategoryId === 4063 && bestId === 4058) {
    const decisiveMatches = decisiveCategoryMatches(item, POLITICS_DECISIVE_TERMS);
    if (decisiveMatches < 2) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "guard_social_to_politics",
      };
    }
  }

  if (fallbackCategoryId === 4058 && bestId === 4063) {
    const decisiveMatches = decisiveCategoryMatches(item, SOCIAL_DECISIVE_TERMS);
    if (decisiveMatches < 2) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "guard_politics_to_social",
      };
    }
  }

  if (fallbackCategoryId === 4063 && bestId === 821) {
    const decisiveMatches = decisiveCategoryMatches(item, SPORT_DECISIVE_TERMS);
    if (decisiveMatches < 2) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "guard_social_to_sport",
      };
    }
  }

  if (fallbackCategoryId === 821 && bestId === 4063) {
    const decisiveMatches = decisiveCategoryMatches(item, SOCIAL_DECISIVE_TERMS);
    if (decisiveMatches < 2) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "guard_sport_to_social",
      };
    }
  }

  if (fallbackCategoryId === 4063 && bestId === 4780) {
    const decisiveMatches = decisiveCategoryMatches(item, AUTO_DECISIVE_TERMS);
    if (decisiveMatches < 2) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "guard_social_to_auto",
      };
    }
  }

  if (fallbackCategoryId === 4780 && bestId === 4063) {
    const decisiveMatches = decisiveCategoryMatches(item, SOCIAL_DECISIVE_TERMS);
    if (decisiveMatches < 2) {
      return {
        categoryId: fallbackCategoryId,
        changed: false,
        scores,
        reason: "guard_auto_to_social",
      };
    }
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

async function withResolvedSourceItem(item) {
  if (!item) return item;

  const fallbackLink = `${item.link || ""}`.trim();
  let resolvedLink = fallbackLink;
  try {
    resolvedLink = await resolveCanonicalSourceUrl(fallbackLink);
  } catch {
    resolvedLink = fallbackLink;
  }

  const sourceName = resolveSourceName(item, resolvedLink);
  const nextLink = resolvedLink || fallbackLink;
  const nextSource = sourceName || item.source || "Sursa";

  if (nextLink && fallbackLink && nextLink !== fallbackLink) {
    console.log(`Resolved source URL: ${fallbackLink} -> ${nextLink}`);
  }

  if (nextLink === fallbackLink && nextSource === (item.source || "")) {
    return item;
  }

  return {
    ...item,
    link: nextLink,
    source: nextSource,
  };
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

function escapeHtmlAttr(text) {
  return escapeHtmlText(text).replace(/`/g, "&#96;");
}

function normalizedUrl(value) {
  const raw = `${value || ""}`.trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function linkLabelFromUrl(value) {
  const safe = normalizedUrl(value);
  if (!safe) return "";
  try {
    const url = new URL(safe);
    const path = (url.pathname || "").replace(/\/+$/, "");
    return `${url.hostname}${path}` || url.hostname;
  } catch {
    return safe;
  }
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

function headingSlugBase(text, fallback = "sectiune") {
  const normalized = normalizeText(stripHtml(text || ""));
  const slug = normalized
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

function uniqueHeadingId(base, usedIds) {
  let id = base;
  let i = 2;
  while (usedIds.has(id)) {
    id = `${base}-${i}`;
    i += 1;
  }
  usedIds.add(id);
  return id;
}

function hasTableOfContentsBlock(html) {
  return /data-article-toc="true"/i.test(html || "");
}

function paragraphTexts(html, limit = 12) {
  const source = html || "";
  const matches = [...source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const items = matches
    .map(([, inner = ""]) => stripHtml(inner).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return items.slice(0, Math.max(1, limit));
}

function extractSectionHtmlByH2Heading(html, headingText) {
  const source = html || "";
  const target = normalizeText(headingText || "");
  if (!target) return "";

  const headings = [...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(match => ({
    index: Number.isFinite(match.index) ? match.index : 0,
    end: (Number.isFinite(match.index) ? match.index : 0) + match[0].length,
    text: stripHtml(match[1] || ""),
  }));

  for (let i = 0; i < headings.length; i += 1) {
    const headingNorm = normalizeText(headings[i].text);
    if (!headingNorm.includes(target)) continue;
    const start = headings[i].end;
    const end = i + 1 < headings.length ? headings[i + 1].index : source.length;
    return source.slice(start, end);
  }
  return "";
}

function hasH2SectionHeading(html, headingText) {
  const target = normalizeText(headingText || "");
  if (!target) return false;
  const headings = [...(`${html || ""}`.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))];
  for (const [, inner = ""] of headings) {
    if (normalizeText(stripHtml(inner)).includes(target)) return true;
  }
  return false;
}

function hasKeyFactsSection(html) {
  return hasH2SectionHeading(html, "Ce trebuie sa stii rapid");
}

function keyFactsListItemCount(html) {
  const sectionHtml = extractSectionHtmlByH2Heading(html, "Ce trebuie sa stii rapid");
  if (!sectionHtml) return 0;
  const matches = sectionHtml.match(/<li\b[^>]*>/gi);
  return matches ? matches.length : 0;
}

function hasWhatsNextSection(html) {
  return hasH2SectionHeading(html, "Ce urmeaza");
}

function buildKeyFactsItemsFromHtml(html) {
  const minItems = Math.max(1, PREMIUM_KEY_FACTS_MIN_ITEMS);
  const maxItems = Math.max(minItems, PREMIUM_KEY_FACTS_MAX_ITEMS);
  const paragraphs = paragraphTexts(html, 10);
  const items = [];
  const seen = new Set();

  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (let sentence of sentences) {
      sentence = sentence
        .replace(/^[-•\d.)\s]+/, "")
        .replace(/[;:,.!?]+$/, "")
        .trim();
      if (!sentence) continue;
      const words = normalizeText(sentence).split(" ").filter(Boolean).length;
      if (words < 7 || sentence.length < 40) continue;
      const dedupeKey = normalizeText(sentence)
        .split(" ")
        .slice(0, 12)
        .join(" ");
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push(sentence);
      if (items.length >= maxItems) return items;
    }
  }

  for (const paragraph of paragraphs) {
    if (items.length >= minItems) break;
    const fallback = truncateAtWord(paragraph, 140);
    const dedupeKey = normalizeText(fallback)
      .split(" ")
      .slice(0, 12)
      .join(" ");
    if (!fallback || !dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push(fallback);
  }

  return items.slice(0, maxItems);
}

function ensureKeyFactsSection(article) {
  if (!article?.content_html) return;
  if (hasKeyFactsSection(article.content_html)) return;
  const items = buildKeyFactsItemsFromHtml(article.content_html);
  if (items.length < Math.max(1, PREMIUM_KEY_FACTS_MIN_ITEMS)) return;

  const listHtml = items
    .map(item => `<li>${escapeHtmlText(item)}</li>`)
    .join("\n");
  const blockHtml = `<h2>Ce trebuie să știi rapid</h2>
<ul>
${listHtml}
</ul>`;

  const closeP = article.content_html.match(/<\/p>/i);
  if (!closeP?.index && closeP?.index !== 0) {
    article.content_html = `${blockHtml}\n${article.content_html}`;
    return;
  }
  const insertAt = closeP.index + closeP[0].length;
  article.content_html =
    `${article.content_html.slice(0, insertAt)}\n${blockHtml}\n` +
    article.content_html.slice(insertAt);
}

function ensureWhatsNextSection(article) {
  if (!article?.content_html) return;
  if (hasWhatsNextSection(article.content_html)) return;

  const paragraphs = paragraphTexts(article.content_html, 20);
  const candidate = [...paragraphs]
    .reverse()
    .find(text => normalizeText(text).split(" ").filter(Boolean).length >= 8);
  if (!candidate) return;

  const summary = truncateAtWord(candidate, 240);
  if (!summary) return;
  const blockHtml = `<h2>Ce urmează</h2>
<p>${escapeHtmlText(summary)}</p>`;
  article.content_html = `${article.content_html}\n${blockHtml}`;
}

function applyPremiumEditorialStructure(article, options = {}) {
  if (!PREMIUM_EDITORIAL_PROFILE || !article?.content_html) return;
  const enableKeyFacts = options.keyFacts !== false;
  const enableWhatsNext = options.whatsNext !== false;
  if (PREMIUM_REQUIRE_KEY_FACTS && enableKeyFacts) {
    ensureKeyFactsSection(article);
  }
  if (PREMIUM_REQUIRE_WHATS_NEXT && enableWhatsNext) {
    ensureWhatsNextSection(article);
  }
}

function applyTableOfContents(article) {
  if (!TABLE_OF_CONTENTS_ENABLED || !article?.content_html) return;
  if (hasTableOfContentsBlock(article.content_html)) return;

  const usedIds = new Set();
  const headings = [];
  let headingIndex = 0;

  const updatedHtml = article.content_html.replace(
    /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi,
    (full, attrs = "", innerHtml = "") => {
      const headingTextRaw = stripHtml(innerHtml).replace(/\s+/g, " ").trim();
      if (!headingTextRaw) return full;

      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
      let headingId = (idMatch?.[1] || "").trim();
      const originalId = headingId;
      if (headingId && usedIds.has(headingId)) {
        headingId = "";
      }
      if (headingId) usedIds.add(headingId);
      if (!headingId) {
        const base = headingSlugBase(headingTextRaw, `sectiune-${headingIndex + 1}`);
        headingId = uniqueHeadingId(base, usedIds);
      }

      headingIndex += 1;
      const label = cleanTitle(headingTextRaw, 120) || headingTextRaw;
      headings.push({
        id: headingId,
        label,
      });

      if (idMatch && headingId === originalId) return full;
      const attrsWithoutId = attrs.replace(/\s*\bid=["'][^"']*["']/i, "");
      return `<h2${attrsWithoutId} id="${escapeHtmlAttr(headingId)}">${innerHtml}</h2>`;
    }
  );

  if (headings.length < TABLE_OF_CONTENTS_MIN_HEADINGS) {
    article.content_html = updatedHtml;
    return;
  }

  const tocItems = headings
    .slice(0, TABLE_OF_CONTENTS_MAX_ITEMS)
    .map(
      heading =>
        `<li><a href="#${escapeHtmlAttr(heading.id)}">${escapeHtmlText(heading.label)}</a></li>`
    )
    .join("\n");

  if (!tocItems) {
    article.content_html = updatedHtml;
    return;
  }

  const tocTitle = TABLE_OF_CONTENTS_TITLE || "Cuprins";
  const tocHtml = `<nav data-article-toc="true" aria-label="Cuprins articol">
<p><strong>${escapeHtmlText(tocTitle)}</strong></p>
<ul>
${tocItems}
</ul>
</nav>`;

  const closeP = updatedHtml.match(/<\/p>/i);
  if (!closeP?.index && closeP?.index !== 0) {
    article.content_html = `${tocHtml}\n${updatedHtml}`;
    return;
  }

  const insertAt = closeP.index + closeP[0].length;
  article.content_html =
    `${updatedHtml.slice(0, insertAt)}\n${tocHtml}\n` + updatedHtml.slice(insertAt);
}

function isLowEditorialValueTitle(title) {
  const normalized = normalizeText(title || "");
  return LOW_EDITORIAL_VALUE_PATTERNS.some(pattern => pattern.test(normalized));
}

function hasTabloidTitleSignals(title) {
  const value = `${title || ""}`.trim();
  if (!value) return false;
  const normalized = normalizeText(value);
  if (!normalized) return false;

  if (TABLOID_TITLE_PHRASES.some(phrase => normalized.includes(normalizeText(phrase)))) {
    return true;
  }
  if (/[!?]{2,}/.test(value)) return true;
  if (/!/.test(value)) return true;

  const letters = value.match(/[A-Za-zĂÂÎȘȚăâîșț]/g) || [];
  const upper = value.match(/[A-ZĂÂÎȘȚ]/g) || [];
  if (letters.length >= 12 && upper.length / letters.length > 0.65) {
    return true;
  }
  return false;
}

function hasHeadlineStyleIssues(title) {
  const issues = [];
  if (BLOCK_ENIGMATIC_TITLES && hasEnigmaticTitleSignals(title)) {
    issues.push("enigmatic_title");
  }
  if (BLOCK_SUPERLATIVE_TITLES && hasSuperlativeTitleSignals(title)) {
    issues.push("superlative_title");
  }
  return issues;
}

function hasSourceAttributionBlock(html) {
  return /data-source-attribution="true"/i.test(html || "");
}

function hasEditorialNoteBlock(html) {
  return /data-editorial-note="true"/i.test(html || "");
}

function containsAnyTerm(normalizedText, terms = []) {
  if (!normalizedText) return false;
  for (const term of terms) {
    if (!term) continue;
    if (normalizedText.includes(term)) return true;
  }
  return false;
}

function isLikelyMediaOutletPromotionText(text) {
  const normalized = normalizeText(text || "");
  if (!normalized) return false;
  const hasOutlet = containsAnyTerm(normalized, MEDIA_OUTLET_TERMS);
  const hasPhrase = containsAnyTerm(normalized, MEDIA_PROMO_PHRASES);
  const matchesGenericPattern = GENERIC_MEDIA_PROMO_PATTERNS.some(pattern =>
    pattern.test(normalized)
  );
  if (!hasOutlet && !hasPhrase && !matchesGenericPattern) return false;

  const hasPromoVerb = containsAnyTerm(normalized, MEDIA_PROMO_VERBS);
  const hasPromoTarget = containsAnyTerm(normalized, MEDIA_PROMO_TARGET_TERMS);
  const mentionsNumericPage =
    /\bpagina\s+\d{3,}\b/.test(normalized) || /\bpage\s+\d{3,}\b/.test(normalized);
  const mentionsProgramSignals =
    /\b(?:stiri|news)\s+(?:video|online)\b/.test(normalized) ||
    /\b(?:editie|sezon|episod)\b/.test(normalized);

  if (mentionsNumericPage) return true;
  if (hasPhrase && (hasOutlet || hasPromoVerb || hasPromoTarget)) return true;
  if (matchesGenericPattern && (hasOutlet || hasPromoVerb || hasPromoTarget)) return true;
  if (matchesGenericPattern && !hasOutlet) return true;
  if (hasPromoVerb && hasPromoTarget) return true;
  if (hasPromoVerb && mentionsProgramSignals) return true;
  return false;
}

function isHardBlockedMediaOutletPromoText(text) {
  const normalized = normalizeText(text || "");
  if (!normalized) return false;
  if (!containsAnyTerm(normalized, MEDIA_PROMO_VERBS)) return false;
  if (!/\b(?:stiri|news|online|video)\b/.test(normalized)) return false;
  if (containsAnyTerm(normalized, MEDIA_OUTLET_TERMS)) return true;
  return /\b(?:news|stiri)\s+ro\b/.test(normalized);
}

function isLikelyMediaOutletPromotion(item) {
  const combined = [item?.title, item?.content, item?.source]
    .filter(Boolean)
    .join(" ");
  return isLikelyMediaOutletPromotionText(combined);
}

function appendSourceAttribution(article, item) {
  if (!SOURCE_ATTRIBUTION_ENABLED || !article?.content_html) return;
  if (hasSourceAttributionBlock(article.content_html)) return;

  const sourceName = cleanTitle(item?.source || "Sursa", 140);
  const sourceLinkRaw = `${item?.link || ""}`.trim();
  const sourceLink = normalizedUrl(item?.link || "");
  if (SOURCE_ATTRIBUTION_REQUIRE_LINK && !sourceLink && !sourceLinkRaw) return;

  const sourceDateText = item?.publishedAt
    ? localTimeLabel(new Date(item.publishedAt), NEWS_TIMEZONE)
    : "";
  const sourceLabel = sourceLink
    ? `<a href="${escapeHtmlAttr(
      sourceLink
    )}" rel="nofollow noopener noreferrer" target="_blank">${escapeHtmlText(
      linkLabelFromUrl(sourceLink)
    )}</a>`
    : escapeHtmlText(sourceLinkRaw);

  const lines = [
    `<p><strong>Sursa:</strong> ${escapeHtmlText(sourceName)}${sourceLabel ? ` - ${sourceLabel}` : ""}</p>`,
  ];
  if (sourceDateText) {
    lines.push(
      `<p><strong>Data sursei:</strong> ${escapeHtmlText(sourceDateText)} (${escapeHtmlText(
        NEWS_TIMEZONE
      )})</p>`
    );
  }

  article.content_html = `${article.content_html}
<aside data-source-attribution="true">
${lines.join("\n")}
</aside>`;
}

function appendEditorialNote(article) {
  if (!EDITORIAL_NOTE_ENABLED || !article?.content_html) return;
  if (hasEditorialNoteBlock(article.content_html)) return;

  const authorName = EDITORIAL_AUTHOR_NAME || "Gabriel Andrei";
  const authorProfileUrl = normalizedUrl(EDITORIAL_AUTHOR_PROFILE_URL);
  const policyUrl = normalizedUrl(EDITORIAL_POLICY_URL);
  const replyUrl = normalizedUrl(RIGHT_OF_REPLY_URL);
  const correctionEmail = CORRECTIONS_EMAIL.includes("@") ? CORRECTIONS_EMAIL : "";

  const authorLine = authorProfileUrl
    ? `<p><strong>Autor:</strong> <a href="${escapeHtmlAttr(
      authorProfileUrl
    )}" rel="noopener">${escapeHtmlText(authorName)}</a></p>`
    : `<p><strong>Autor:</strong> ${escapeHtmlText(authorName)}</p>`;

  const references = [];
  if (policyUrl) {
    references.push(
      `<a href="${escapeHtmlAttr(policyUrl)}" rel="noopener">Politica editoriala</a>`
    );
  }
  if (replyUrl) {
    references.push(
      `<a href="${escapeHtmlAttr(replyUrl)}" rel="noopener">Drept la replica</a>`
    );
  }
  if (correctionEmail) {
    references.push(
      `Corecturi: <a href="mailto:${escapeHtmlAttr(correctionEmail)}">${escapeHtmlText(
        correctionEmail
      )}</a>`
    );
  }

  const referencesLine =
    references.length > 0
      ? `<p>${references.join(" · ")}</p>`
      : "<p>Pentru corecturi, redactia actualizeaza articolul imediat ce apar date verificabile.</p>";

  article.content_html = `${article.content_html}
<section data-editorial-note="true">
${authorLine}
${referencesLine}
</section>`;
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

function qualityGateIssues(article, context = {}) {
  const issues = [];
  if (!isStrongTitle(article?.title || "")) issues.push("weak_title");
  if (BLOCK_TABLOID_TITLES && hasTabloidTitleSignals(article?.title || "")) {
    issues.push("tabloid_title");
  }
  issues.push(...hasHeadlineStyleIssues(article?.title || ""));
  if (!hasH2Heading(article?.content_html || "")) issues.push("missing_h2");
  if (ENFORCE_LENGTH_QUALITY) {
    const lead = firstParagraphText(article?.content_html || "");
    if (wordCount(lead) < MIN_LEAD_WORDS) issues.push("lead_too_short");
    const metaLength = (article?.meta_description || "").trim().length;
    if (
      metaLength < META_DESCRIPTION_MIN_CHARS ||
      metaLength > META_DESCRIPTION_MAX_CHARS
    ) {
      issues.push("meta_description_length");
    }
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
  if (SOURCE_ATTRIBUTION_ENABLED && context?.expectsSourceAttribution) {
    if (!hasSourceAttributionBlock(article?.content_html || "")) {
      issues.push("missing_source_attribution");
    }
  }
  if (EDITORIAL_NOTE_ENABLED && !hasEditorialNoteBlock(article?.content_html || "")) {
    issues.push("missing_editorial_note");
  }
  if (
    TABLE_OF_CONTENTS_ENABLED &&
    TABLE_OF_CONTENTS_REQUIRED &&
    !hasTableOfContentsBlock(article?.content_html || "")
  ) {
    issues.push("missing_toc");
  }
  if (context?.requirePremiumSections && PREMIUM_EDITORIAL_PROFILE) {
    if (PREMIUM_REQUIRE_KEY_FACTS) {
      const keyFactsCount = keyFactsListItemCount(article?.content_html || "");
      if (!hasKeyFactsSection(article?.content_html || "")) {
        issues.push("missing_key_facts_section");
      } else if (keyFactsCount < Math.max(1, PREMIUM_KEY_FACTS_MIN_ITEMS)) {
        issues.push("key_facts_too_short");
      }
    }
    if (PREMIUM_REQUIRE_WHATS_NEXT && !hasWhatsNextSection(article?.content_html || "")) {
      issues.push("missing_whats_next_section");
    }
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
  let count = 0;
  for (const [, hrefRaw] of matches) {
    const href = (hrefRaw || "").trim();
    if (!href) continue;
    if (href.startsWith("#")) continue;
    if (href.startsWith("/")) {
      count += 1;
      continue;
    }
    if (!internalHost) {
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
  if (value.startsWith("#")) return true;
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
  if (
    BLOCK_MEDIA_OUTLET_PROMO &&
    (isLikelyMediaOutletPromotion(item) ||
      isHardBlockedMediaOutletPromoText(`${item?.title || ""} ${item?.content || ""}`))
  ) {
    return false;
  }
  if (!isRecentEnough(item)) return false;
  const combined = `${item.title} ${item.content || ""}`;
  // Heuristica pe an e utilă doar când feed-ul nu oferă o dată clară.
  if (!item?.publishedAt && hasOnlyOldYears(combined)) return false;
  return true;
}

function candidateRejectionReason(item) {
  if (!item?.title) return "missing_title";
  if (isLowEditorialValueTitle(item.title)) return "low_editorial_value_title";
  if (
    BLOCK_MEDIA_OUTLET_PROMO &&
    (isLikelyMediaOutletPromotion(item) ||
      isHardBlockedMediaOutletPromoText(`${item?.title || ""} ${item?.content || ""}`))
  ) {
    return "media_outlet_promo";
  }
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

async function maybeUploadImage(article, sourceItem = null) {
  const hasDefaultImage = DEFAULT_FEATURED_MEDIA_ID > 0;
  const sourceUrl = `${sourceItem?.link || ""}`.trim();
  const unresolvedGoogleSource = sourceUrl ? isGoogleNewsArticleUrl(sourceUrl) : false;
  const sourceCandidates = Array.isArray(sourceItem?.imageCandidates)
    ? sourceItem.imageCandidates
    : [];

  if (IMAGE_DEBUG) {
    console.log(
      `Image strategy: sourceEnabled=${SOURCE_FEATURED_IMAGE_ENABLED}, sourceRequired=${SOURCE_FEATURED_IMAGE_REQUIRED}, overrideDefault=${SOURCE_FEATURED_IMAGE_OVERRIDE_DEFAULT}, defaultId=${DEFAULT_FEATURED_MEDIA_ID}, dynamic=${USE_DYNAMIC_IMAGE}, sourceUrl=${sourceUrl || "none"}, rssCandidates=${sourceCandidates.length}`
    );
  }

  if (hasDefaultImage && !SOURCE_FEATURED_IMAGE_OVERRIDE_DEFAULT) {
    if (IMAGE_DEBUG) {
      console.log(`Image selected: default media id ${DEFAULT_FEATURED_MEDIA_ID}`);
    }
    return DEFAULT_FEATURED_MEDIA_ID;
  }

  let imageId = null;
  let sourceAttempted = false;
  if (SOURCE_FEATURED_IMAGE_ENABLED) {
    try {
      if (unresolvedGoogleSource && IMAGE_DEBUG) {
        console.log("Source URL still Google News. Skipping source scrape to avoid Google logo.");
      }
      if ((sourceUrl || sourceCandidates.length > 0) && !unresolvedGoogleSource) {
        sourceAttempted = true;
        const sourceImage = await downloadImageFromSource(sourceUrl, sourceCandidates);
        if (sourceImage?.filePath) {
          imageId = await uploadImage({
            filePath: sourceImage.filePath,
            fileName: sourceImage.fileName,
            contentType: sourceImage.contentType,
            cleanupFile: true,
            title: article.seo_title || article.title,
            altText: article.title || article.focus_keyword,
            caption: article.meta_description || "",
          });
          if (imageId) {
            if (IMAGE_DEBUG) {
              console.log(`Image selected: source upload media id ${imageId}`);
            }
            return imageId;
          }
        }
      }
    } catch (err) {
      console.log("Source image skipped:", err.message);
    }
  }

  if (SOURCE_FEATURED_IMAGE_REQUIRED && (sourceAttempted || SOURCE_FEATURED_IMAGE_ENABLED)) {
    console.log("Source featured image is required but unavailable. Skipping image fallback.");
    return null;
  }

  if (hasDefaultImage) {
    if (IMAGE_DEBUG) {
      console.log(`Image selected: fallback default media id ${DEFAULT_FEATURED_MEDIA_ID}`);
    }
    return DEFAULT_FEATURED_MEDIA_ID;
  }

  if (!USE_DYNAMIC_IMAGE) {
    if (IMAGE_DEBUG) {
      console.log("Image result: none (dynamic disabled and no source/default image)");
    }
    return null;
  }

  try {
    const query = article.focus_keyword || article.title;
    if (query) {
      await downloadImage(article.focus_keyword, article.title);
      imageId = await uploadImage({
        title: article.seo_title || article.title,
        altText: article.title || article.focus_keyword,
        caption: article.meta_description || "",
      });
      if (imageId && IMAGE_DEBUG) {
        console.log(`Image selected: dynamic upload media id ${imageId}`);
      }
    }
  } catch (err) {
    console.log("Image skipped:", err.message);
  }
  return imageId;
}

async function publishPostWithRetry(
  article,
  categoryId,
  imageId,
  options = {}
) {
  const maxAttempts = Math.max(1, WP_PUBLISH_RETRIES);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await publishPost(article, categoryId, imageId, options);
      return true;
    } catch (err) {
      const retryable = isRetryablePublishError(err);
      const status = Number(err?.response?.status || 0);

      if (retryable) {
        try {
          const duplicateAfterError = await isPostDuplicate({
            title: article?.title || "",
            seoTitle: article?.seo_title || "",
            sourceTitle: options.sourceTitle || "",
            sourceUrl: options.sourceUrl || "",
            slug: options.slug || "",
          });
          if (duplicateAfterError) {
            console.warn(
              "Publish returned retryable error, but post is already present. Skipping retry."
            );
            return true;
          }
        } catch (checkErr) {
          console.warn("Post-error duplicate check failed:", checkErr.message);
        }
      }

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

async function tryPublishArticle(
  article,
  categoryId,
  sourceUrl,
  sourceTitle = "",
  sourceItem = null
) {
  if (isDuplicate({ title: article.title, sourceTitle, url: sourceUrl })) {
    console.log("Duplicate detected in history. Skipping.");
    return false;
  }

  const stableSlug = buildStablePostSlug(article, sourceUrl, sourceTitle);

  if (!article.content_html || !hasMinimumContent(article.content_html)) {
    console.log("Content too short or missing. Skipping.");
    return false;
  }

  try {
    const duplicate = await isPostDuplicate({
      title: article.title,
      seoTitle: article.seo_title,
      sourceTitle,
      sourceUrl,
      slug: stableSlug,
    });
    if (duplicate) {
      console.log("Duplicate detected in WordPress. Skipping.");
      return false;
    }
  } catch (err) {
    console.warn("WP duplicate check failed:", err.message);
  }

  const imageId = await maybeUploadImage(
    article,
    sourceItem || (sourceUrl ? { link: sourceUrl } : null)
  );

  if (REQUIRE_IMAGE && !imageId) {
    console.log("Image required but missing. Skipping.");
    return false;
  }

  try {
    await publishPostWithRetry(article, categoryId, imageId, {
      sourceUrl,
      sourceTitle,
      slug: stableSlug,
    });
  } catch (err) {
    console.error("Publish failed:", err.message);
    return false;
  }

  saveTopic({ title: article.title, url: sourceUrl });
  console.log("Published:", article.title);
  return true;
}

async function publishFromRssItem(item) {
  const sourceItem = await withResolvedSourceItem(item);

  if (isDuplicate({ title: sourceItem.title, url: sourceItem.link })) {
    console.log("Duplicate source item. Skipping:", sourceItem.title);
    return false;
  }
  if (
    BLOCK_MEDIA_OUTLET_PROMO &&
    (isLikelyMediaOutletPromotion(sourceItem) ||
      isHardBlockedMediaOutletPromoText(
        `${sourceItem?.title || ""} ${sourceItem?.content || ""}`
      ))
  ) {
    console.log("Rejected media-outlet promo item. Skipping:", sourceItem.title);
    return false;
  }

  const raw = [sourceItem.title, sourceItem.content].filter(Boolean).join("\n\n");
  const sourceRoleClaims = ROLE_FACT_CHECK_ENABLED
    ? buildSourceRoleClaims(sourceItem)
    : new Map();
  const roleConstraints = buildRoleConstraintsFromClaims(sourceRoleClaims);

  let article = await rewriteNews(raw, sourceItem.title, {
    publishedAt: sourceItem.publishedAt,
    source: sourceItem.source,
    link: sourceItem.link,
    roleConstraints,
  });

  if (!article) return false;

  if (ROLE_FACT_CHECK_ENABLED && sourceRoleClaims.size > 0) {
    let mismatches = roleMismatchSummary(sourceItem, article, sourceRoleClaims);
    if (mismatches.length > 0) {
      console.log(
        "Role mismatch detected, retrying strict factual mode:",
        formatRoleMismatchSummary(mismatches)
      );
      article = await rewriteNews(raw, sourceItem.title, {
        publishedAt: sourceItem.publishedAt,
        source: sourceItem.source,
        link: sourceItem.link,
        roleConstraints,
        strictRoleMode: true,
      });
      if (!article) return false;

      mismatches = roleMismatchSummary(sourceItem, article, sourceRoleClaims);
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
  ensureSeoFields(article, sourceItem.title);

  if (
    BLOCK_MEDIA_OUTLET_PROMO &&
    (isLikelyMediaOutletPromotionText(
      `${article?.title || ""} ${stripHtml(article?.content_html || "")}`
    ) ||
      isHardBlockedMediaOutletPromoText(
        `${article?.title || ""} ${stripHtml(article?.content_html || "")}`
      ))
  ) {
    console.log("Rejected rewritten media-outlet promo article. Skipping:", article.title);
    return false;
  }

  if (!isStrongTitle(article.title)) {
    const fallbackTitle = cleanTitle(sourceItem.title, TITLE_MAX_CHARS);
    if (!isStrongTitle(fallbackTitle) || hasHeadlineStyleIssues(fallbackTitle).length > 0) {
      console.log("Title quality too low. Skipping.");
      return false;
    }
    article.title = fallbackTitle;
    article.seo_title = cleanTitle(
      article.seo_title || fallbackTitle,
      SEO_TITLE_MAX_CHARS
    );
  }

  const headlineIssues = hasHeadlineStyleIssues(article.title);
  if (headlineIssues.length > 0) {
    const fallbackTitle = cleanTitle(sourceItem.title, TITLE_MAX_CHARS);
    if (isStrongTitle(fallbackTitle) && hasHeadlineStyleIssues(fallbackTitle).length === 0) {
      article.title = fallbackTitle;
      article.seo_title = cleanTitle(article.seo_title || fallbackTitle, SEO_TITLE_MAX_CHARS);
    } else {
      console.log(`Title style quality too low (${headlineIssues.join(", ")}). Skipping.`);
      return false;
    }
  }

  if (!hasMinimumContent(article.content_html)) {
    console.log("Sanitized content too short. Skipping.");
    return false;
  }

  const categoryDecision = resolveCategoryId(sourceItem, article);
  const targetCategoryId = categoryDecision.categoryId;
  if (categoryDecision.changed) {
    const scoreText = categories
      .map(category => `${category.name}:${categoryDecision.scores[category.id] || 0}`)
      .join(", ");
    console.log(
      `Category override: ${categoryNameById(sourceItem.categoryId)} -> ${categoryNameById(
        targetCategoryId
      )} [${categoryDecision.reason}] (${scoreText})`
    );
  } else if (categoryDecision.reason && categoryDecision.reason !== "same_as_source") {
    console.log(
      `Category kept: ${categoryNameById(targetCategoryId)} [${categoryDecision.reason}]`
    );
  }

  const linkedCount = await addInternalLinks(article, targetCategoryId);
  if (linkedCount > 0) {
    console.log(`Internal links added: ${linkedCount}`);
  }
  article.content_html = removeExternalLinks(article.content_html);
  applyPremiumEditorialStructure(article, { keyFacts: true, whatsNext: true });
  applyTableOfContents(article);
  appendSourceAttribution(article, sourceItem);
  appendEditorialNote(article);

  if (STRICT_QUALITY_GATE) {
    const issues = qualityGateIssues(article, {
      expectsSourceAttribution: Boolean(sourceItem?.link),
      requirePremiumSections: true,
    });
    if (issues.length > 0) {
      console.log("Quality gate failed:", issues.join(", "));
      return false;
    }
  }

  return tryPublishArticle(
    article,
    targetCategoryId,
    sourceItem.link,
    sourceItem.title,
    sourceItem
  );
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
    const targetCategoryId = FORCE_CATEGORY_ID > 0 ? FORCE_CATEGORY_ID : cat.id;

    article.content_html = sanitizeContent(article.content_html);
    ensureSeoFields(article, article.title);

    if (
      BLOCK_MEDIA_OUTLET_PROMO &&
      (isLikelyMediaOutletPromotionText(
        `${article?.title || ""} ${stripHtml(article?.content_html || "")}`
      ) ||
        isHardBlockedMediaOutletPromoText(
          `${article?.title || ""} ${stripHtml(article?.content_html || "")}`
        ))
    ) {
      console.log("Rejected fallback media-outlet promo article:", article.title);
      continue;
    }

    if (!isStrongTitle(article.title)) {
      console.log("Fallback title quality too low. Trying next category.");
      continue;
    }
    const fallbackHeadlineIssues = hasHeadlineStyleIssues(article.title);
    if (fallbackHeadlineIssues.length > 0) {
      console.log(
        `Fallback title style too low (${fallbackHeadlineIssues.join(", ")}). Trying next category.`
      );
      continue;
    }

    if (!hasMinimumContent(article.content_html)) {
      console.log("Sanitized content too short. Skipping fallback article.");
      continue;
    }

    const linkedCount = await addInternalLinks(article, targetCategoryId);
    if (linkedCount > 0) {
      console.log(`Fallback internal links added: ${linkedCount}`);
    }
    article.content_html = removeExternalLinks(article.content_html);
    applyPremiumEditorialStructure(article, { keyFacts: true, whatsNext: true });
    applyTableOfContents(article);
    appendEditorialNote(article);

    if (STRICT_QUALITY_GATE) {
      const issues = qualityGateIssues(article, {
        expectsSourceAttribution: false,
        requirePremiumSections: true,
      });
      if (issues.length > 0) {
        console.log("Fallback quality gate failed:", issues.join(", "));
        continue;
      }
    }

    const success = await tryPublishArticle(article, targetCategoryId, null, article.title);
    if (success) return true;
  }

  return false;
}

async function maybePublishHowToDaily() {
  if (!HOWTO_DAILY_ENABLED) return 0;
  if (HOWTO_DAILY_CATEGORY_ID <= 0 || HOWTO_DAILY_TARGET <= 0) return 0;

  let todayCount = 0;
  try {
    todayCount = await countPostsPublishedTodayByCategory(HOWTO_DAILY_CATEGORY_ID, {
      timeZone: HOWTO_DAILY_TIMEZONE,
    });
  } catch (err) {
    console.warn("HowTo count failed:", err.message);
    return 0;
  }

  if (todayCount >= HOWTO_DAILY_TARGET) {
    console.log(
      `HowTo quota reached: ${todayCount}/${HOWTO_DAILY_TARGET} for ${HOWTO_DAILY_TIMEZONE}`
    );
    return 0;
  }

  const slots = HOWTO_DAILY_SLOTS.length > 0
    ? HOWTO_DAILY_SLOTS
    : parseHowToSlots("10:15,18:15");
  const now = new Date();
  const localNow = localTimeParts(now, HOWTO_DAILY_TIMEZONE);
  const nowMinuteOfDay = minutesOfDay(localNow);

  const openedSlotsCount = slots.filter(slotMinute => nowMinuteOfDay >= slotMinute).length;
  if (openedSlotsCount === 0) {
    console.log(
      `HowTo waiting first slot (${slots.map(hhmmFromMinutes).join(", ")}) in ${HOWTO_DAILY_TIMEZONE}`
    );
    return 0;
  }

  const activeSlot = slots.find(slotMinute => {
    const lower = slotMinute;
    const upper = slotMinute + HOWTO_SLOT_GRACE_MINUTES;
    return nowMinuteOfDay >= lower && nowMinuteOfDay <= upper;
  });

  if (HOWTO_SLOT_STRICT && !Number.isFinite(activeSlot)) {
    console.log(
      `HowTo slot closed now (${hhmmFromMinutes(nowMinuteOfDay)} ${HOWTO_DAILY_TIMEZONE}); slots: ${slots
        .map(hhmmFromMinutes)
        .join(", ")}`
    );
    return 0;
  }

  const allowedByNow = Math.min(HOWTO_DAILY_TARGET, openedSlotsCount);
  const allowedRemaining = allowedByNow - todayCount;
  if (allowedRemaining <= 0) {
    console.log(
      `HowTo already at allowed slot quota: ${todayCount}/${allowedByNow} now (${HOWTO_DAILY_TIMEZONE})`
    );
    return 0;
  }

  const maxThisRun = Math.max(1, HOWTO_DAILY_POSTS_PER_RUN);
  const remaining = Math.min(HOWTO_DAILY_TARGET - todayCount, allowedRemaining);
  const toPublish = Math.min(remaining, maxThisRun);
  let published = 0;

  for (let i = 0; i < toPublish; i += 1) {
    const article = await generateHowToArticle(HOWTO_TOPIC_HINT);
    if (!article) break;

    article.content_html = sanitizeContent(article.content_html);
    ensureSeoFields(article, article.title);

    if (!isStrongTitle(article.title)) {
      console.log("HowTo title quality too low. Skipping.");
      continue;
    }

    if (!hasMinimumContent(article.content_html)) {
      console.log("HowTo content too short. Skipping.");
      continue;
    }

    const linkedCount = await addInternalLinks(article, HOWTO_DAILY_CATEGORY_ID);
    if (linkedCount > 0) {
      console.log(`HowTo internal links added: ${linkedCount}`);
    }
    article.content_html = removeExternalLinks(article.content_html);
    applyTableOfContents(article);
    appendEditorialNote(article);

    if (STRICT_QUALITY_GATE) {
      const issues = qualityGateIssues(article, {
        expectsSourceAttribution: false,
      });
      if (issues.length > 0) {
        console.log("HowTo quality gate failed:", issues.join(", "));
        continue;
      }
    }

    const success = await tryPublishArticle(
      article,
      HOWTO_DAILY_CATEGORY_ID,
      null,
      article.title
    );
    if (success) {
      published += 1;
      todayCount += 1;
    }
  }

  return published;
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

  let howToPublished = 0;
  if (HOWTO_DAILY_ENABLED) {
    howToPublished = await maybePublishHowToDaily();
  }

  console.log(
    `DONE – published ${published} news article(s) and ${howToPublished} how-to article(s)`
  );
  process.exit(0);
}

run();
