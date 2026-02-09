import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function todayRO() {
  return new Date().toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit"
  });
}

export async function generateDiscoverHeadline(category) {
  const today = todayRO();

  const prompt = `
Generează un TITLU de știre despre un EVENIMENT produs sau anunțat ASTĂZI (${today}).

REGULI:
- Eveniment actual, nu analiză
- Poate face referire la ani anteriori DOAR dacă este context
- Fără simboluri (#, *, **)
- Stil: presă online din România

Categoria: ${category}

Returnează DOAR titlul.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }]
  });

  return response.choices[0].message.content.trim();
}
