import { publishPost } from "./wordpress.js";

async function run() {
  console.log("START publisher");

  try {
    await publishPost({
      title: "TEST GitHub Actions → WordPress",
      content: "<p>Dacă vezi acest articol, integrarea funcționează.</p>",
      category: 4059
    });

    console.log("POST trimis cu succes");
  } catch (error) {
    console.error("EROARE la publicare:", error.response?.data || error.message);
  }

  console.log("END publisher");
}

run();

