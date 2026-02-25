import OpenAI from "openai";
import {
  cleanTitle,
  extractJson,
  hasEnigmaticTitleSignals,
  hasSuperlativeTitleSignals,
  isStrongTitle,
  normalizeText,
  stripHtml,
  truncate,
  truncateAtWord,
  uniqueStrings,
  wordCount,
} from "./utils.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const FALLBACK_MIN_WORDS = Number(
  process.env.FALLBACK_MIN_WORDS || process.env.MIN_WORDS || "350"
);
const FALLBACK_ATTEMPTS = Number(process.env.FALLBACK_ATTEMPTS || "3");

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const MIN_WORDS = parsePositiveInt(FALLBACK_MIN_WORDS, 350);
const ATTEMPTS = Math.min(parsePositiveInt(FALLBACK_ATTEMPTS, 3), 5);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const TITLE_MAX_CHARS = parsePositiveInt(process.env.TITLE_MAX_CHARS || "110", 110);
const SEO_TITLE_MAX_CHARS = parsePositiveInt(process.env.SEO_TITLE_MAX_CHARS || "60", 60);
const HOWTO_DETAIL_MIN_WORDS = parsePositiveInt(
  process.env.HOWTO_DETAIL_MIN_WORDS || "650",
  650
);
const HOWTO_DETAIL_MIN_H2 = parsePositiveInt(process.env.HOWTO_DETAIL_MIN_H2 || "4", 4);
const HOWTO_REQUIRE_STEP_HINTS = process.env.HOWTO_REQUIRE_STEP_HINTS !== "false";

function hasHeadlineStyleIssues(title) {
  return hasEnigmaticTitleSignals(title) || hasSuperlativeTitleSignals(title);
}

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

function keywordFromText(text) {
  return (text || "")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
}

function normalizeArticle(data) {
  const contentHtml = ensureHtml(data.content_html || data.content || "");
  const rawTitle = data.title || "";
  const rawSeoTitle = data.seo_title || data.title || "";
  const article = {
    title: cleanTitle(rawTitle, TITLE_MAX_CHARS),
    seo_title: cleanTitle(rawSeoTitle, SEO_TITLE_MAX_CHARS),
    meta_description: (data.meta_description || "").trim(),
    focus_keyword: (data.focus_keyword || "").trim(),
    tags: normalizeTags(data.tags),
    content_html: contentHtml,
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

function isHowToCategory(category) {
  const normalized = normalizeText(category || "");
  return (
    normalized.includes("cum sa") ||
    normalized.includes("cumsa") ||
    normalized.includes("ghid")
  );
}

function requiredWordsForCategory(category) {
  if (!isHowToCategory(category)) return MIN_WORDS;
  return Math.max(MIN_WORDS, HOWTO_DETAIL_MIN_WORDS);
}

function countTagOccurrences(html, tagName) {
  const source = html || "";
  const regex = new RegExp(`<${tagName}\\b`, "gi");
  const matches = source.match(regex);
  return matches ? matches.length : 0;
}

function countStepHints(html) {
  const normalized = normalizeText(stripHtml(html || ""));
  if (!normalized) return 0;
  const matches = normalized.match(/\bpas(?:ul|ii?)\b/g);
  return matches ? matches.length : 0;
}

function buildPrompt(category, attempt, minWords) {
  const today = todayRO();
  const howToMode = isHowToCategory(category);
  const extra =
    attempt > 1
      ? `

ATENȚIE:
- Răspunsul anterior a fost prea scurt sau incomplet.
- Respectă strict minimum ${minWords} cuvinte în content_html.`
      : "";

  const howToRules = howToMode
    ? `

CERINTE SUPLIMENTARE PENTRU CATEGORIA "Cum sa?":
- Scrie un ghid practic, detaliat, pentru incepatori.
- Include clar: materiale necesare, durata orientativa, cost orientativ, pasi de executie, verificare finala.
- Fiecare pas trebuie explicat pe larg (ce faci, de ce faci, ce greseli eviti).
- Include o sectiune despre erori frecvente si o sectiune "Cand sa ceri ajutor specializat".
- Foloseste cel putin ${HOWTO_DETAIL_MIN_H2} subtitluri H2.
- Foloseste subtitluri H3 pentru pasi (ex: "Pasul 1", "Pasul 2").`
    : "";

  return `
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
- NU genera articole despre promovarea altor publicatii, canale, pagini sau emisiuni media
- Evita repetitia formulei "in contextul"; foloseste exprimari directe si variate
- Ton: știre de presă, factual, neutru
- Stil profesionist, natural, fără cuvinte pompoase
- Propoziții scurte și clare
- Fără limbaj emoțional, fără umplutură și fără entuziasm fals
- Evită titluri enigmatice (ex.: „un jucător”, „o vedetă”, „acesta...”)
- Evită superlative de tip „cel mai”, „istoric”, „uriaș” dacă nu sunt susținute factual

STRUCTURĂ:
- Lead clar: ce s-a întâmplat ASTĂZI
- 2–4 paragrafe explicative
- Subtitluri doar dacă sunt necesare

Categoria: ${category}
${howToRules}

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
- title: max 110 caractere.
- seo_title: max 60 caractere.
- meta_description: între 130 și 160 caractere.
- tags: 2–5 taguri, fără #.
- content_html: doar HTML cu <p>, <h2>, <h3>, <strong>; fără H1.
- Titlul trebuie să fie complet, coerent, fără final tăiat.
- Nu încheia titlul cu construcții incomplete (ex.: „în timp ce...”, „după ce...”).
- Titlul trebuie să includă clar actorul principal (persoană/club/instituție), nu formulări vagi.
- Include focus keyword natural în lead și într-un subtitlu H2.
- Minim ${minWords} de cuvinte.
${extra}
`;
}

export async function generateArticle(category) {
  const requiredWords = requiredWordsForCategory(category);
  const howToMode = isHowToCategory(category);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: attempt === 1 ? 0.35 : 0.3,
        messages: [
          {
            role: "system",
            content:
              "Esti un jurnalist profesionist de actualitate. Scrii factual, concis, fara clisee si fara limbaj promotional despre alte publicatii.",
          },
          { role: "user", content: buildPrompt(category, attempt, requiredWords) },
        ],
        max_tokens: 1800 + (attempt - 1) * 250,
        response_format: { type: "json_object" },
      });

      const text = response.choices[0]?.message?.content;
      const data = extractJson(text);
      if (!data) {
        console.log(`GENERATOR ERROR: invalid JSON (attempt ${attempt}/${ATTEMPTS})`);
        continue;
      }

      const article = normalizeArticle(data);
      if (!article.title || !article.content_html) {
        console.log(`GENERATOR SKIP: articol incomplet (attempt ${attempt}/${ATTEMPTS})`);
        continue;
      }

      if (!isStrongTitle(article.title)) {
        if (attempt < ATTEMPTS) {
          console.log("GENERATOR RETRY: titlu slab sau incomplet");
        } else {
          console.log("GENERATOR SKIP: titlu slab sau incomplet");
        }
        continue;
      }

      if (hasHeadlineStyleIssues(article.title)) {
        if (attempt < ATTEMPTS) {
          console.log("GENERATOR RETRY: titlu vag/superlativ");
        } else {
          console.log("GENERATOR SKIP: titlu vag/superlativ");
        }
        continue;
      }

      const words = wordCount(article.content_html);
      if (words < requiredWords) {
        if (attempt < ATTEMPTS) {
          console.log(
            `GENERATOR RETRY: articol prea scurt (${words}/${requiredWords})`
          );
        } else {
          console.log(
            `GENERATOR SKIP: articol prea scurt (${words}/${requiredWords})`
          );
        }
        continue;
      }

      if (howToMode) {
        const h2Count = countTagOccurrences(article.content_html, "h2");
        if (h2Count < HOWTO_DETAIL_MIN_H2) {
          if (attempt < ATTEMPTS) {
            console.log(
              `GENERATOR RETRY: ghid prea putin structurat (H2 ${h2Count}/${HOWTO_DETAIL_MIN_H2})`
            );
          } else {
            console.log(
              `GENERATOR SKIP: ghid prea putin structurat (H2 ${h2Count}/${HOWTO_DETAIL_MIN_H2})`
            );
          }
          continue;
        }
        if (HOWTO_REQUIRE_STEP_HINTS) {
          const stepHints = countStepHints(article.content_html);
          if (stepHints < 3) {
            if (attempt < ATTEMPTS) {
              console.log(
                `GENERATOR RETRY: ghid fara pasi suficient explicati (${stepHints}/3)`
              );
            } else {
              console.log(
                `GENERATOR SKIP: ghid fara pasi suficient explicati (${stepHints}/3)`
              );
            }
            continue;
          }
        }
      }

      return article;
    } catch (err) {
      console.error(
        `GENERATOR ERROR (attempt ${attempt}/${ATTEMPTS}):`,
        err.message
      );
    }
  }

  return null;
}
