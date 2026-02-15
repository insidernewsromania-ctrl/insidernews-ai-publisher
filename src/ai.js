// src/ai.js
import OpenAI from "openai";
import { NEWS_REWRITE_PROMPT } from "./prompts.js";
import {
  cleanTitle,
  extractJson,
  hasEnigmaticTitleSignals,
  hasSuperlativeTitleSignals,
  isStrongTitle,
  stripHtml,
  truncate,
  truncateAtWord,
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
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ENFORCE_AI_MIN_WORDS = process.env.ENFORCE_AI_MIN_WORDS === "true";

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const MIN_WORDS = parsePositiveInt(AI_MIN_WORDS, 350);
const REWRITE_ATTEMPTS = Math.min(parsePositiveInt(AI_REWRITE_ATTEMPTS, 2), 4);
const TITLE_MAX_CHARS = parsePositiveInt(process.env.TITLE_MAX_CHARS || "110", 110);
const SEO_TITLE_MAX_CHARS = parsePositiveInt(process.env.SEO_TITLE_MAX_CHARS || "60", 60);

function hasHeadlineStyleIssues(title) {
  return hasEnigmaticTitleSignals(title) || hasSuperlativeTitleSignals(title);
}

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
  const roleConstraints = (meta?.roleConstraints || "")
    .toString()
    .trim() || "- Pastreaza functiile oficiale exact asa cum apar in sursa.";

  const base = NEWS_REWRITE_PROMPT
    .replace("{{TITLE}}", originalTitle || "")
    .replace("{{CONTENT}}", rawContent || "")
    .replace("{{PUBLISHED_AT}}", meta?.publishedAt || "")
    .replace("{{SOURCE}}", meta?.source || "")
    .replace("{{LINK}}", meta?.link || "")
    .replace("{{ROLE_CONSTRAINTS}}", roleConstraints)
    .replace("{{MIN_WORDS}}", String(MIN_WORDS));

  if (
    attempt <= 1 &&
    !meta?.strictRoleMode &&
    !meta?.strictStyleMode &&
    !meta?.strictHeadlineMode
  ) {
    return base;
  }

  const extraRules = [];

  if (meta?.strictRoleMode) {
    extraRules.push(`ATENTIE CRITICA:
- Exista risc de confuzie intre functiile oficiale (ex: premier vs primar).
- Verifica explicit fiecare persoana mentionata si pastreaza functia corecta din sursa.
- Daca nu esti sigur, elimina functia si pastreaza doar numele.`);
  }

  if (meta?.strictStyleMode) {
    extraRules.push(`ATENTIE DE STIL:
- Raspunsul anterior a avut formule repetitive.
- Scrie concis si jurnalistic, cu propozitii scurte.
- Nu repeta formula "in contextul"; foloseste variatii firesti (ex: "in acest cadru", "potrivit datelor").`);
  }

  if (meta?.strictHeadlineMode) {
    extraRules.push(`ATENTIE TITLU:
- Titlul anterior a fost vag, enigmatic sau hiperbolic.
- Foloseste un titlu concret, factual, cu actorul principal clar identificat.
- Evita inceputuri precum "Un jucator", "O vedeta", "Acesta..." daca nu identifici numele.
- Fara superlative de tip "cel mai", "istoric", "urias" daca nu sunt strict sustinute de date verificabile.`);
  }

  if (extraRules.length === 0) {
    extraRules.push(`ATENȚIE:
- Răspunsul anterior a fost incomplet.
- Păstrează faptele din textul sursă, fără invenții.`);
  }

  return `${base}

${extraRules.join("\n\n")}`;
}

function normalizeArticle(data, originalTitle) {
  const rawTitle = data.title || originalTitle || "";
  const rawSeoTitle = data.seo_title || data.title || originalTitle || "";
  const article = {
    title: cleanTitle(rawTitle, TITLE_MAX_CHARS),
    seo_title: cleanTitle(rawSeoTitle, SEO_TITLE_MAX_CHARS),
    meta_description: (data.meta_description || "").trim(),
    focus_keyword: (data.focus_keyword || "").trim(),
    tags: normalizeTags(data.tags),
    content_html: ensureHtml(data.content_html || data.content || ""),
  };

  if (!article.seo_title) {
    article.seo_title = cleanTitle(article.title, SEO_TITLE_MAX_CHARS);
  }

  if (!article.focus_keyword && article.tags.length > 0) {
    article.focus_keyword = article.tags[0];
  }
  if (!article.focus_keyword) {
    article.focus_keyword = keywordFromText(article.title);
  }
  article.focus_keyword = truncateAtWord(article.focus_keyword, 80);

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
  let strictHeadlineMode = Boolean(meta?.strictHeadlineMode);

  for (let attempt = 1; attempt <= REWRITE_ATTEMPTS; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Esti un jurnalist senior de actualitate si editor SEO. Scrii riguros factual, clar, natural si util pentru cititor. Eviti cliseele, repetitiile si limbajul promotional despre alte publicatii.",
          },
          {
            role: "user",
            content: buildPrompt(
              rawContent,
              originalTitle,
              {
                ...meta,
                strictHeadlineMode,
              },
              attempt
            ),
          },
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

      if (!isStrongTitle(article.title)) {
        const fallbackTitle = cleanTitle(originalTitle, TITLE_MAX_CHARS);
        if (isStrongTitle(fallbackTitle) && !hasHeadlineStyleIssues(fallbackTitle)) {
          article.title = fallbackTitle;
          article.seo_title = cleanTitle(
            article.seo_title || fallbackTitle,
            SEO_TITLE_MAX_CHARS
          );
        } else if (attempt < REWRITE_ATTEMPTS) {
          strictHeadlineMode = true;
          console.log("AI RETRY: titlu slab sau incomplet");
          continue;
        } else {
          console.log("AI SKIP: titlu slab sau incomplet");
          continue;
        }
      }

      if (hasHeadlineStyleIssues(article.title)) {
        const fallbackTitle = cleanTitle(originalTitle, TITLE_MAX_CHARS);
        if (isStrongTitle(fallbackTitle) && !hasHeadlineStyleIssues(fallbackTitle)) {
          article.title = fallbackTitle;
          article.seo_title = cleanTitle(
            article.seo_title || fallbackTitle,
            SEO_TITLE_MAX_CHARS
          );
        } else if (attempt < REWRITE_ATTEMPTS) {
          strictHeadlineMode = true;
          console.log("AI RETRY: titlu vag/superlativ");
          continue;
        } else {
          console.log("AI SKIP: titlu vag/superlativ");
          continue;
        }
      }

      if (ENFORCE_AI_MIN_WORDS) {
        const words = wordCount(article.content_html);
        if (words < MIN_WORDS) {
          if (attempt < REWRITE_ATTEMPTS) {
            console.log(`AI RETRY: articol prea scurt (${words}/${MIN_WORDS})`);
          } else {
            console.log(`AI SKIP: articol prea scurt (${words}/${MIN_WORDS})`);
          }
          continue;
        }
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
