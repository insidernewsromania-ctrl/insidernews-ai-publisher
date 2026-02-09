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

function isAnchoredInToday(content) {
  const text = content.toLowerCase();
  return (
    text.includes("astăzi") ||
    text.includes("în cursul zilei") ||
    text.includes("a anunțat") ||
    text.includes("au anunțat")
  );
}

async function run() {
  console.log("START SCRIPT – single article");

  const cat = pickRandomCategory();
  console.log("Selected category:", cat.name);

  let title;
  let article;

  // 1. Generate headline
  try {
    title = await generateDiscoverHeadline(cat.name);

    if (!title || title.length < 10) {
      console.log("Invalid title. Exiting.");
      process.exit(0);
    }

    // Duplicate check STRICT pe titlu
    if (isDuplicate(title)) {
      console.log("Duplicate title detected. Skipping run.");
      process.exit(0);
    }
  } catch (err) {
    console.error("Headline generation failed:", err.message);
    process.exit(0);
  }

  // 2. Generate article
  try {
    article = await generateArticle(cat.name);

    if (!article || !article.content) {
      console.log("Invalid article content. Exiting.");
      process.exit(0);
    }

    article.title = title;

    // 🔒 Asigurare că știrea este ancorată în prezent
    if (!isAnchoredInToday(article.content)) {
      console.log("Article not clearly anchored in today. Skipped.");
      process.exit(0);
    }
  } catch (err) {
    console.error("Article generation failed:", err.message);
    process.exit(0);
  }

  // 3. Image (optional, nu blochează)
  let imageId = null;

  try {
    if (article.focus_keyword) {
      await downloadImage(article.focus_keyword);
      imageId = await uploadImage();
    }
  } catch {
    console.log("Image skipped.");
  }

  // 4. Publish
  try {
    await publishPost(article, cat.id, imageId);
  } catch (err) {
    console.error("Publish failed:", err.message);
    process.exit(0);
  }

  // 5. Save history (TITLU)
  saveTopic(title);

  console.log("DONE – article published successfully");
  process.exit(0);
}

run();
