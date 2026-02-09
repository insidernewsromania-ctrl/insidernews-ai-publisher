import axios from "axios";
import fs from "fs";

export async function downloadImage(keyword) {
  const url = `https://source.unsplash.com/1200x800/?${encodeURIComponent(
    keyword
  )}`;

  const res = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync("temp.jpg", res.data);
}
