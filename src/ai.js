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

export async function rewriteNews(rawContent, originalTitle) {
  try {
    const prompt = NEWS_REWRITE_PROMPT
      .replace("{{TITLE}}", originalTitle || "")
      .replace("{{CONTENT}}", rawContent);

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Ești un jurnalist profesionist." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1800,
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content;

    if (!text) {
      console.log("AI ERROR: empty response");
      return null;
    }

    const data = extractJson(text);

    if (!data) {
      console.log("AI ERROR: invalid JSON response");
      return null;
    }

    const article = {
      title: (data.title || originalTitle || "").trim(),
      seo_title: (data.seo_title || data.title || "").trim(),
      meta_description: (data.meta_description || "").trim(),
      focus_keyword: (data.focus_keyword || "").trim(),
      tags: normalizeTags(data.tags),
      content_html: ensureHtml(data.content_html || data.content || ""),
    };

    if (!article.title || !article.content_html) {
      console.log("AI SKIP: articol incomplet");
      return null;
    }

    article.title = truncate(article.title, 80);
    article.seo_title = truncate(
      article.seo_title || article.title,
      60
    );

    if (wordCount(article.content_html) < 450) {
      console.log("AI SKIP: articol prea scurt");
      return null;
    }

    if (!article.meta_description) {
      const raw = stripHtml(article.content_html).replace(/\s+/g, " ").trim();
      article.meta_description = truncate(raw, 160);
    } else {
      article.meta_description = truncate(article.meta_description, 160);
    }

    if (!article.focus_keyword && article.tags.length > 0) {
      article.focus_keyword = article.tags[0];
    }

    return article;
  } catch (err) {
    console.error("AI ERROR:", err.message);
    return null;
  }
}
