import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "../../doc/spec/catalog-tree.schema.json");

const FORBIDDEN_KEYS = new Set([
  "cover_url",
  "video",
  "pdf",
  "ti_items",
  "resourceId",
  "relations",
  "fileUrl",
]);

function hasForbidden(obj, path = "") {
  if (!obj || typeof obj !== "object") return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const hit = hasForbidden(obj[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(k)) return `${path}.${k}`;
    const hit = hasForbidden(v, path ? `${path}.${k}` : k);
    if (hit) return hit;
  }
  return null;
}

function validateTree(tree) {
  const errors = [];
  if (tree.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!tree.syncAt) errors.push("missing syncAt");
  if (!Array.isArray(tree.editions) || tree.editions.length === 0) {
    errors.push("editions empty");
  }
  for (const ed of tree.editions || []) {
    if (!ed.platformTag || !ed.editionId) errors.push(`edition missing id/tag: ${ed.editionId}`);
    if (!ed.chapters?.length) errors.push(`edition ${ed.editionId} no chapters`);
    for (const ch of ed.chapters || []) {
      if (!ch.lessons?.length) errors.push(`chapter ${ch.chapterId} no lessons`);
      for (const ls of ch.lessons || []) {
        if (!ls.lessonId) errors.push("lesson missing lessonId");
      }
    }
  }
  const forbidden = hasForbidden(tree);
  if (forbidden) errors.push(`forbidden field: ${forbidden}`);
  return errors;
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node validate.mjs <tree.json>");
  process.exit(1);
}

const tree = JSON.parse(await readFile(file, "utf8"));
const errors = validateTree(tree);
if (errors.length) {
  console.error("INVALID:", errors.join("; "));
  process.exit(1);
}
console.log(`OK: ${tree.editions.length} editions, schema at ${schemaPath}`);
process.exit(0);
