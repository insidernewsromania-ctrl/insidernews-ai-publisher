import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function cleanTitle(title) {
  return title
    .replace(/[#*`_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatToHTML(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  let html = "";
  for (const line of lines) {
    if (
      line.toLowerCase().startsWith("titlu") ||
      line.toLowerCase().startsWith("###")
    ) {
      continue;
    }

    if (line.length < 120 && line.endsWith(":")) {
      html += `<h2>${line.replace(":", "")}</h2>\n`;
    } else {
      html += `<p>${line}</p>\n`;
    }
  }

  return html;
}

export async function generateArticle(topic) {
  const prompt = `
Scrie un articol de știri jurnalistic, obiectiv, fără emoji.
Limba: română.
Structură:
- Titlu clar (o singură propoziție)
- 3–5 subtitluri tematice
- Paragrafe scurte (2–4 fraze)

Subiect: ${topic}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6
  });

  const rawText = completion.choices[0].message.content;

  const lines = rawText.split("\n").filter(Boolean);
  const rawTitle = lines[0];
  const contentBody = lines.slice(1).join("\n");

  return {
    title: cleanTitle(rawTitle),
    content: formatToHTML(contentBody)
  };
}
