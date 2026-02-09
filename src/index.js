import { generateArticle } from "./generator.js";
import { generateDiscoverHeadline } from "./headline.js";
import { publishPost, uploadImage } from "./wordpress.js";
import { downloadImage } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";

const BATCH_SIZE = 3; // MAXIM per rulare

const categories = [
  { name: "politica", id: 4058 },
  { name: "social", id: 4063 },
  { name: "economie", id: 4064 },
  { name: "externe", id: 4060 }
];

async function run() {
  console.log("START SCRIPT");

  for (let i = 0; i < BATCH_SIZE; i++) {
    const cat = categories[Math.floor(Math.random() * categories.length)];

    if (isDuplicate(cat.name)) continue;

    const title = await generateDiscoverHeadline(cat.name);
    const article = await generateArticle(cat.name);

    article.title = title;

    await downloadImage(article.focus_keyword);
    const imageId = await uploadImage();

    await publishPost(article, cat.id, imageId);

    saveTopic(cat.name);

    await new Promise(r => setTimeout(r, 20000));
  }

  console.log("DONE");
}

run();
