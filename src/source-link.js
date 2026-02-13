import { createRequire } from "module";

const require = createRequire(import.meta.url);

let GoogleDecoderCtor = null;
try {
  ({ GoogleDecoder: GoogleDecoderCtor } = require("google-news-url-decoder"));
} catch {
  GoogleDecoderCtor = null;
}

const decoder = GoogleDecoderCtor ? new GoogleDecoderCtor() : null;
const cache = new Map();

const GOOGLE_NEWS_DECODE_ENABLED = process.env.GOOGLE_NEWS_DECODE_ENABLED !== "false";
const GOOGLE_NEWS_DECODE_TIMEOUT_MS = Number(
  process.env.GOOGLE_NEWS_DECODE_TIMEOUT_MS || "7000"
);

function sanitizeUrl(url) {
  const value = `${url || ""}`.trim();
  if (!value) return "";
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

function withTimeout(promise, timeoutMs) {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 7000;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`decode timeout after ${timeout}ms`)), timeout);
    }),
  ]);
}

export function isGoogleNewsArticleUrl(url) {
  const value = sanitizeUrl(url);
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if ((parsed.hostname || "").toLowerCase() !== "news.google.com") return false;
    const path = (parsed.pathname || "").toLowerCase();
    return path.includes("/rss/articles/") || path.includes("/articles/") || path.includes("/read/");
  } catch {
    return false;
  }
}

function sourceNameFromTitleSuffix(title) {
  const value = `${title || ""}`.trim();
  if (!value) return "";
  const match = value.match(/\s[-–—]\s([^–—-]{2,80})$/);
  if (!match) return "";
  const candidate = (match[1] || "").trim();
  if (!candidate) return "";
  if (/^(breaking|live|ultima ora)$/i.test(candidate)) return "";
  return candidate;
}

function sourceNameFromUrl(url) {
  const value = sanitizeUrl(url);
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return (parsed.hostname || "").replace(/^www\./i, "").trim();
  } catch {
    return "";
  }
}

export function resolveSourceName(item, sourceUrl = "") {
  const current = `${item?.source || ""}`.trim();
  const fromTitle = sourceNameFromTitleSuffix(item?.title || "");
  const fromUrl = sourceNameFromUrl(sourceUrl || item?.link || "");
  const currentIsGenericGoogle = /^google news/i.test(current);
  if (fromTitle) {
    if (currentIsGenericGoogle || !current) return fromTitle;
    return current;
  }
  if (currentIsGenericGoogle && fromUrl) return fromUrl;
  return current || fromUrl || "Sursa";
}

export async function resolveCanonicalSourceUrl(inputUrl) {
  const originalUrl = sanitizeUrl(inputUrl);
  if (!originalUrl) return "";
  if (!isGoogleNewsArticleUrl(originalUrl)) return originalUrl;
  if (!GOOGLE_NEWS_DECODE_ENABLED || !decoder) return originalUrl;
  if (cache.has(originalUrl)) return cache.get(originalUrl) || originalUrl;

  let resolved = originalUrl;
  try {
    const result = await withTimeout(
      decoder.decode(originalUrl),
      GOOGLE_NEWS_DECODE_TIMEOUT_MS
    );
    const decodedUrl = sanitizeUrl(result?.decoded_url || "");
    if (result?.status && decodedUrl && !isGoogleNewsArticleUrl(decodedUrl)) {
      resolved = decodedUrl;
    }
  } catch {
    resolved = originalUrl;
  }

  cache.set(originalUrl, resolved);
  return resolved;
}
