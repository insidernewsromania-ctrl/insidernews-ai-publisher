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
  console.log("START SCRIPT – single article mode");

  const cat = pickRandomCategory();
  console.log(`Selected category: ${cat.name}`);

  // Evitare duplicate
  if (isDuplicate(cat.name)) {
    console.log("Duplicate topic detected. Exiting clean.");
    process.exit(0);
  }

  let article;
  let title;

  try {
    title = await generateDiscoverHeadline(cat.name);
    article = await generateArticle(cat.name);
  } catch (err) {
    console.error("AI generation failed:", err.message || err);
    // EXIT CURAT – workflow = SUCCESS
    process.exit(0);
  }

  article.title = title;

  let imageId = null;

  try {
    await downloadImage(article.focus_keyword);
    imageId = await uploadImage();
  } catch (err) {
    console.warn("Image failed, publishing without image.");
  }

  try {
    await publishPost(article, cat.id, imageId);
  } catch (err) {
    console.error("Publish failed:", err.message || err);
    process.exit(0);
  }

  saveTopic(cat.name);

  console.log("DONE – article published successfully");
  process.exit(0);
}

run();
