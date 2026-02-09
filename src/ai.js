// src/ai.js
import OpenAI from "openai";
import { NEWS_REWRITE_PROMPT } from "./prompts.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

export async function rewriteNews(rawContent) {
  try {
    const prompt = NEWS_REWRITE_PROMPT.replace("{{CONTENT}}", rawContent);

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Ești un jurnalist profesionist." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    });

    const text = response.choices[0]?.message?.content;

    if (!text) {
      console.log("AI ERROR: empty response");
      return null;
    }

    if (wordCount(text) < 450) {
      console.log("AI SKIP: articol prea scurt");
      return null;
    }

    return text;
  } catch (err) {
    console.error("AI ERROR:", err.message);
    return null;
  }
}
