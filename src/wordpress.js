import axios from "axios";

export async function publishPost({ title, content, category }) {
  const response = await axios.post(
    "https://insidernews.ro/?ai_webhook=publish",
    {
      title,
      content,
      category
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-AI-KEY": "EfVB_Ihhh_MdvE_cRuk_pBGP_zNnG"
      }
    }
  );

  console.log("Webhook response:", response.data);
}
