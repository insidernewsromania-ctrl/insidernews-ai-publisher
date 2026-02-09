import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateDiscoverHeadline(topic) {
  const prompt = `
Generează UN TITLU de știre optimizat pentru Google Discover.

REGULI STRICTE:
- max 70 caractere
- fără emoji
- fără ALL CAPS
- fără cuvinte senzaționaliste (șoc, bombă, incredibil)
- stil jurnalistic profesionist
- clar, factual
- atractiv dar sobru

EXEMPLE BUNE:
- "Guvernul pregătește o nouă măsură fiscală pentru IMM-uri"
- "Creșterea prețurilor la energie afectează economia României"

SUBIECT: ${topic}

Răspuns DOAR titlul, fără ghilimele.
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 60,
    messages: [{ role: "user", content: prompt }]
  });

  return res.choices[0].message.content
    .replace(/[#*_`]/g, "")
    .trim();
}
