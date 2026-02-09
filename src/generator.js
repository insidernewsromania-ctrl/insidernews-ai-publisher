import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateArticle(topic) {
  const prompt = `
Scrie un articol de știri în limba română.

REGULI OBLIGATORII:
- Doar informații verificabile
- Fără speculații, anticipări sau zvonuri
- Fără "ar putea", "se discută", "surse spun"
- Stil jurnalistic neutru
- Fără concluzii personale
- Fără titlu în conținut

STRUCTURĂ WORDPRESS:
<p>Introducere clară</p>
<h2>Context</h2>
<p>Paragrafe</p>
<h2>Detalii relevante</h2>
<p>Paragrafe</p>

SEO:
- meta_title (max 60 caractere)
- meta_description (max 160 caractere)
- focus_keyword
- 5–8 tag-uri SEO (fără diacritice)

FORMAT JSON STRICT:
{
  "content_html": "",
  "meta_title": "",
  "meta_description": "",
  "focus_keyword": "",
  "tags": []
}

SUBIECT: ${topic}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.35,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }]
  });

  return JSON.parse(res.choices[0].message.content);
}
