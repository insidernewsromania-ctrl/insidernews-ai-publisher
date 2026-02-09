import fs from "fs";

const FILE = "data/used_topics.json";

export function loadHistory() {
  if (!fs.existsSync(FILE)) return [];
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

export function saveTopic(topic) {
  const history = loadHistory();
  history.push({
    topic,
    date: new Date().toISOString()
  });
  fs.writeFileSync(FILE, JSON.stringify(history, null, 2));
}

export function isDuplicate(topic) {
  const history = loadHistory();
  return history.some(t => t.topic.toLowerCase() === topic.toLowerCase());
}
