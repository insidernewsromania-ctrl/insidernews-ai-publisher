import axios from "axios";

export async function publishPost(article) {
  const url = `${process.env.WP_URL}/wp-json/ai/v1/publish`;

  await axios.post(
    url,
    {
      title: article.title,
      content: article.content_html,
      category: article.category,
      meta: {
        rank_math_title: article.meta_title,
        rank_math_description: article.meta_description,
        rank_math_focus_keyword: article.focus_keyword
      }
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-AI-KEY": "insidernews_ai_2026"
      }
    }
  );
}
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
