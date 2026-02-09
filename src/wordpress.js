import axios from "axios";

export async function publishPost({ title, content, category }) {
  const response = await axios.post(
    "https://insidernews.ro/wp-json/ai/v1/publish",
    {
      title,
      content,
      category
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-AI-KEY": "insidernews_ai_2026"
      }
    }
  );

  console.log("Webhook response:", response.data);
  return response.data;
}
