import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateArticle(topic) {
  const prompt = `
Scrie un articol de presă în limba română, stil jurnalistic profesionist.

REGULI OBLIGATORII:
- OUTPUT DOAR HTML VALID WordPress
- FĂRĂ Markdown (#, ##, **, *)
- FĂRĂ emoji
- FĂRĂ semne speciale în titlu
- Structură:
  <h1>Titlu</h1>
  <p>Paragrafe</p>
  <h2>Subtitluri</h2>
- 600–900 cuvinte
- Ton neutru, informativ

SEO:
- Creează și:
  - meta_title (max 60 caractere)
  - meta_description (max 160 caractere)
  - focus_keyword (1 expresie clară)

Răspuns STRICT în format JSON:
{
  "title": "",
  "content_html": "",
  "meta_title": "",
  "meta_description": "",
  "focus_keyword": ""
}

TOPIC: ${topic}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    max_tokens: 1400,
    messages: [{ role: "user", content: prompt }]
  });

  return JSON.parse(res.choices[0].message.content);
}
