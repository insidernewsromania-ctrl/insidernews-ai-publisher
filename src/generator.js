import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateArticle(topic) {
  const prompt = `
Scrie un articol de presă în limba română.

REGULI OBLIGATORII:
- OUTPUT DOAR JSON
- Conținut HTML valid WordPress
- FĂRĂ Markdown (#, ##, **, *)
- FĂRĂ emoji
- Stil jurnalistic profesionist
- 600–900 cuvinte
- Structură:
  <h1>Titlu</h1>
  <p>Paragrafe</p>
  <h2>Subtitluri</h2>

SEO:
- meta_title max 60 caractere
- meta_description max 160 caractere
- focus_keyword clar
- 5–8 tag-uri SEO (fără diacritice)

FORMAT RĂSPUNS:
{
  "title": "",
  "content_html": "",
  "meta_title": "",
  "meta_description": "",
  "focus_keyword": "",
  "tags": []
}

TOPIC: ${topic}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }]
  });

  return JSON.parse(res.choices[0].message.content);
}
