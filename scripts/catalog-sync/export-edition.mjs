import { readFile } from "node:fs/promises";

const file = process.argv[2];
const index = Number(process.argv[3] || 0);
if (!file) {
  console.error("Usage: node export-edition.mjs <tree.json> [editionIndex]");
  process.exit(1);
}

const tree = JSON.parse(await readFile(file, "utf8"));
const edition = tree.editions?.[index];
if (!edition) {
  console.error("edition not found at index", index);
  process.exit(1);
}

const payload = {
  action: "importEdition",
  edition,
  sourceFile: file,
};
console.log(JSON.stringify(payload, null, 2));
