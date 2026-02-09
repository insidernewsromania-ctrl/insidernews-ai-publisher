import { collectNews } from "./rss.js";
import { rewriteNews } from "./ai.js";
import { generateArticle } from "./generator.js";
import { publishPost, uploadImage, isPostDuplicate } from "./wordpress.js";
import { downloadImage } from "./image.js";
import { isDuplicate, saveTopic } from "./history.js";
import { hoursSince, isRecent, normalizeText } from "./utils.js";

const categories = [
  { name: "politica", id: 4058 },
  { name: "social", id: 4063 },
  { name: "economie", id: 4064 },
  { name: "externe", id: 4060 },
];

const POSTS_PER_RUN = Number(process.env.POSTS_PER_RUN || "1");
const CANDIDATE_LIMIT = Number(process.env.CANDIDATE_LIMIT || "12");
const RECENT_HOURS = Number(process.env.RECENT_HOURS || "36");
const MIN_CONTENT_CHARS = Number(process.env.MIN_CONTENT_CHARS || "120");

const BREAKING_KEYWORDS = [
  "breaking",
  "ultima ora",
  "alerta",
  "urgent",
  "cutremur",
  "explozie",
  "incendiu",
  "atac",
  "tragedie",
  "accident",
  "evacuare",
  "victime",
];

function pickRandomCategory() {
  return categories[Math.floor(Math.random() * categories.length)];
}

function isBreakingTitle(title) {
  const normalized = normalizeText(title);
  return BREAKING_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function scoreItem(item) {
  let score = 0;
  if (item.title && isBreakingTitle(item.title)) score += 4;
  if (item.source && normalizeText(item.source).includes("breaking")) score += 2;
  const hours = hoursSince(item.publishedAt);
  if (hours !== null) {
    if (hours <= 3) score += 3;
    else if (hours <= 12) score += 2;
    else if (hours <= 24) score += 1;
  }
  if ((item.content || "").length > 160) score += 1;
  return score;
}

function stripH1(html) {
  if (!html) return "";
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "").trim();
}

function prepareCandidates(items) {
  const withContent = items.filter(item => {
    const size = (item.content || "").length;
    return item.title && (size >= MIN_CONTENT_CHARS || item.title.length > 20);
  });

  const recent = withContent.filter(item =>
    isRecent(item.publishedAt, RECENT_HOURS)
  );

  const pool = recent.length > 0 ? recent : withContent;

  return pool.sort((a, b) => scoreItem(b) - scoreItem(a));
}

async function maybeUploadImage(article) {
  let imageId = null;
  try {
    if (article.focus_keyword) {
      await downloadImage(article.focus_keyword);
      imageId = await uploadImage();
    }
  } catch (err) {
    console.log("Image skipped:", err.message);
  }
  return imageId;
}

async function tryPublishArticle(article, categoryId, sourceUrl) {
  if (isDuplicate({ title: article.title, url: sourceUrl })) {
    console.log("Duplicate detected in history. Skipping.");
    return false;
  }

  try {
    const titlesToCheck = [article.title, article.seo_title]
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index);

    for (const title of titlesToCheck) {
      if (await isPostDuplicate(title)) {
        console.log("Duplicate detected in WordPress. Skipping.");
        return false;
      }
    }
  } catch (err) {
    console.warn("WP duplicate check failed:", err.message);
  }

  const imageId = await maybeUploadImage(article);

  try {
    await publishPost(article, categoryId, imageId);
  } catch (err) {
    console.error("Publish failed:", err.message);
    return false;
  }

  saveTopic({ title: article.title, url: sourceUrl });
  console.log("Published:", article.title);
  return true;
}

async function publishFromRssItem(item) {
  if (isDuplicate({ title: item.title, url: item.link })) {
    console.log("Duplicate source item. Skipping:", item.title);
    return false;
  }

  const raw = [item.title, item.content].filter(Boolean).join("\n\n");
  const article = await rewriteNews(raw, item.title);

  if (!article) return false;

  article.content_html = stripH1(article.content_html);

  if (!article.focus_keyword) {
    article.focus_keyword = item.title
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
  }

  if (!Array.isArray(article.tags) || article.tags.length === 0) {
    const fallbackTag = item.title.split(/\s+/).slice(0, 4).join(" ");
    article.tags = fallbackTag ? [fallbackTag] : [];
  }

  return tryPublishArticle(article, item.categoryId, item.link);
}

async function publishFallbackArticle() {
  const cat = pickRandomCategory();
  console.log("Fallback category:", cat.name);
  const article = await generateArticle(cat.name);
  if (!article) return false;

  article.content_html = stripH1(article.content_html);

  if (!article.focus_keyword) {
    article.focus_keyword = article.title
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
  }

  return tryPublishArticle(article, cat.id, null);
}

async function run() {
  console.log("START SCRIPT – auto publish");

  const postsTarget = Number.isFinite(POSTS_PER_RUN) && POSTS_PER_RUN > 0
    ? POSTS_PER_RUN
    : 1;

  const items = await collectNews(
    Math.max(CANDIDATE_LIMIT, postsTarget * 4)
  );
  console.log("Collected items:", items.length);

  const candidates = prepareCandidates(items);
  let published = 0;

  for (const item of candidates) {
    if (published >= postsTarget) break;
    const success = await publishFromRssItem(item);
    if (success) published += 1;
  }

  if (published === 0) {
    console.log("No RSS article published. Trying fallback generation.");
    const fallback = await publishFallbackArticle();
    if (fallback) published += 1;
  }

  console.log(`DONE – published ${published} article(s)`);
  process.exit(0);
}

run();
