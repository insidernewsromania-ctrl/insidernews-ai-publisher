import { generateArticle } from "./generator.js";
import { publishPost } from "./wordpress.js";

const BATCH_SIZE = 3; // MAX 3 articole per rulare

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
    console.log(`Generating article ${i}/${BATCH_SIZE} → ${cat.name}`);

    const article = await generateArticle(cat.name);
    await publishPost({
      ...article,
      category: cat.id
    });

    // pauză obligatorie (anti rate-limit)
    await new Promise(r => setTimeout(r, 15000));
  }

  console.log("DONE");
}

run();
