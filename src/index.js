import { generateArticle } from "./generator.js";
import { generateDiscoverHeadline } from "./headline.js";
import { publishPost, uploadImage } from "./wordpress.js";
import { downloadImage } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";

const categories = [
  { name: "politica", id: 4058 },
  { name: "social", id: 4063 },
  { name: "economie", id: 4064 },
  { name: "externe", id: 4060 }
];

function pickRandomCategory() {
  return categories[Math.floor(Math.random() * categories.length)];
}

async function run() {
  console.log("START SCRIPT – single article");

  const cat = pickRandomCategory();
  console.log("Category:", cat.name);

  let title;
  let article;

  try {
    title = await generateDiscoverHeadline(cat.name);

    // 🔴 DUPLICATE CHECK PE TITLU, NU PE CATEGORIE
    if (isDuplicate(title)) {
      console.log("Duplicate title detected. Skipping run.");
      process.exit(0);
    }

    article = await generateArticle(cat.name);
    article.title = title;
  } catch (err) {
    console.error("Generation failed:", err.message);
    process.exit(0);
  }

  let imageId = null;

  try {
    await downloadImage(article.focus_keyword);
    imageId = await uploadImage();
  } catch {
    console.log("Image skipped.");
  }

  try {
    await publishPost(article, cat.id, imageId);
  } catch (err) {
    console.error("Publish failed:", err.message);
    process.exit(0);
  }

  // ✅ Salvezi TITLUL, nu categoria
  saveTopic(title);

  console.log("DONE – article published");
  process.exit(0);
}

run();
