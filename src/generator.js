import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function todayRO() {
  return new Date().toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
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
  "content": "",
  "focus_keyword": ""
}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.4,
    messages: [{ role: "user", content: prompt }]
  });

  return JSON.parse(response.choices[0].message.content);
}
