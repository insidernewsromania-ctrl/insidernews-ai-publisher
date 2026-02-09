import { generateArticle } from "./generator.js";
import { publishPost } from "./wordpress.js";

const CATEGORIES = [
  { name: "Politică", id: 4058 },
  { name: "Social", id: 4063 },
  { name: "Economie", id: 4064 },
  { name: "Externe", id: 4060 },
  { name: "Ultimele știri", id: 7 }
];

async function run() {
  console.log("START SCRIPT");

  let count = 0;

  for (const cat of CATEGORIES) {
    for (let i = 0; i < 6; i++) {
      count++;
      console.log(`Generating article ${count}/30 → ${cat.name}`);

      const article = await generateArticle(cat.name);
      await publishPost({
        title: article.title,
        content: article.content,
        category: cat.id
      });

      // protecție rate limit
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

run();
