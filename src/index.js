import { publishPost } from "./wordpress.js";

console.log("START SCRIPT");

async function run() {
  console.log("IN RUN()");

  const data = {
    title: "TEST DIN GITHUB ACTIONS",
    content: "<p>Dacă vezi acest articol, GitHub publică în WordPress.</p>",
    category: 4059
  };

  console.log("DATA:", data);

  const result = await publishPost(data);

  console.log("RESULT:", result);
}

run()
  .then(() => {
    console.log("SCRIPT END OK");
  })
  .catch(err => {
    console.error("SCRIPT ERROR:", err);
    process.exit(1);
  });
