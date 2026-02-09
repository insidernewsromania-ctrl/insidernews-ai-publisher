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
