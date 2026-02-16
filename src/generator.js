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
const TITLE_MAX_CHARS = parsePositiveInt(process.env.TITLE_MAX_CHARS || "110", 110);
const SEO_TITLE_MAX_CHARS = parsePositiveInt(process.env.SEO_TITLE_MAX_CHARS || "60", 60);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ENFORCE_GENERATOR_MIN_WORDS = process.env.ENFORCE_GENERATOR_MIN_WORDS === "true";
const HOWTO_MIN_WORDS = parsePositiveInt(
  process.env.HOWTO_MIN_WORDS || process.env.MIN_WORDS || "350",
  350
);
const HOWTO_ATTEMPTS = Math.min(parsePositiveInt(process.env.HOWTO_ATTEMPTS || "3", 3), 5);
const ENFORCE_HOWTO_MIN_WORDS = process.env.ENFORCE_HOWTO_MIN_WORDS === "true";

function hasHeadlineStyleIssues(title) {
  return hasEnigmaticTitleSignals(title) || hasSuperlativeTitleSignals(title);
}

const HOWTO_TOPIC_SEEDS = [
  "cum sa schimbi un bec in siguranta",
  "cum sa faci paste cu sos alb",
  "cum sa cureti masina de spalat",
  "cum sa economisesti energie acasa",
  "cum sa alegi un laptop pentru munca",
  "cum sa iti organizezi bugetul lunar",
  "cum sa pregatesti casa pentru iarna",
  "cum sa iti optimizezi semnalul Wi-Fi",
  "cum sa gatesti o friptura frageda",
  "cum sa plantezi rosii in ghiveci",
  "cum sa iti faci un CV bun",
  "cum sa speli corect hainele albe",
];

function todayRO() {
  return new Date().toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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

function buildPrompt(category, attempt) {
  const today = todayRO();
  const extra =
    attempt > 1
      ? `

ATENȚIE:
- Răspunsul anterior a fost incomplet.
- Păstrează structura clară, utilă și factuală.`
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
- Ton: știre de presă, factual, neutru
- Stil profesionist, natural, fără cuvinte pompoase
- Propoziții scurte și clare
- Fără limbaj emoțional, fără umplutură și fără entuziasm fals
- Compunere variată: alternează paragrafe scurte cu paragrafe de context factual
- Evită formulări tabloid (ex.: „șoc”, „bombă”, „de necrezut”)
- Evită titluri enigmatice (ex.: „un jucător”, „o vedetă”, „acesta...”)
- Evită superlative de tip „cel mai”, „istoric”, „uriaș” dacă nu sunt susținute factual
- Nu ghici, nu inventa date, nu specula
- Dacă o informație nu poate fi confirmată, spune explicit că nu poate fi confirmată

STRUCTURĂ:
- Lead clar: ce s-a întâmplat ASTĂZI
- După lead, adaugă un paragraf scurt de context factual (de ce subiectul contează acum)
- Dezvoltă subiectul în mai multe paragrafe explicative, cu unghiuri distincte
- Include cel puțin 3 subtitluri H2 descriptive
- Când subiectul o cere, include o secțiune finală descriptivă naturală (ex.: „Detalii-cheie”)

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
- title: clar, natural, fara limita rigida de caractere.
- seo_title: concis pentru SEO, fara limita rigida de caractere.
- meta_description: utila pentru cititor, fara limita rigida de caractere.
- tags: 2–5 taguri, fără #.
- content_html: doar HTML cu <p>, <h2>, <h3>, <strong>, <ul>, <ol>, <li>; fără H1.
- Titlul trebuie să fie complet, coerent, fără final tăiat.
- Nu încheia titlul cu construcții incomplete (ex.: „în timp ce...”, „după ce...”).
- Fără semne de exclamare în titlu.
- Titlul trebuie să includă clar actorul principal (persoană/club/instituție), nu formulări vagi.
- Include focus keyword natural în lead și într-un subtitlu H2.
${extra}
`;
}

function randomHowToTopic(topicHint = "") {
  const cleanHint = `${topicHint || ""}`.trim();
  if (cleanHint) return cleanHint;
  const index = Math.floor(Math.random() * HOWTO_TOPIC_SEEDS.length);
  return HOWTO_TOPIC_SEEDS[index] || "cum sa faci o activitate practica de zi cu zi";
}

function buildHowToPrompt(topicHint, attempt) {
  const topic = randomHowToTopic(topicHint);
  const extra =
    attempt > 1
      ? `

ATENȚIE:
- Răspunsul anterior a fost incomplet.
- Menține claritatea pașilor practici și verifică utilitatea informației.`
      : "";

  return `
Ești jurnalist de utilitate publică. Scrii un ghid "Cum să?" în limba română.

SUBIECT GHID:
${topic}

OBIECTIV:
- Explică practic, clar și realist.
- Textul trebuie să fie util unui cititor obișnuit.

REGULI OBLIGATORII:
- Ton profesionist, natural, fără limbaj pompos.
- Propoziții scurte și clare.
- Fără limbaj emoțional, fără exagerări.
- Nu inventa date sau promisiuni.
- Dacă există aspecte incerte sau care depind de context, spune clar limitele.

STRUCTURĂ:
- Titlu clar, de preferat începe cu "Cum să".
- Lead scurt: ce va obține cititorul.
- Minim 3 subtitluri H2.
- Include pași numerotați sau explicați logic.
- Include o secțiune scurtă "Greșeli frecvente" și una "Întrebări rapide".

SEO:
- title clar si natural (fara limita rigida de caractere)
- seo_title concis pentru SEO (fara limita rigida de caractere)
- meta_description utila pentru cititor (fara limita rigida de caractere)
- 2-5 taguri relevante
- focus keyword natural în lead și într-un H2

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
- content_html: doar HTML cu <p>, <h2>, <h3>, <strong>, <ul>, <ol>, <li>; fără H1.
${extra}
`;
}

export async function generateArticle(category) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: attempt === 1 ? 0.35 : 0.3,
        messages: [
          {
            role: "system",
            content:
              "Ești un jurnalist profesionist de actualitate și editor SEO. Scrii precis, factual, clar, cu compunere variată, fără speculații și fără exagerări.",
          },
          { role: "user", content: buildPrompt(category, attempt) },
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

      if (ENFORCE_GENERATOR_MIN_WORDS) {
        const words = wordCount(article.content_html);
        if (words < MIN_WORDS) {
          if (attempt < ATTEMPTS) {
            console.log(`GENERATOR RETRY: articol prea scurt (${words}/${MIN_WORDS})`);
          } else {
            console.log(`GENERATOR SKIP: articol prea scurt (${words}/${MIN_WORDS})`);
          }
          continue;
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

export async function generateHowToArticle(topicHint = "") {
  for (let attempt = 1; attempt <= HOWTO_ATTEMPTS; attempt += 1) {
    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: attempt === 1 ? 0.4 : 0.3,
        messages: [
          {
            role: "system",
            content:
              "Ești un jurnalist profesionist de ghiduri practice. Scrii clar, util și verificabil.",
          },
          { role: "user", content: buildHowToPrompt(topicHint, attempt) },
        ],
        max_tokens: 1900 + (attempt - 1) * 250,
        response_format: { type: "json_object" },
      });

      const text = response.choices[0]?.message?.content;
      const data = extractJson(text);
      if (!data) {
        console.log(`HOWTO ERROR: invalid JSON (attempt ${attempt}/${HOWTO_ATTEMPTS})`);
        continue;
      }

      const article = normalizeArticle(data);
      if (!article.title || !article.content_html) {
        console.log(`HOWTO SKIP: articol incomplet (attempt ${attempt}/${HOWTO_ATTEMPTS})`);
        continue;
      }

      if (!isStrongTitle(article.title)) {
        if (attempt < HOWTO_ATTEMPTS) {
          console.log("HOWTO RETRY: titlu slab sau incomplet");
        } else {
          console.log("HOWTO SKIP: titlu slab sau incomplet");
        }
        continue;
      }

      if (hasHeadlineStyleIssues(article.title)) {
        if (attempt < HOWTO_ATTEMPTS) {
          console.log("HOWTO RETRY: titlu vag/superlativ");
        } else {
          console.log("HOWTO SKIP: titlu vag/superlativ");
        }
        continue;
      }

      const titleNormalized = normalizeText(article.title);
      if (titleNormalized && !titleNormalized.startsWith("cum sa")) {
        const fixedTitle = cleanTitle(`Cum sa ${article.title}`, TITLE_MAX_CHARS);
        if (fixedTitle) {
          article.title = fixedTitle;
          article.seo_title = cleanTitle(article.seo_title || fixedTitle, SEO_TITLE_MAX_CHARS);
        }
      }

      if (ENFORCE_HOWTO_MIN_WORDS) {
        const words = wordCount(article.content_html);
        if (words < HOWTO_MIN_WORDS) {
          if (attempt < HOWTO_ATTEMPTS) {
            console.log(`HOWTO RETRY: articol prea scurt (${words}/${HOWTO_MIN_WORDS})`);
          } else {
            console.log(`HOWTO SKIP: articol prea scurt (${words}/${HOWTO_MIN_WORDS})`);
          }
          continue;
        }
      }

      return article;
    } catch (err) {
      console.error(
        `HOWTO ERROR (attempt ${attempt}/${HOWTO_ATTEMPTS}):`,
        err.message
      );
    }
  }

  return null;
}
