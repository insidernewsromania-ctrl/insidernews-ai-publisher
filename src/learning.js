import fs from "fs";
import { normalizeText } from "./utils.js";

const FILE = "data/editorial_learning.json";
const MAX_NAME_RULES = 240;
const MAX_TOKENS_PER_CATEGORY = 420;
const MAX_TOKENS_PER_SAMPLE = 90;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const CATEGORY_LEARNING_ENABLED = process.env.CATEGORY_LEARNING_ENABLED !== "false";
const CATEGORY_LEARNING_DIVISOR = parsePositiveInt(
  process.env.CATEGORY_LEARNING_DIVISOR || "6",
  6
);
const CATEGORY_LEARNING_MAX_BOOST = parsePositiveInt(
  process.env.CATEGORY_LEARNING_MAX_BOOST || "10",
  10
);

const TOKEN_NOISE = new Set([
  "acest",
  "aceasta",
  "aceste",
  "acesti",
  "acolo",
  "acum",
  "anunta",
  "anuntat",
  "anuntata",
  "anuntate",
  "arata",
  "asupra",
  "astazi",
  "atunci",
  "care",
  "catre",
  "ceea",
  "cele",
  "celor",
  "chiar",
  "conform",
  "context",
  "contextul",
  "cum",
  "data",
  "date",
  "deja",
  "despre",
  "dupa",
  "fost",
  "fosta",
  "foste",
  "fosti",
  "fiind",
  "fiindca",
  "insa",
  "intr",
  "intro",
  "langa",
  "local",
  "noul",
  "noua",
  "nou",
  "pentru",
  "potrivit",
  "privind",
  "publicat",
  "publicata",
  "publicate",
  "respectiv",
  "sursa",
  "sursei",
  "totusi",
  "unde",
  "urma",
  "vineri",
  "sambata",
  "duminica",
  "luni",
  "marti",
  "miercuri",
  "joi",
]);

let cache = null;

function normalizeName(value) {
  return `${value || ""}`.replace(/\s+/g, " ").trim();
}

function readStore() {
  if (cache) return cache;
  if (!fs.existsSync(FILE)) {
    cache = {
      nameRules: [],
      categoryTokenStats: {},
      updatedAt: null,
    };
    return cache;
  }
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    if (!raw.trim()) {
      cache = {
        nameRules: [],
        categoryTokenStats: {},
        updatedAt: null,
      };
      return cache;
    }
    const parsed = JSON.parse(raw);
    const nameRules = Array.isArray(parsed?.nameRules)
      ? parsed.nameRules
          .filter(Boolean)
          .map(rule => ({
            expected: normalizeName(rule?.expected),
            found: normalizeName(rule?.found),
            count: Math.max(1, Number(rule?.count || 1)),
            updatedAt: rule?.updatedAt || null,
          }))
          .filter(rule => rule.expected && rule.found)
      : [];
    const categoryTokenStats =
      parsed?.categoryTokenStats && typeof parsed.categoryTokenStats === "object"
        ? parsed.categoryTokenStats
        : {};
    cache = {
      nameRules,
      categoryTokenStats,
      updatedAt: parsed?.updatedAt || null,
    };
    return cache;
  } catch (err) {
    console.warn("LEARNING READ ERROR:", err.message);
    cache = {
      nameRules: [],
      categoryTokenStats: {},
      updatedAt: null,
    };
    return cache;
  }
}

function writeStore(nextStore) {
  const prepared = {
    nameRules: Array.isArray(nextStore?.nameRules) ? nextStore.nameRules : [],
    categoryTokenStats:
      nextStore?.categoryTokenStats && typeof nextStore.categoryTokenStats === "object"
        ? nextStore.categoryTokenStats
        : {},
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(prepared, null, 2));
  cache = prepared;
}

function tokenizeCategoryText(text, maxTokens = MAX_TOKENS_PER_SAMPLE) {
  const normalized = normalizeText(text || "");
  if (!normalized) return [];
  const seen = new Set();
  const output = [];
  for (const token of normalized.split(" ")) {
    if (!token) continue;
    if (token.length < 4) continue;
    if (/^\d+$/.test(token)) continue;
    if (TOKEN_NOISE.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(token);
    if (output.length >= maxTokens) break;
  }
  return output;
}

function surnameFromName(fullName) {
  const normalized = normalizeText(fullName || "");
  if (!normalized) return "";
  const parts = normalized.split(" ").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function pruneCategoryTokenStats(statsByToken) {
  const entries = Object.entries(statsByToken || {}).map(([token, count]) => ({
    token,
    count: Math.max(0, Number(count || 0)),
  }));
  entries.sort((a, b) => b.count - a.count);
  return entries
    .slice(0, MAX_TOKENS_PER_CATEGORY)
    .reduce((acc, entry) => {
      if (!entry.token || entry.count <= 0) return acc;
      acc[entry.token] = entry.count;
      return acc;
    }, {});
}

function mergeNameRule(nameRules, expected, found) {
  const normalizedExpected = normalizeName(expected);
  const normalizedFound = normalizeName(found);
  if (!normalizedExpected || !normalizedFound) return nameRules;
  if (normalizeText(normalizedExpected) === normalizeText(normalizedFound)) return nameRules;

  const idx = nameRules.findIndex(
    rule =>
      normalizeText(rule.expected) === normalizeText(normalizedExpected) &&
      normalizeText(rule.found) === normalizeText(normalizedFound)
  );

  if (idx >= 0) {
    const current = nameRules[idx];
    nameRules[idx] = {
      ...current,
      count: Math.max(1, Number(current.count || 1)) + 1,
      updatedAt: new Date().toISOString(),
    };
    return nameRules;
  }

  nameRules.push({
    expected: normalizedExpected,
    found: normalizedFound,
    count: 1,
    updatedAt: new Date().toISOString(),
  });
  nameRules.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  if (nameRules.length > MAX_NAME_RULES) {
    nameRules = nameRules.slice(0, MAX_NAME_RULES);
  }
  return nameRules;
}

export function rememberNameMismatchPair(expectedName, foundName) {
  const store = readStore();
  const currentRules = Array.isArray(store.nameRules) ? [...store.nameRules] : [];
  const nextRules = mergeNameRule(currentRules, expectedName, foundName);
  writeStore({
    ...store,
    nameRules: nextRules,
  });
}

export function buildLearningNotesForPrompt(sourceText, options = {}) {
  const store = readStore();
  const limit = Math.max(1, Math.min(Number(options.limit || 4), 8));
  const normalizedSource = normalizeText(sourceText || "");
  if (!normalizedSource || !Array.isArray(store.nameRules) || store.nameRules.length === 0) {
    return "";
  }

  const matched = [];
  for (const rule of store.nameRules) {
    if (!rule?.expected || !rule?.found) continue;
    const expectedKey = normalizeText(rule.expected);
    const expectedSurname = surnameFromName(rule.expected);
    if (!expectedKey) continue;
    if (!normalizedSource.includes(expectedKey) && !normalizedSource.includes(expectedSurname)) {
      continue;
    }
    matched.push(rule);
    if (matched.length >= limit) break;
  }

  if (matched.length === 0) return "";

  const lines = matched.map(
    rule =>
      `- Nu confunda «${rule.expected}» cu «${rule.found}». Foloseste exact numele din sursa.`
  );
  return lines.join("\n");
}

export function rememberCategoryOutcome(input = {}) {
  if (!CATEGORY_LEARNING_ENABLED) return;
  const categoryId = Number(input?.categoryId || 0);
  if (!Number.isFinite(categoryId) || categoryId <= 0) return;
  const text = `${input?.sourceText || ""}`.trim();
  if (!text) return;

  const tokens = tokenizeCategoryText(text);
  if (tokens.length === 0) return;

  const store = readStore();
  const currentStats =
    store?.categoryTokenStats && typeof store.categoryTokenStats === "object"
      ? { ...store.categoryTokenStats }
      : {};
  const categoryKey = String(categoryId);
  const existing = { ...(currentStats[categoryKey] || {}) };

  for (const token of tokens) {
    existing[token] = Math.max(0, Number(existing[token] || 0)) + 1;
  }

  currentStats[categoryKey] = pruneCategoryTokenStats(existing);
  writeStore({
    ...store,
    categoryTokenStats: currentStats,
  });
}

export function getCategoryLearningScores(sourceText, categoryIds = []) {
  if (!CATEGORY_LEARNING_ENABLED) return {};
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return {};

  const tokens = tokenizeCategoryText(sourceText);
  if (tokens.length === 0) return {};

  const store = readStore();
  const statsByCategory =
    store?.categoryTokenStats && typeof store.categoryTokenStats === "object"
      ? store.categoryTokenStats
      : {};
  const scores = {};

  for (const rawCategoryId of categoryIds) {
    const categoryId = Number(rawCategoryId || 0);
    if (!Number.isFinite(categoryId) || categoryId <= 0) continue;
    const categoryStats = statsByCategory[String(categoryId)];
    if (!categoryStats || typeof categoryStats !== "object") continue;

    let rawScore = 0;
    for (const token of tokens) {
      const tokenWeight = Number(categoryStats[token] || 0);
      if (tokenWeight <= 0) continue;
      rawScore += Math.min(tokenWeight, 5);
    }

    if (rawScore <= 0) continue;
    const normalizedBoost = Math.min(
      CATEGORY_LEARNING_MAX_BOOST,
      Math.floor(rawScore / Math.max(1, CATEGORY_LEARNING_DIVISOR))
    );
    if (normalizedBoost > 0) {
      scores[categoryId] = normalizedBoost;
    }
  }

  return scores;
}
