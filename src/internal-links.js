import { cleanTitle, normalizeText, stripHtml } from "./utils.js";

const STOPWORDS = new Set([
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
  "ce",
  "care",
  "cand",
  "cum",
  "despre",
  "dupa",
  "pana",
  "prin",
]);

const GENERIC_TOKENS = new Set([
  "romania",
  "roman",
  "stiri",
  "ultima",
  "ora",
  "azi",
  "video",
  "foto",
  "news",
  "update",
]);

function escapeRegex(value) {
  return (value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function meaningfulTokens(text) {
  return normalizeText(text)
    .split(" ")
    .filter(Boolean)
    .filter(
      token =>
        token.length >= 3 &&
        !STOPWORDS.has(token) &&
        !GENERIC_TOKENS.has(token)
    );
}

function buildAnchorCandidates(title) {
  const cleaned = cleanTitle(stripHtml(title || ""), 120);
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [];

  const candidates = new Set();
  for (const size of [5, 4, 3, 2]) {
    if (words.length < size) continue;
    const windows = Math.min(words.length - size + 1, 8);
    for (let start = 0; start < windows; start += 1) {
      const phrase = words.slice(start, start + size).join(" ");
      const tokens = meaningfulTokens(phrase);
      if (tokens.length < 2 || phrase.length < 10) continue;
      candidates.add(phrase);
    }
  }

  for (const word of words) {
    const token = normalizeText(word);
    if (token.length < 6) continue;
    if (STOPWORDS.has(token) || GENERIC_TOKENS.has(token)) continue;
    candidates.add(word);
  }

  return [...candidates];
}

function containsNormalized(haystack, needle) {
  const left = normalizeText(haystack || "");
  const right = normalizeText(needle || "");
  if (!left || !right) return false;
  return left.includes(right);
}

function hasExistingUrl(html, url) {
  if (!html || !url) return false;
  const escaped = escapeRegex(url);
  const pattern = new RegExp(`<a\\b[^>]*href=["']${escaped}["'][^>]*>`, "i");
  return pattern.test(html);
}

function pickBestAnchorForTarget(targetTitle, articleTokenSet, articleText) {
  const anchors = buildAnchorCandidates(targetTitle);
  let best = null;
  for (const anchor of anchors) {
    const tokens = meaningfulTokens(anchor);
    if (tokens.length === 0) continue;
    let matched = 0;
    for (const token of tokens) {
      if (articleTokenSet.has(token)) matched += 1;
    }
    const minimumMatches =
      tokens.length === 1 ? 1 : Math.max(2, Math.ceil(tokens.length * 0.6));
    if (matched < minimumMatches) continue;
    const exactPhraseInArticle = containsNormalized(articleText, anchor);
    if (!exactPhraseInArticle && tokens.length > 1) continue;
    const score = matched * 10 + anchor.length + (exactPhraseInArticle ? 15 : 0);
    if (!best || score > best.score) {
      best = { anchor, score };
    }
  }
  return best;
}

function injectAnchor(paragraphHtml, anchorText, url) {
  if (!paragraphHtml || !anchorText || !url) {
    return { html: paragraphHtml || "", linked: false };
  }
  if (/<a\b[^>]*>/i.test(paragraphHtml)) {
    return { html: paragraphHtml, linked: false };
  }
  const escapedAnchor = escapeRegex(anchorText);
  const pattern = new RegExp(
    `(^|[\\s(\\["'])(${escapedAnchor})(?=($|[\\s)\\],.!?:;"']))`,
    "i"
  );
  if (!pattern.test(paragraphHtml)) {
    return { html: paragraphHtml, linked: false };
  }
  const replaced = paragraphHtml.replace(
    pattern,
    (_, prefix, match) => `${prefix}<a href="${url}">${match}</a>`
  );
  return { html: replaced, linked: replaced !== paragraphHtml };
}

function uniqueByUrl(items) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const url = (item?.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(item);
  }
  return result;
}

function collectParagraphs(html) {
  return html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
}

export function addInternalLinksToHtml(contentHtml, options = {}) {
  const html = contentHtml || "";
  const articleTitle = options.articleTitle || "";
  const focusKeyword = options.focusKeyword || "";
  const targets = uniqueByUrl(options.targets || []);
  const maxLinks =
    Number.isFinite(options.maxLinks) && options.maxLinks > 0
      ? Math.floor(options.maxLinks)
      : 0;

  if (!html || targets.length === 0 || maxLinks === 0) {
    return { contentHtml: html, linkedCount: 0 };
  }

  const paragraphs = collectParagraphs(html);
  if (paragraphs.length === 0) {
    return { contentHtml: html, linkedCount: 0 };
  }

  const articleTokenSet = new Set(
    meaningfulTokens(
      `${articleTitle} ${focusKeyword} ${stripHtml(html).slice(0, 3000)}`
    )
  );
  const articleText = stripHtml(html).replace(/\s+/g, " ").trim();

  const normalizedTitle = normalizeText(articleTitle);
  const candidates = [];
  for (const target of targets) {
    const targetTitle = stripHtml(target?.title || "").trim();
    const targetUrl = (target?.url || "").trim();
    if (!targetTitle || !targetUrl) continue;
    if (normalizeText(targetTitle) === normalizedTitle) continue;
    if (hasExistingUrl(html, targetUrl)) continue;
    const bestAnchor = pickBestAnchorForTarget(
      targetTitle,
      articleTokenSet,
      articleText
    );
    if (!bestAnchor) continue;
    candidates.push({
      url: targetUrl,
      anchor: bestAnchor.anchor,
      score: bestAnchor.score,
    });
  }

  if (candidates.length === 0) {
    return { contentHtml: html, linkedCount: 0 };
  }

  candidates.sort((a, b) => b.score - a.score);

  const updatedParagraphs = [...paragraphs];
  const usedAnchors = new Set();
  let linkedCount = 0;

  const placeLink = (candidate, startIndex) => {
    for (let index = startIndex; index < updatedParagraphs.length; index += 1) {
      const paragraph = updatedParagraphs[index];
      if (/<a\b[^>]*>/i.test(paragraph)) continue;
      if (!containsNormalized(stripHtml(paragraph), candidate.anchor)) continue;
      const { html: nextParagraph, linked } = injectAnchor(
        paragraph,
        candidate.anchor,
        candidate.url
      );
      if (!linked) continue;
      updatedParagraphs[index] = nextParagraph;
      return true;
    }
    return false;
  };

  for (const candidate of candidates) {
    if (linkedCount >= maxLinks) break;
    const anchorKey = normalizeText(candidate.anchor);
    if (usedAnchors.has(anchorKey)) continue;
    let placed = placeLink(candidate, 1);
    if (!placed) {
      placed = placeLink(candidate, 0);
    }
    if (!placed) continue;
    usedAnchors.add(anchorKey);
    linkedCount += 1;
  }

  if (linkedCount === 0) {
    return { contentHtml: html, linkedCount: 0 };
  }

  let pointer = 0;
  const nextHtml = html.replace(
    /<p\b[^>]*>[\s\S]*?<\/p>/gi,
    () => updatedParagraphs[pointer++] || ""
  );

  return { contentHtml: nextHtml, linkedCount };
}
