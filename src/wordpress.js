import axios from "axios";

export async function publishPost({ title, content, category }) {
  const url = `${process.env.WP_URL}/wp-json/ai/v1/publish`;

  const response = await axios.post(
    url,
    {
      title,
      content,
      category
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-AI-KEY": "insidernews_ai_2026"
      },
      timeout: 30_000
    }
  );

  return response.data;
}
