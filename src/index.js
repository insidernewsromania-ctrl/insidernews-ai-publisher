import { publishPost } from "./wordpress.js";

async function run() {
  console.log("START TEST DIRECT");

  await publishPost({
    title: "TEST DIRECT WordPress REST",
    content: "<p>Dacă vezi acest draft, autentificarea funcționează.</p>"
  });

  console.log("END TEST");
}

run();
