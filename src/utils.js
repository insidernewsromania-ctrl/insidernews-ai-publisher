export function normalizeText(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['"`’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(text, maxLength = 80) {
  if (!text) return "";
  const normalized = normalizeText(text).replace(/\s+/g, "-");
  return normalized.replace(/-+/g, "-").slice(0, maxLength).replace(/^-|-$/g, "");
}

export function stripHtml(text) {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, " ");
}

export function wordCount(text) {
  const stripped = stripHtml(text).trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

export function truncate(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd();
}

export function truncateAtWord(text, maxLength) {
  if (!text) return "";
  const normalized = text.toString().replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const sample = normalized.slice(0, maxLength + 1);
  const lastSpace = sample.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return sample.slice(0, lastSpace).trimEnd();
  }
  return normalized.slice(0, maxLength).trimEnd();
}

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

const INCOMPLETE_CONNECTOR_SEQUENCES = [
  ["in", "timp", "ce"],
  ["dupa", "ce"],
  ["pe", "cand"],
  ["pentru", "ca"],
  ["deoarece"],
  ["fiindca"],
  ["intrucat"],
  ["in", "conditiile", "in", "care"],
  ["in", "contextul", "in", "care"],
];

const PUBLISHER_SUFFIX_HINTS = [
  "agerpres",
  "mediafax",
  "digi24",
  "hotnews",
  "g4media",
  "stirileprotv",
  "economica",
  "spotmedia",
  "observator",
  "libertatea",
  "adevarul",
  "euronews",
  "antena3",
  "tvrinfo",
  "wall street",
  "startupcafe",
  "profit",
  "biziday",
  "news ro",
  "zf",
  "google news",
];

const SOURCE_ATTRIBUTION_CUES = [
  "potrivit",
  "conform",
  "citand",
  "citeaza",
  "scrie",
  "anunta",
  "transmite",
  "informeaza",
  "relateaza",
];

const TOPIC_NOISE_TOKENS = new Set([
  "a",
  "al",
  "ale",
  "anunta",
  "anuntat",
  "anuntata",
  "anuntate",
  "au",
  "ca",
  "care",
  "catre",
  "ce",
  "com",
  "conform",
  "cu",
  "de",
  "despre",
  "din",
  "dupa",
  "este",
  "fata",
  "fi",
  "for",
  "g4",
  "g4media",
  "in",
  "insa",
  "la",
  "libertatea",
  "media",
  "mediafax",
  "news",
  "newsro",
  "online",
  "or",
  "pe",
  "pentru",
  "profit",
  "protv",
  "potrivit",
  "prin",
  "publica",
  "publicat",
  "publicata",
  "publicate",
  "ro",
  "sau",
  "si",
  "site",
  "stirileprotv",
  "stiri",
  "the",
  "to",
  "tv",
  "digi24",
  "hotnews",
  "adevarul",
  "euronews",
  "observator",
  "antena3",
  "un",
  "unei",
  "unor",
  "www",
]);

function looksLikePublisherSuffix(text) {
  if (!text) return false;
  const normalized = normalizeText(text);
  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (
    normalized.includes("news") ||
    normalized.includes("stiri") ||
    normalized.includes("tv") ||
    normalized.includes("radio") ||
    text.includes(".")
  ) {
    return true;
  }
  return PUBLISHER_SUFFIX_HINTS.some(hint => normalized.includes(hint));
}

function trimPublisherSuffix(text) {
  const segments = (text || "")
    .split(/\s[-–—|]\s/g)
    .map(segment => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return text || "";
  const suffix = segments[segments.length - 1];
  if (!looksLikePublisherSuffix(suffix)) return text || "";
  return segments.slice(0, -1).join(" - ").trim();
}

function looksLikeMediaSourceFragment(text) {
  if (!text) return false;
  if (looksLikePublisherSuffix(text)) return true;
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (/\b[a-z0-9-]+\.[a-z]{2,}\b/.test(normalized)) return true;
  if (
    normalized.includes("news") ||
    normalized.includes("media") ||
    normalized.includes("tv")
  ) {
    return true;
  }
  return false;
}

function trimSourceAttributionSuffix(text) {
  let current = (text || "").toString().trim();
  if (!current) return "";
  for (let i = 0; i < 2; i += 1) {
    const match = current.match(
      /(?:,\s*|\s[-–—|]\s*)(potrivit|conform|citand|citeaza|scrie|anunta|transmite|informeaza|relateaza)\s+([^,;:.!?]+)$/i
    );
    if (!match || typeof match.index !== "number") break;
    const cue = normalizeText(match[1] || "");
    if (!SOURCE_ATTRIBUTION_CUES.includes(cue)) break;
    const sourcePart = (match[2] || "").trim();
    if (!looksLikeMediaSourceFragment(sourcePart)) break;
    current = current
      .slice(0, match.index)
      .replace(/[-–—:;,.!? ]+$/, "")
      .trim();
  }
  return current;
}

function hasWordSequenceAt(words, startIndex, sequence) {
  if (startIndex < 0 || startIndex + sequence.length > words.length) return false;
  for (let index = 0; index < sequence.length; index += 1) {
    if (words[startIndex + index] !== sequence[index]) return false;
  }
  return true;
}

function getIncompleteEndingWordCount(normalizedText) {
  const words = (normalizedText || "").split(" ").filter(Boolean);
  if (words.length < 6) return 0;
  for (const sequence of INCOMPLETE_CONNECTOR_SEQUENCES) {
    for (let tail = 0; tail <= 2; tail += 1) {
      const take = sequence.length + tail;
      if (take >= words.length) continue;
      const startIndex = words.length - take;
      if (hasWordSequenceAt(words, startIndex, sequence)) {
        return take;
      }
    }
  }
  return 0;
}

function trimIncompleteEnding(text) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length < 6) return text || "";
  const normalized = normalizeText(words.join(" "));
  const removeCount = getIncompleteEndingWordCount(normalized);
  if (removeCount <= 0) return text || "";
  if (words.length - removeCount < 5) return text || "";
  return words
    .slice(0, words.length - removeCount)
    .join(" ")
    .replace(/[-–—:;,.!? ]+$/, "")
    .trim();
}

function trimTrailingStopwords(text) {
  let current = text || "";
  for (let i = 0; i < 3; i += 1) {
    const words = current.split(/\s+/).filter(Boolean);
    if (words.length < 5) return current;
    const lastWord = words[words.length - 1];
    const lastNorm = normalizeText(lastWord);
    if (!TITLE_END_STOPWORDS.has(lastNorm)) return current;
    words.pop();
    current = words.join(" ").replace(/[-–—:;,.!? ]+$/, "").trim();
  }
  return current;
}

export function cleanTitle(text, maxLength = 110) {
  if (!text) return "";
  const withoutAttribution = trimSourceAttributionSuffix(text.toString());
  const withoutSuffix = trimPublisherSuffix(withoutAttribution);
  const normalized = withoutSuffix
    .toString()
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .replace(/^[-–—:;,.!? ]+/, "")
    .replace(/[-–—:;,.!? ]+$/, "");
  const truncated = truncateAtWord(normalized, maxLength);
  const trimmedStopwords = trimTrailingStopwords(truncated);
  return trimTrailingStopwords(trimIncompleteEnding(trimmedStopwords));
}

export function buildTopicKey(text, maxTokens = 8) {
  const cleaned = trimSourceAttributionSuffix(cleanTitle(text || "", 220));
  const normalized = normalizeText(cleaned);
  if (!normalized) return "";
  const tokens = normalized
    .split(" ")
    .filter(Boolean)
    .filter(token => token.length >= 3)
    .filter(token => !TOPIC_NOISE_TOKENS.has(token))
    .filter(token => !/^\d+$/.test(token));
  if (tokens.length === 0) return "";
  const limit = Number.isFinite(maxTokens)
    ? Math.max(3, Math.floor(maxTokens))
    : 8;
  return tokens.slice(0, limit).join(" ");
}

export function topicTokens(text, maxTokens = 12) {
  const key = buildTopicKey(text, maxTokens);
  return key ? key.split(" ") : [];
}

export function topicOverlapRatio(aTokens = [], bTokens = []) {
  if (!Array.isArray(aTokens) || !Array.isArray(bTokens)) return 0;
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const a = new Set(aTokens.filter(Boolean));
  const b = new Set(bTokens.filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  const denominator = Math.min(a.size, b.size);
  if (denominator === 0) return 0;
  return overlap / denominator;
}

export function hasSuspiciousTitleEnding(text) {
  if (!text) return true;
  const normalized = normalizeText(text);
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 5) return true;
  if (/[,:;/-]$/.test(text.trim())) return true;
  const last = words[words.length - 1];
  if (TITLE_END_STOPWORDS.has(last)) return true;
  if (getIncompleteEndingWordCount(normalized) > 0) return true;
  return false;
}

export function isStrongTitle(text, minWords = 5) {
  const cleaned = cleanTitle(text || "", 170);
  const words = normalizeText(cleaned).split(" ").filter(Boolean);
  if (words.length < minWords) return false;
  return !hasSuspiciousTitleEnding(cleaned);
}

export function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value) continue;
    const clean = value.toString().trim();
    if (!clean) continue;
    const key = normalizeText(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function hoursSince(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return diffMs / (1000 * 60 * 60);
}

export function isRecent(dateValue, maxHours) {
  const hours = hoursSince(dateValue);
  if (hours === null) return false;
  return hours <= maxHours;
}

function dayKey(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

export function isSameCalendarDay(
  dateValue,
  referenceDate = new Date(),
  timeZone = "Europe/Bucharest"
) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const reference = new Date(referenceDate);
  if (Number.isNaN(reference.getTime())) return false;
  return dayKey(date, timeZone) === dayKey(reference, timeZone);
}
