import fs from "fs";
import {
  buildTopicKey,
  normalizeText,
  topicOverlapRatio,
  topicTokens,
} from "./utils.js";

const FILE = "data/used_topics.json";
const MAX_ITEMS = 500;
const MAX_DAYS = 30;

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const TOPIC_DEDUP_ENABLED = process.env.TOPIC_DEDUP_ENABLED !== "false";
const TOPIC_DEDUP_HOURS = parsePositiveNumber(process.env.TOPIC_DEDUP_HOURS || "96", 96);
const TOPIC_OVERLAP_MIN = Math.floor(
  parsePositiveNumber(process.env.TOPIC_OVERLAP_MIN || "4", 4)
);
const TOPIC_OVERLAP_RATIO = parsePositiveNumber(
  process.env.TOPIC_OVERLAP_RATIO || "0.8",
  0.8
);

let cache = null;

function toTopicTokens(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map(token => `${token || ""}`.trim()).filter(Boolean))];
  }
  return topicTokens(value);
}

function normalizedTopicKey(inputTitle, inputSourceTitle = "") {
  const fromSource = buildTopicKey(inputSourceTitle || "");
  if (fromSource) return fromSource;
  return buildTopicKey(inputTitle || "");
}

function readHistory() {
  if (cache) return cache;
  if (!fs.existsSync(FILE)) {
    cache = [];
    return cache;
  }
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    if (!raw.trim()) {
      cache = [];
      return cache;
    }
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
      cache = [];
      return cache;
    }
    if (data.length > 0 && typeof data[0] === "string") {
      cache = data.map(title => {
        const topicKey = normalizedTopicKey(title, "");
        return {
          key: normalizeText(title),
          title,
          sourceTitle: null,
          url: null,
          topicKey: topicKey || null,
          topicTokens: toTopicTokens(topicKey),
          date: null,
        };
      });
      return cache;
    }
    cache = data
      .filter(Boolean)
      .map(item => {
        const title = item?.title || "";
        const sourceTitle = item?.sourceTitle || "";
        const key = item?.key || normalizeText(title);
        const topicKey = item?.topicKey || normalizedTopicKey(title, sourceTitle);
        return {
          ...item,
          key,
          topicKey: topicKey || null,
          topicTokens: toTopicTokens(item?.topicTokens || topicKey),
        };
      });
    return cache;
  } catch (err) {
    console.warn("HISTORY ERROR:", err.message);
    cache = [];
    return cache;
  }
}

function writeHistory(items) {
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
  cache = items;
}

function pruneHistory(items) {
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  const filtered = items.filter(item => {
    if (!item?.date) return true;
    const date = new Date(item.date);
    if (Number.isNaN(date.getTime())) return true;
    return date.getTime() >= cutoff;
  });
  return filtered.slice(-MAX_ITEMS);
}

function normalizeInput(input) {
  if (!input) return { title: "", sourceTitle: "", url: "" };
  if (typeof input === "string") return { title: input, sourceTitle: "", url: "" };
  return {
    title: input.title || "",
    sourceTitle: input.sourceTitle || "",
    url: input.url || "",
  };
}

function isRecentForTopicDedup(item) {
  if (!item?.date) return false;
  const date = new Date(item.date);
  if (Number.isNaN(date.getTime())) return false;
  const hours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  return hours <= TOPIC_DEDUP_HOURS;
}

function overlapCount(aTokens = [], bTokens = []) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function isTopicNearDuplicate(aTokens, bTokens) {
  if (!Array.isArray(aTokens) || !Array.isArray(bTokens)) return false;
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  const ratio = topicOverlapRatio(aTokens, bTokens);
  if (ratio < TOPIC_OVERLAP_RATIO) return false;
  return overlapCount(aTokens, bTokens) >= TOPIC_OVERLAP_MIN;
}

function historyItemTopicKey(item) {
  if (!item) return "";
  if (item.topicKey) return item.topicKey;
  return normalizedTopicKey(item.title || "", item.sourceTitle || "");
}

function isTopicDuplicateByHistory(inputTopicKey, inputTopicTokens, historyItem) {
  if (!TOPIC_DEDUP_ENABLED || !inputTopicKey) return false;
  if (!isRecentForTopicDedup(historyItem)) return false;
  const existingTopicKey = historyItemTopicKey(historyItem);
  if (!existingTopicKey) return false;
  if (existingTopicKey === inputTopicKey) return true;
  const existingTokens = toTopicTokens(historyItem.topicTokens || existingTopicKey);
  return isTopicNearDuplicate(inputTopicTokens, existingTokens);
}

export function isDuplicate(input) {
  const { title, sourceTitle, url } = normalizeInput(input);
  if (!title && !url && !sourceTitle) return false;
  const history = readHistory();
  const key = normalizeText(title);
  const topicKey = normalizedTopicKey(title, sourceTitle);
  const topicTokenList = toTopicTokens(topicKey);
  return history.some(item => {
    if (url && item.url && item.url === url) return true;
    if (key && item.key && item.key === key) return true;
    return isTopicDuplicateByHistory(topicKey, topicTokenList, item);
  });
}

export function saveTopic(input) {
  const { title, sourceTitle, url } = normalizeInput(input);
  if (!title && !url && !sourceTitle) return;
  const history = readHistory();
  const key = normalizeText(title);
  const topicKey = normalizedTopicKey(title, sourceTitle);
  const topicTokenList = toTopicTokens(topicKey);
  const exists = history.some(item => {
    if (url && item.url && item.url === url) return true;
    if (key && item.key && item.key === key) return true;
    return isTopicDuplicateByHistory(topicKey, topicTokenList, item);
  });
  if (exists) return;
  const next = pruneHistory([
    ...history,
    {
      key,
      title,
      sourceTitle: sourceTitle || null,
      url: url || null,
      topicKey: topicKey || null,
      topicTokens: topicTokenList,
      date: new Date().toISOString(),
    },
  ]);
  writeHistory(next);
}
