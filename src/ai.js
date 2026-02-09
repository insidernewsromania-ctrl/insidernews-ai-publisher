// src/ai.js
import OpenAI from "openai";
import { NEWS_REWRITE_PROMPT } from "./prompts.js";
import {
  extractJson,
  stripHtml,
  truncate,
  uniqueStrings,
  wordCount,
} from "./utils.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AI_MIN_WORDS = Number(
  process.env.AI_MIN_WORDS || process.env.MIN_WORDS || "350"
);
const AI_REWRITE_ATTEMPTS = Number(process.env.AI_REWRITE_ATTEMPTS || "2");

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const MIN_WORDS = parsePositiveInt(AI_MIN_WORDS, 350);
const REWRITE_ATTEMPTS = Math.min(parsePositiveInt(AI_REWRITE_ATTEMPTS, 2), 4);

function ensureHtml(text) {
  if (!text) return "";
  const trimmed = text.trim();
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .map(paragraph => `<p>${paragraph}</p>`)
    .join("\n");
}

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return uniqueStrings(tags);
  if (typeof tags === "string") {
    return uniqueStrings(
      tags
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean)
    );
  }
  return [];
}

function keywordFromText(text) {
  return (text || "")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

function buildPrompt(rawContent, originalTitle, meta, attempt) {
  const base = NEWS_REWRITE_PROMPT
    .replace("{{TITLE}}", originalTitle || "")
    .replace("{{CONTENT}}", rawContent || "")
    .replace("{{PUBLISHED_AT}}", meta?.publishedAt || "")
    .replace("{{SOURCE}}", meta?.source || "")
    .replace("{{LINK}}", meta?.link || "")
    .replace("{{MIN_WORDS}}", String(MIN_WORDS));

  if (attempt <= 1) return base;

  return `${base}

ATENȚIE:
- Răspunsul anterior a fost prea scurt.
- Respectă strict minimum ${MIN_WORDS} cuvinte în content_html.
- Păstrează faptele din textul sursă, fără invenții.`;
}

function normalizeArticle(data, originalTitle) {
  const article = {
    title: (data.title || originalTitle || "").trim(),
    seo_title: (data.seo_title || data.title || "").trim(),
    meta_description: (data.meta_description || "").trim(),
    focus_keyword: (data.focus_keyword || "").trim(),
    tags: normalizeTags(data.tags),
    content_html: ensureHtml(data.content_html || data.content || ""),
  };

  article.title = truncate(article.title, 80);
  article.seo_title = truncate(article.seo_title || article.title, 60);

  if (!article.focus_keyword && article.tags.length > 0) {
    article.focus_keyword = article.tags[0];
  }
  if (!article.focus_keyword) {
    article.focus_keyword = keywordFromText(article.title);
  }
  article.focus_keyword = truncate(article.focus_keyword, 80);

  const fallbackTag = keywordFromText(article.title);
  article.tags = uniqueStrings([
    ...article.tags,
    article.focus_keyword,
    fallbackTag,
  ]).slice(0, 5);

  if (!article.meta_description) {
    const raw = stripHtml(article.content_html).replace(/\s+/g, " ").trim();
    article.meta_description = truncate(raw, 160);
  } else {
    article.meta_description = truncate(article.meta_description, 160);
  }

  return article;
}

export async function rewriteNews(rawContent, originalTitle, meta = {}) {
  for (let attempt = 1; attempt <= REWRITE_ATTEMPTS; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: "Ești un jurnalist profesionist." },
          { role: "user", content: buildPrompt(rawContent, originalTitle, meta, attempt) },
        ],
        temperature: attempt === 1 ? 0.35 : 0.3,
        max_tokens: 1800 + (attempt - 1) * 250,
        response_format: { type: "json_object" },
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        console.log(`AI ERROR: empty response (attempt ${attempt}/${REWRITE_ATTEMPTS})`);
        continue;
      }

      const data = extractJson(text);
      if (!data) {
        console.log(`AI ERROR: invalid JSON response (attempt ${attempt}/${REWRITE_ATTEMPTS})`);
        continue;
      }

      const article = normalizeArticle(data, originalTitle);
      if (!article.title || !article.content_html) {
        console.log(`AI SKIP: articol incomplet (attempt ${attempt}/${REWRITE_ATTEMPTS})`);
        continue;
      }

      const words = wordCount(article.content_html);
      if (words < MIN_WORDS) {
        if (attempt < REWRITE_ATTEMPTS) {
          console.log(
            `AI RETRY: articol prea scurt (${words}/${MIN_WORDS})`
          );
        } else {
          console.log(
            `AI SKIP: articol prea scurt (${words}/${MIN_WORDS})`
          );
        }
        continue;
      }

      return article;
    } catch (err) {
      console.error(
        `AI ERROR (attempt ${attempt}/${REWRITE_ATTEMPTS}):`,
        err.message
      );
    }
  }
  return null;
}
