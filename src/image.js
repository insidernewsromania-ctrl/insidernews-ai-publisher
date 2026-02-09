import axios from "axios";
import fs from "fs";

export async function downloadImage(keyword) {
  const url = `https://source.unsplash.com/1600x900/?${encodeURIComponent(keyword)}`;
  const res = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync("image.jpg", res.data);
}
