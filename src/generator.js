import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// curăță titlul de #, *, markdown
function cleanTitle(title) {
  return title
    .replace(/[#*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// transformă textul AI în HTML WordPress curat
function formatToHTML(text) {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  let html = "";

  for (let line of lines) {
    // elimină orice ** din linie
    const cleanedLine = line.replace(/\*\*/g, "").trim();

    // dacă e subtitlu (scurt + nu se termină cu punct)
    if (cleanedLine.length < 120 && !cleanedLine.endsWith(".")) {
      html += `<h2>${cleanedLine}</h2>\n`;
    } else {
      html += `<p>${cleanedLine}</p>\n`;
    }
  }

  return html;
}

export async function generateArticle(topic) {
  const prompt = `
Scrie un articol de știri jurnalistic, obiectiv, în limba română.

REGULI STRICTE:
- FĂRĂ markdown (#, **, *)
- FĂRĂ emoji
- Titlu clar, o singură propoziție
- 3–5 subtitluri tematice
- Paragrafe scurte, clare

Subiect: ${topic}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5
  });

  const rawText = completion.choices[0].message.content;

  const lines = rawText.split("\n").filter(Boolean);
  const rawTitle = lines.shift();

  return {
    title: cleanTitle(rawTitle),
    content: formatToHTML(lines.join("\n"))
  };
}
