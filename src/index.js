import { generateArticle } from "./generator.js";
import { publishPost } from "./wordpress.js";

const ARTICLES_PER_RUN = 3;

const CATEGORIES = [
  { id: 4058, name: "politica", weight: 30 },   // România
  { id: 4063, name: "social", weight: 25 },     // România
  { id: 4064, name: "economie", weight: 25 },   // România
  { id: 4060, name: "externe", weight: 20 }     // Externe
];

function pickCategory() {
  const rand = Math.random() * 100;
  let sum = 0;
  for (const c of CATEGORIES) {
    sum += c.weight;
    if (rand <= sum) return c;
  }
  return CATEGORIES[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log("START SCRIPT");

  for (let i = 1; i <= ARTICLES_PER_RUN; i++) {
    const category = pickCategory();
    console.log(`Generating article ${i}/3 → ${category.name}`);

    const article = await generateArticle(category.name);

    await publishPost({
      title: article.title,
      content: article.content,
      category: category.id
    });

    console.log(`Published: ${article.title}`);

    if (i < ARTICLES_PER_RUN) {
      await sleep(20_000); // pauză 20 sec
    }
  }

  console.log("RUN COMPLETED");
}

run().catch(err => {
  console.error("SCRIPT ERROR:", err);
  process.exit(1);
});
