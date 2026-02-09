import axios from "axios";

const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

export async function publishPost({ title, content, category }) {
  console.log("Publishing to:", WP_URL);

  const auth = Buffer.from(
    `${WP_USER}:${WP_APP_PASSWORD}`
  ).toString("base64");

  const response = await axios.post(
    `${WP_URL}/wp-json/wp/v2/posts`,
    {
      title,
      content,
      status: "publish",
      categories: [category]
    },
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("WordPress response:", response.status);
  console.log("Post URL:", response.data.link);
}
