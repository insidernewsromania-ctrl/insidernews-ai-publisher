import axios from "axios";
import fs from "fs";

export async function uploadImage() {
  const res = await axios.post(
    `${process.env.WP_URL}/wp-json/wp/v2/media`,
    fs.createReadStream("temp.jpg"),
    {
      headers: {
        "Authorization":
          "Basic " +
          Buffer.from(
            `${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`
          ).toString("base64"),
        "Content-Disposition": "attachment; filename=featured.jpg",
        "Content-Type": "image/jpeg"
      }
    }
  );
  return res.data.id;
}

export async function publishPost(article, categoryId, imageId) {
  await axios.post(
    `${process.env.WP_URL}/wp-json/ai/v1/publish`,
    {
      title: article.title,
      content: article.content_html,
      category: categoryId,
      featured_media: imageId,
      tags: article.tags,
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
