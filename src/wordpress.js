import axios from "axios";
import fs from "fs";

const auth = {
  username: process.env.WP_USER,
  password: process.env.WP_APP_PASSWORD
};

export async function uploadImage() {
  const img = fs.readFileSync("image.jpg");

  const res = await axios.post(
    `${process.env.WP_URL}/wp-json/wp/v2/media`,
    img,
    {
      auth,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": "attachment; filename=image.jpg"
      }
    }
  );

  return res.data.id;
}

export async function publishPost(article, categoryId, imageId) {
  await axios.post(
    `${process.env.WP_URL}/wp-json/wp/v2/posts`,
    {
      title: article.title,
      content: article.content_html,
      status: "publish",
      categories: [categoryId],
      featured_media: imageId,
      tags: article.tags
    },
    { auth }
  );
}
