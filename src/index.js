import { publishPost } from "./wordpress.js";

async function run() {
  console.log("START webhook test");

  await publishPost({
    title: "TEST FINAL – publicare automată prin webhook",
    content: "<p>Dacă vezi acest articol, automatizarea funcționează perfect.</p>",
    category: 4059
  });

  console.log("END webhook test");
}

run();
