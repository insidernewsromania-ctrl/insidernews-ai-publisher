import OpenAI from "openai";
import {
  extractJson,
  stripHtml,
  truncate,
  uniqueStrings,
  wordCount,
} from "./utils.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function todayRO() {
  return new Date().toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
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

export async function generateArticle(category) {
  const today = todayRO();

  const prompt = `
Ești jurnalist de știri de actualitate.

SCRII EXCLUSIV despre un EVENIMENT care:
- s-a produs ASTĂZI (${today})
  SAU
- a fost ANUNȚAT OFICIAL ASTĂZI (${today})

REGULI:
- Subiectul principal trebuie să fie din ziua de AZI
- Este PERMISĂ menționarea altor ani (2024, 2025 etc.) DOAR ca context secundar
- NU prezenta evenimente vechi ca fiind actuale
- NU scrie analize generale sau retrospective
- Ton: știre de presă, factual, neutru

STRUCTURĂ:
- Lead clar: ce s-a întâmplat ASTĂZI
- 2–4 paragrafe explicative
- Subtitluri doar dacă sunt necesare

Categoria: ${category}

Returnează STRICT JSON, fără markdown:
{
  "title": "",
  "seo_title": "",
  "meta_description": "",
  "focus_keyword": "",
  "tags": ["", ""],
  "content_html": ""
}

REGULI OUTPUT:
- title: max 80 caractere.
- seo_title: max 60 caractere.
- meta_description: max 160 caractere.
- tags: 2–5 taguri, fără #.
- content_html: doar HTML cu <p>, <h2>, <h3>, <strong>; fără H1.
- Minim 450 de cuvinte.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.4,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1800,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content;
  const data = extractJson(text);

  if (!data) return null;

  const contentHtml = ensureHtml(data.content_html || data.content || "");
  const article = {
    title: (data.title || "").trim(),
    seo_title: (data.seo_title || data.title || "").trim(),
    meta_description: (data.meta_description || "").trim(),
    focus_keyword: (data.focus_keyword || "").trim(),
    tags: normalizeTags(data.tags),
    content_html: contentHtml,
  };

  if (!article.title || !article.content_html) return null;

  article.title = truncate(article.title, 80);
  article.seo_title = truncate(article.seo_title || article.title, 60);

  if (wordCount(article.content_html) < 450) return null;

  if (!article.meta_description) {
    const raw = stripHtml(article.content_html).replace(/\s+/g, " ").trim();
    article.meta_description = truncate(raw, 160);
  } else {
    article.meta_description = truncate(article.meta_description, 160);
  }

  return article;
}
