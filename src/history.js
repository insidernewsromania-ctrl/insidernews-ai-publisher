import fs from "fs";

const FILE = "data/used_topics.json";

export function isDuplicate(topic) {
  if (!fs.existsSync(FILE)) return false;
  const used = JSON.parse(fs.readFileSync(FILE));
  return used.includes(topic);
}

export function saveTopic(topic) {
  let used = [];
  if (fs.existsSync(FILE)) {
    used = JSON.parse(fs.readFileSync(FILE));
  }
  used.push(topic);
  fs.writeFileSync(FILE, JSON.stringify(used.slice(-500)));
}
