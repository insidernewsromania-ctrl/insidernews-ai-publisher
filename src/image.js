import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const HTTP_TIMEOUT_MS = Number(process.env.SOURCE_IMAGE_TIMEOUT_MS || "12000");
const MIN_IMAGE_BYTES = Number(process.env.SOURCE_IMAGE_MIN_BYTES || "12000");
const SCRAPE_ENABLED = process.env.SOURCE_IMAGE_SCRAPE_ENABLED !== "false";

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function toAbsoluteUrl(value, baseUrl = "") {
  if (!value) return "";
  const raw = `${value}`.trim();
  if (!raw) return "";
  if (isHttpUrl(raw)) return raw;
  try {
    if (baseUrl) return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
  return "";
}

function fileExtFromContentType(contentType = "") {
  const normalized = `${contentType}`.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "jpg";
}

function looksDecorativeImage(url) {
  const normalized = `${url || ""}`.toLowerCase();
  return /(?:logo|icon|favicon|avatar|sprite|ads?|banner|watermark)/.test(normalized);
}

function uniqueUrls(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const raw = `${value || ""}`.trim();
    if (!raw) continue;
    const normalized = raw.replace(/#.*$/, "");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(raw);
  }
  return output;
}

function extractImageCandidatesFromHtml(html, baseUrl = "") {
  const source = `${html || ""}`;
  if (!source) return [];
  const candidates = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/gi,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const absolute = toAbsoluteUrl(match[1], baseUrl);
      if (!absolute) continue;
      candidates.push(absolute);
      if (candidates.length >= 30) break;
    }
  }
  return uniqueUrls(candidates);
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: HTTP_TIMEOUT_MS,
    maxRedirects: 5,
    responseType: "text",
    headers: {
      "User-Agent": "insidernews-ai-publisher/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  return `${res?.data || ""}`;
}

function ensureTempDir() {
  const dir = "tmp";
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tempImagePath(url, ext) {
  const digest = crypto
    .createHash("sha1")
    .update(`${url}|${Date.now()}`)
    .digest("hex")
    .slice(0, 12);
  return path.join(ensureTempDir(), `featured-${digest}.${ext}`);
}

async function downloadImageUrl(url) {
  const res = await axios.get(url, {
    timeout: HTTP_TIMEOUT_MS,
    maxRedirects: 5,
    responseType: "arraybuffer",
    headers: {
      "User-Agent": "insidernews-ai-publisher/1.0",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  const contentType = `${res?.headers?.["content-type"] || ""}`.toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`Invalid source image content-type: ${contentType || "unknown"}`);
  }
  const bytes = Buffer.byteLength(res.data || Buffer.alloc(0));
  if (bytes < MIN_IMAGE_BYTES) {
    throw new Error(`Source image too small (${bytes} bytes)`);
  }
  const ext = fileExtFromContentType(contentType);
  const filePath = tempImagePath(url, ext);
  fs.writeFileSync(filePath, res.data);
  return {
    filePath,
    fileName: path.basename(filePath),
    contentType: contentType.split(";")[0].trim(),
  };
}

export async function downloadImageFromSource(sourceUrl, rssImageCandidates = []) {
  const initial = uniqueUrls(
    (Array.isArray(rssImageCandidates) ? rssImageCandidates : [])
      .map(candidate => toAbsoluteUrl(candidate, sourceUrl))
      .filter(Boolean)
  );

  let htmlCandidates = [];
  if (SCRAPE_ENABLED && isHttpUrl(sourceUrl)) {
    try {
      const html = await fetchHtml(sourceUrl);
      htmlCandidates = extractImageCandidatesFromHtml(html, sourceUrl);
    } catch (err) {
      console.log("Source image HTML scrape skipped:", err.message);
    }
  }

  const allCandidates = uniqueUrls([...initial, ...htmlCandidates]).filter(
    candidate => !looksDecorativeImage(candidate)
  );
  if (allCandidates.length === 0) {
    throw new Error("No source image candidates");
  }

  let lastError = null;
  for (const candidate of allCandidates.slice(0, 10)) {
    try {
      return await downloadImageUrl(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No valid source image downloaded");
}

function pickQuery(primary, fallback) {
  const clean = value => (value || "").toString().trim();
  const first = clean(primary);
  if (first) return first;
  const second = clean(fallback);
  if (second) return second;
  return "";
}

export async function downloadImage(keyword, fallbackKeyword) {
  const query = pickQuery(keyword, fallbackKeyword);
  if (!query) {
    throw new Error("Missing image query");
  }
  const url = `https://source.unsplash.com/1600x900/?${encodeURIComponent(query)}`;
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const contentType = res.headers?.["content-type"] || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Invalid image response");
  }
  fs.writeFileSync("image.jpg", res.data);
}
