import axios from "axios";

export async function publishPost({ title, content }) {
  const url = "https://insidernews.ro/wp-json/wp/v2/posts";

  const auth = Buffer.from(
    "ai_publisher:EfVB_Ihhh_MdvE_cRuk_pBGP_zNnG"
  ).toString("base64");

  const response = await axios.post(
    url,
    {
      title,
      content,
      status: "draft"
    },
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("STATUS:", response.status);
  console.log("ID POST:", response.data.id);
}
