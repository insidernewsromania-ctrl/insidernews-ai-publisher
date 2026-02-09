import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateArticle(category) {
  const prompt = `
Scrie un articol de știri jurnalistic, profesionist, în limba română.
Categorie: ${category}
Reguli:
- fără surse menționate
- stil clar, factual
- 600–800 cuvinte
- titlu puternic
- fără concluzie etichetată
- structurat pentru WordPress
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6
  });

  const text = response.choices[0].message.content;

  const lines = text.split("\n").filter(Boolean);
  const title = lines.shift();
  const content = lines.join("\n");

  return { title, content };
}
