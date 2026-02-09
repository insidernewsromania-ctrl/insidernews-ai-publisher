import fs from "fs";
import { normalizeText } from "./utils.js";

const FILE = "data/used_topics.json";
const MAX_ITEMS = 500;
const MAX_DAYS = 30;

let cache = null;

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
      cache = data.map(title => ({
        key: normalizeText(title),
        title,
        url: null,
        date: null,
      }));
      return cache;
    }
    cache = data.filter(Boolean);
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
  if (!input) return { title: "", url: "" };
  if (typeof input === "string") return { title: input, url: "" };
  return {
    title: input.title || "",
    url: input.url || "",
  };
}

export function isDuplicate(input) {
  const { title, url } = normalizeInput(input);
  if (!title && !url) return false;
  const history = readHistory();
  const key = normalizeText(title);
  return history.some(item => {
    if (url && item.url && item.url === url) return true;
    if (key && item.key && item.key === key) return true;
    return false;
  });
}

export function saveTopic(input) {
  const { title, url } = normalizeInput(input);
  if (!title && !url) return;
  const history = readHistory();
  const key = normalizeText(title);
  const exists = history.some(item => {
    if (url && item.url && item.url === url) return true;
    if (key && item.key && item.key === key) return true;
    return false;
  });
  if (exists) return;
  const next = pruneHistory([
    ...history,
    {
      key,
      title,
      url: url || null,
      date: new Date().toISOString(),
    },
  ]);
  writeHistory(next);
}
