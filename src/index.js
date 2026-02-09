import { generateArticle } from "./generator.js";
import { generateDiscoverHeadline } from "./headline.js";
import { publishPost, uploadImage } from "./wordpress.js";
import { downloadImage } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";

const BATCH_SIZE = 3;

const categories = [
  { name: "politica", id: 4058, weight: 40 },
  { name: "social", id: 4063, weight: 25 },
  { name: "economie", id: 4064, weight: 15 },
  { name: "externe", id: 4060, weight: 20 }
];

function pickCategory() {
  const total = categories.reduce((s, c) => s + c.weight, 0);
  let rand = Math.random() * total;
  for (const c of categories) {
    if (rand < c.weight) return c;
    rand -= c.weight;
  }
}

async function run() {
  console.log("START SCRIPT");

  for (let i = 1; i <= BATCH_SIZE; i++) {
    const cat = pickCategory();

    if (isDuplicate(cat.name)) continue;

    const title = await generateDiscoverHeadline(cat.name);
    const article = await generateArticle(cat.name);

    await downloadImage(article.focus_keyword);
    const imageId = await uploadImage();

    await publishPost(
      {
        title,
        ...article
      },
      cat.id,
      imageId
    );

    saveTopic(cat.name);
    await new Promise(r => setTimeout(r, 15000));
  }

  console.log("DONE");
}

run();
