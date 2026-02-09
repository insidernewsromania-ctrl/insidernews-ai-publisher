// src/rss.js
import Parser from "rss-parser";
import crypto from "crypto";
import {
  ROMANIA_SOURCES,
  EXTERNE_SOURCES,
  MIX,
} from "./sources.js";

const parser = new Parser();
const seen = new Set(); // deduplicare in-run

function hash(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

async function fetchSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    return feed.items.slice(0, source.maxPerRun).map(item => ({
      title: item.title || "",
      content:
        item.contentSnippet ||
        item.content ||
        item.summary ||
        "",
      link: item.link,
      categoryId: source.categoryId,
      source: source.name,
    }));
  } catch (err) {
    console.error("RSS ERROR:", source.name, err.message);
    return [];
  }
}

function dedupe(items) {
  return items.filter(item => {
    const h = hash(item.title.toLowerCase());
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

export async function collectNews(limit) {
  const romaniaTarget = Math.round(limit * MIX.romania);
  const externeTarget = limit - romaniaTarget;

  let romania = [];
  let externe = [];

  for (const src of ROMANIA_SOURCES) {
    if (romania.length >= romaniaTarget) break;
    romania.push(...(await fetchSource(src)));
  }

  for (const src of EXTERNE_SOURCES) {
    if (externe.length >= externeTarget) break;
    externe.push(...(await fetchSource(src)));
  }

  romania = dedupe(romania).slice(0, romaniaTarget);
  externe = dedupe(externe).slice(0, externeTarget);

  // fallback: dacă nu sunt suficiente externe
  if (externe.length < externeTarget) {
    const needed = externeTarget - externe.length;
    romania.push(...romania.slice(0, needed));
  }

  return [...romania, ...externe];
}
