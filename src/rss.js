// src/rss.js
import Parser from "rss-parser";
import crypto from "crypto";
import {
  ROMANIA_SOURCES,
  EXTERNE_SOURCES,
  MIX,
} from "./sources.js";
import { normalizeText } from "./utils.js";

const parser = new Parser({
  timeout: Number(process.env.RSS_TIMEOUT_MS || "15000"),
  headers: {
    "User-Agent": "insidernews-ai-publisher/1.0",
  },
});

function hash(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function canonicalLink(link) {
  if (!link) return "";
  try {
    const parsed = new URL(link);
    return `${parsed.hostname}${parsed.pathname}`
      .replace(/\/+$/, "")
      .toLowerCase();
  } catch {
    return link.toString().trim().toLowerCase();
  }
}

function buildItemKey(item) {
  const titleKey = normalizeText(item?.title || "");
  const linkKey = canonicalLink(item?.link);
  const guidKey = `${item?.guid || ""}`.toString().trim().toLowerCase();
  if (!titleKey && !linkKey && !guidKey) return "";
  return hash(`${titleKey}|${linkKey}|${guidKey}`);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractHtmlImageSources(html = "") {
  const source = `${html || ""}`;
  if (!source) return [];
  const matches = [];
  const pattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    matches.push(match[1]);
    if (matches.length >= 12) break;
  }
  return matches;
}

function extractMediaUrls(mediaValue) {
  const values = [];
  for (const entry of asArray(mediaValue)) {
    if (!entry) continue;
    if (typeof entry === "string") {
      values.push(entry);
      continue;
    }
    if (typeof entry?.url === "string") values.push(entry.url);
    if (typeof entry?.href === "string") values.push(entry.href);
    if (typeof entry?.link === "string") values.push(entry.link);
    if (typeof entry?.$?.url === "string") values.push(entry.$.url);
    if (typeof entry?.$?.href === "string") values.push(entry.$.href);
  }
  return values;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const raw of values) {
    const value = `${raw || ""}`.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function extractImageCandidates(item) {
  const candidates = [
    item?.enclosure?.url,
    item?.enclosure?.link,
    item?.image?.url,
    item?.image,
    item?.itunes?.image,
    item?.["itunes:image"]?.href,
    item?.["media:thumbnail"]?.url,
    item?.["media:thumbnail"]?.href,
    ...extractMediaUrls(item?.["media:content"]),
    ...extractMediaUrls(item?.["media:thumbnail"]),
    ...extractHtmlImageSources(item?.content),
    ...extractHtmlImageSources(item?.["content:encoded"]),
  ];
  return uniqueStrings(candidates);
}
function shuffle(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function publishedTimestamp(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

function sortByRecency(items) {
  return [...items].sort(
    (a, b) => publishedTimestamp(b?.publishedAt) - publishedTimestamp(a?.publishedAt)
  );
}

async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    const normalized = (feed.items || [])
      .map(item => ({
        title: item.title || "",
        content:
          item.contentSnippet ||
          item.content ||
          item.summary ||
          "",
        link: item.link || item.guid || "",
        guid: item.guid || item.id || "",
        categoryId: source.categoryId,
        source: source.name,
        publishedAt: item.isoDate || item.pubDate || item.published || null,
        imageCandidates: extractImageCandidates(item),
      }))
      .filter(item => item.title || item.content);
    return sortByRecency(normalized).slice(0, source.maxPerRun);
  } catch (err) {
    console.error("RSS ERROR:", source.name, err.message);
    return [];
  }
}

function dedupe(items, seen = new Set()) {
  const output = [];
  for (const item of items) {
    const key = buildItemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function collectFromSources(sources, target, seen) {
  if (target <= 0 || sources.length === 0) return [];
  const ordered = shuffle(sources);
  const collected = [];
  for (const source of ordered) {
    collected.push(...(await fetchSource(source)));
  }
  const unique = dedupe(collected, seen);
  return sortByRecency(unique).slice(0, target);
}

export async function collectNews(limit) {
  const target = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  if (target === 0) return [];

  const seen = new Set();
  const romaniaTarget = Math.round(target * MIX.romania);
  const externeTarget = Math.max(0, target - romaniaTarget);

  const romania = await collectFromSources(
    ROMANIA_SOURCES,
    romaniaTarget,
    seen
  );
  const externe = await collectFromSources(
    EXTERNE_SOURCES,
    externeTarget,
    seen
  );

  let combined = [...romania, ...externe];

  if (combined.length < target) {
    const topUp = await collectFromSources(
      ROMANIA_SOURCES,
      target - combined.length,
      seen
    );
    combined = [...combined, ...topUp];
  }

  return combined.slice(0, target);
}
