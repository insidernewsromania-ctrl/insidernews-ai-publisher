import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateDiscoverHeadline(topic) {
  const prompt = `
Generează UN titlu de știre pentru Google Discover.

REGULI:
- max 70 caractere
- fără emoji
- fără # * !
- fără clickbait
- factual
- profesionist
- stil presă

SUBIECT: ${topic}

Răspunde DOAR cu titlul.
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 60,
    messages: [{ role: "user", content: prompt }]
  });

  return res.choices[0].message.content
    .replace(/[#*_!`]/g, "")
    .trim();
}
