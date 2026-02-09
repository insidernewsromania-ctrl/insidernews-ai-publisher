import axios from "axios";
import fs from "fs";

function pickQuery(primary, fallback) {
  const clean = value => (value || "").toString().trim();
  const first = clean(primary);
  if (first) return first;
  const second = clean(fallback);
  if (second) return second;
  return "";
}

export async function downloadImage(keyword, fallbackKeyword) {
  const query = pickQuery(keyword, fallbackKeyword);
  if (!query) {
    throw new Error("Missing image query");
  }
  const url = `https://source.unsplash.com/1600x900/?${encodeURIComponent(query)}`;
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const contentType = res.headers?.["content-type"] || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Invalid image response");
  }
  fs.writeFileSync("image.jpg", res.data);
}
