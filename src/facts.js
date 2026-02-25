import { normalizeText, stripHtml } from "./utils.js";

const ROLE_PATTERN = String.raw`(?:prim[-\s]?ministr(?:ul|ului)?|vicepremier(?:ul|ului)?|premier(?:ul|ului)?|primar(?:ul|ului)?|pre(?:ș|s)edinte(?:le|lui)?|ministr(?:ul|ului|u)?|secretar(?:ul|ului)?\s+de\s+stat|senator(?:ul|ului)?|deputat(?:ul|ului)?|europarlamentar(?:ul|ului)?|judec[aă]tor(?:ul|ului)?|guvernator(?:ul|ului)?|procuror(?:ul|ului)?|prefect(?:ul|ului)?|avocat(?:ul|ului|a)?|director(?:ul|ului)?|purt[aă]tor(?:ul|ului)?\s+de\s+cuv[aâ]nt)`;
const NAME_PATTERN = String.raw`[A-ZĂÂÎȘȚ][\p{L}'’\-]+(?:\s+[A-ZĂÂÎȘȚ][\p{L}'’\-]+){1,2}`;

const ROLE_THEN_NAME_REGEX = new RegExp(
  String.raw`\b(${ROLE_PATTERN})\s+(${NAME_PATTERN})`,
  "giu"
);
const NAME_THEN_ROLE_REGEX = new RegExp(
  String.raw`(${NAME_PATTERN})\s*,\s*(${ROLE_PATTERN})`,
  "giu"
);

function canonicalRole(roleText) {
  const role = normalizeText(roleText || "");
  if (!role) return null;
  if (role.includes("prim ministr") || role.includes("premier")) return "premier";
  if (role.includes("primar")) return "primar";
  if (role.includes("presedinte")) return "presedinte";
  if (role.includes("ministr")) return "ministru";
  if (role.includes("senator")) return "senator";
  if (role.includes("deputat")) return "deputat";
  if (role.includes("judecator")) return "judecator";
  if (role.includes("guvernator")) return "guvernator";
  if (role.includes("procuror")) return "procuror";
  if (role.includes("avocat")) return "avocat";
  if (role.includes("director")) return "director";
  return null;
}

function displayRole(role) {
  const labels = {
    premier: "premier",
    primar: "primar",
    presedinte: "presedinte",
    ministru: "ministru",
    senator: "senator",
    deputat: "deputat",
    judecator: "judecator",
    guvernator: "guvernator",
    procuror: "procuror",
    avocat: "avocat",
    director: "director",
  };
  return labels[role] || role || "";
}

function cleanName(name) {
  return (name || "")
    .replace(/\s+/g, " ")
    .replace(/[,:;.!?]+$/g, "")
    .trim();
}

function looksLikePersonName(name) {
  const clean = cleanName(name);
  if (!clean) return false;
  const tokens = clean.split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 3) return false;
  return tokens.every(token => /^[A-ZĂÂÎȘȚ]/u.test(token));
}

function addClaim(claims, nameRaw, roleRaw, maxClaims) {
  const name = cleanName(nameRaw);
  if (!looksLikePersonName(name)) return;

  const role = canonicalRole(roleRaw);
  if (!role) return;

  const key = normalizeText(name);
  if (!key) return;
  if (!claims.has(key) && claims.size >= maxClaims) return;

  const current = claims.get(key) || { name, roles: new Set() };
  current.roles.add(role);
  claims.set(key, current);
}

export function extractPersonRoleClaims(text, options = {}) {
  const maxClaimsRaw = Number(options.maxClaims || 8);
  const maxClaims = Number.isFinite(maxClaimsRaw)
    ? Math.max(1, Math.floor(maxClaimsRaw))
    : 8;

  const source = stripHtml(text || "").replace(/\s+/g, " ").trim();
  const claims = new Map();
  if (!source) return claims;

  for (const match of source.matchAll(ROLE_THEN_NAME_REGEX)) {
    addClaim(claims, match[2], match[1], maxClaims);
  }
  for (const match of source.matchAll(NAME_THEN_ROLE_REGEX)) {
    addClaim(claims, match[1], match[2], maxClaims);
  }

  return claims;
}

export function buildRoleConstraintsFromClaims(claims) {
  if (!(claims instanceof Map) || claims.size === 0) {
    return "- Pastreaza functiile oficiale exact asa cum apar in sursa.";
  }

  const lines = [];
  for (const claim of claims.values()) {
    const roles = [...claim.roles].map(displayRole).filter(Boolean);
    if (roles.length === 0) continue;
    if (roles.length === 1) {
      lines.push(`- Pentru ${claim.name}, foloseste functia «${roles[0]}».`);
    } else {
      lines.push(`- Pentru ${claim.name}, functiile valide sunt: ${roles.join(", ")}.`);
    }
  }
  if (lines.length === 0) {
    return "- Pastreaza functiile oficiale exact asa cum apar in sursa.";
  }
  return lines.join("\n");
}

export function findRoleMismatches(sourceClaims, generatedText) {
  if (!(sourceClaims instanceof Map) || sourceClaims.size === 0) return [];

  const generatedClaims = extractPersonRoleClaims(generatedText, { maxClaims: 20 });
  const mismatches = [];

  for (const [nameKey, sourceClaim] of sourceClaims.entries()) {
    const generatedClaim = generatedClaims.get(nameKey);
    if (!generatedClaim) continue;

    for (const generatedRole of generatedClaim.roles) {
      if (!sourceClaim.roles.has(generatedRole)) {
        mismatches.push({
          name: sourceClaim.name,
          expected: [...sourceClaim.roles].map(displayRole),
          found: displayRole(generatedRole),
        });
        break;
      }
    }
  }

  return mismatches;
}

export function formatRoleMismatchSummary(mismatches) {
  if (!Array.isArray(mismatches) || mismatches.length === 0) return "";
  return mismatches
    .slice(0, 4)
    .map(item => `${item.name}: ${item.found} (expected ${item.expected.join("/")})`)
    .join("; ");
}

const PERSON_NAME_REGEX = new RegExp(
  String.raw`\b([A-ZĂÂÎȘȚ][\p{L}'’\-]{1,30}\s+[A-ZĂÂÎȘȚ][\p{L}'’\-]{1,30}(?:\s+[A-ZĂÂÎȘȚ][\p{L}'’\-]{1,30})?)\b`,
  "gu"
);

const NON_PERSON_NAME_TOKENS = new Set(
  [
    "romania",
    "romaniei",
    "guvernul",
    "guvernului",
    "premierul",
    "presedintele",
    "primarul",
    "domnul",
    "doamna",
    "ministrul",
    "senatorul",
    "deputatul",
    "ministerul",
    "ministerului",
    "sanatatii",
    "educatiei",
    "economiei",
    "parlamentul",
    "senatul",
    "camera",
    "deputatilor",
    "curtea",
    "constitutionala",
    "consiliul",
    "judetean",
    "primaria",
    "prefectura",
    "ue",
    "nato",
    "sua",
    "ucraina",
    "rusia",
    "uniunea",
    "europeana",
    "comisia",
    "europeana",
    "politia",
    "romana",
    "inspectoratul",
    "spitalul",
    "universitatea",
    "google",
    "news",
    "digi24",
    "mediafax",
    "g4media",
    "hotnews",
  ].map(token => normalizeText(token))
);

function splitNameParts(name) {
  return `${name || ""}`
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function normalizeNameKey(name) {
  return normalizeText(name || "").replace(/\s+/g, " ").trim();
}

function lastNameKey(name) {
  const parts = splitNameParts(name).map(part => normalizeText(part));
  return parts[parts.length - 1] || "";
}

function looksLikeInstitutionName(name) {
  const tokens = splitNameParts(name).map(part => normalizeText(part));
  if (tokens.length < 2 || tokens.length > 3) return true;
  if (tokens.some(token => !token || token.length < 2)) return true;
  if (tokens.some(token => NON_PERSON_NAME_TOKENS.has(token))) return true;
  return false;
}

function extractPersonNames(text, options = {}) {
  const maxNamesRaw = Number(options.maxNames || 24);
  const maxNames = Number.isFinite(maxNamesRaw)
    ? Math.max(1, Math.floor(maxNamesRaw))
    : 24;
  const cleanText = stripHtml(text || "").replace(/\s+/g, " ").trim();
  const names = new Map();
  if (!cleanText) return names;

  for (const match of cleanText.matchAll(PERSON_NAME_REGEX)) {
    const candidate = cleanName(match[1]);
    if (!looksLikePersonName(candidate)) continue;
    if (looksLikeInstitutionName(candidate)) continue;
    const key = normalizeNameKey(candidate);
    if (!key || names.has(key)) continue;
    names.set(key, candidate);
    if (names.size >= maxNames) break;
  }
  return names;
}

export function findNameMismatches(sourceText, generatedText, options = {}) {
  const sourceNames = extractPersonNames(sourceText, {
    maxNames: options.maxNames || 26,
  });
  const generatedNames = extractPersonNames(generatedText, {
    maxNames: options.maxNames || 30,
  });

  if (sourceNames.size === 0 || generatedNames.size === 0) {
    return {
      altered: [],
      invented: [],
      sourceNames: [...sourceNames.values()],
      generatedNames: [...generatedNames.values()],
    };
  }

  const sourceByLastName = new Map();
  for (const sourceName of sourceNames.values()) {
    const surname = lastNameKey(sourceName);
    if (!surname) continue;
    const current = sourceByLastName.get(surname) || new Set();
    current.add(sourceName);
    sourceByLastName.set(surname, current);
  }

  const altered = [];
  const invented = [];
  for (const [generatedKey, generatedName] of generatedNames.entries()) {
    if (sourceNames.has(generatedKey)) continue;

    const generatedSurname = lastNameKey(generatedName);
    const expectedBySurname = sourceByLastName.get(generatedSurname);

    if (expectedBySurname && expectedBySurname.size > 0) {
      altered.push({
        found: generatedName,
        expected: [...expectedBySurname],
      });
    } else {
      invented.push({
        found: generatedName,
      });
    }
  }

  return {
    altered,
    invented,
    sourceNames: [...sourceNames.values()],
    generatedNames: [...generatedNames.values()],
  };
}

export function formatNameMismatchSummary(report) {
  const altered = Array.isArray(report?.altered) ? report.altered : [];
  const invented = Array.isArray(report?.invented) ? report.invented : [];
  const details = [];

  for (const item of altered.slice(0, 3)) {
    const expected = Array.isArray(item?.expected) ? item.expected.join("/") : "";
    details.push(`${item?.found || "nume necunoscut"} (expected ${expected || "n/a"})`);
  }

  for (const item of invented.slice(0, 2)) {
    details.push(`${item?.found || "nume necunoscut"} (not in source)`);
  }

  return details.join("; ");
}
