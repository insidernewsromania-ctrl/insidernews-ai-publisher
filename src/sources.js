// src/sources.js

export const DAILY_TARGET = {
  min: 20,
  max: 30,
};

export const MIX = {
  romania: 1.0,
  externe: 0.0,
};

// ===== ROMÂNIA (100%) =====
export const ROMANIA_SOURCES = [
  {
    name: "Google News România – Ultimele știri",
    type: "rss",
    url: "https://news.google.com/rss?hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7, // Ultimele știri
    maxPerRun: 3,
  },
  {
    name: "Google News România – Breaking",
    type: "rss",
    url: "https://news.google.com/rss/search?q=%22ultima%20ora%22%20OR%20breaking%20OR%20alerta%20Romania&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7, // Ultimele știri
    maxPerRun: 3,
  },
  {
    name: "Google News – Agerpres",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Aagerpres.ro&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7,
    maxPerRun: 2,
  },
  {
    name: "Google News – HotNews",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Ahotnews.ro&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7,
    maxPerRun: 2,
  },
  {
    name: "Google News – Digi24",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Adigi24.ro&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7,
    maxPerRun: 2,
  },
  {
    name: "Google News – ProTV",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Astirileprotv.ro&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7,
    maxPerRun: 2,
  },
  {
    name: "Google News – G4Media",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Ag4media.ro&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7,
    maxPerRun: 2,
  },
  {
    name: "Google News – Economica",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Aeconomica.net&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 4064,
    maxPerRun: 2,
  },
  {
    name: "Google News – ZF",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Azf.ro&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 4064,
    maxPerRun: 2,
  },
  {
    name: "Google News – Mediafax",
    type: "rss",
    url: "https://news.google.com/rss/search?q=site%3Amediafax.ro&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 7,
    maxPerRun: 2,
  },
  {
    name: "Google News România – Politică",
    type: "rss",
    url: "https://news.google.com/rss/search?q=politica+Romania&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 4058, // Politică
    maxPerRun: 2,
  },
  {
    name: "Google News România – Social",
    type: "rss",
    url: "https://news.google.com/rss/search?q=eveniment+Romania&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 4063, // Social
    maxPerRun: 2,
  },
  {
    name: "Google News România – Economie",
    type: "rss",
    url: "https://news.google.com/rss/search?q=economie+Romania&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 4064, // Economie
    maxPerRun: 2,
  },
];

// ===== EXTERNE (0%) =====
export const EXTERNE_SOURCES = [
  {
    name: "Google News – Europa",
    type: "rss",
    url: "https://news.google.com/rss/search?q=Europa+stiri&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 4060, // Externe
    maxPerRun: 2,
  },
  {
    name: "Google News – Internațional",
    type: "rss",
    url: "https://news.google.com/rss/search?q=international+stiri&hl=ro&gl=RO&ceid=RO:ro",
    categoryId: 4060, // Externe
    maxPerRun: 2,
  },
];
