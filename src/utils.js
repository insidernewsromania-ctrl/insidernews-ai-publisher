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
  const normalized = text
    .toString()
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .replace(/^[-–—:;,.!? ]+/, "")
    .replace(/[-–—:;,.!? ]+$/, "");
  const truncated = truncateAtWord(normalized, maxLength);
  return trimTrailingStopwords(truncated);
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
