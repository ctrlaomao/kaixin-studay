import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterJuniorMaterials,
  fetchActivitySetId,
  fetchActivityTree,
  loadAllTeachingMaterials,
  sleep,
} from "./lib/fetch.mjs";
import { normalizeTree, toBufferFile } from "./lib/normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, "../../data/catalog");

function parseArgs(argv) {
  const opts = {
    subjects: ["math", "physics", "chemistry", "english"],
    delayMs: 300,
    maxPerSubject: 0,
    outDir: DEFAULT_OUT,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--subjects") opts.subjects = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--delay") opts.delayMs = Number(argv[++i]) || 300;
    else if (a === "--max-per-subject") opts.maxPerSubject = Number(argv[++i]) || 0;
    else if (a === "--out") opts.outDir = resolve(argv[++i]);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const syncAt = new Date().toISOString();
  console.log("Loading teaching materials manifest…");
  const all = await loadAllTeachingMaterials();
  const matched = filterJuniorMaterials(all, opts.subjects);
  console.log(`Matched ${matched.length} ONLINE junior-high volumes (before limit).`);

  const perSubjectCount = new Map();
  const editionsBySubject = new Map();
  for (const sk of opts.subjects) editionsBySubject.set(sk, []);

  let skipped = 0;
  for (const { item, tags } of matched) {
    const sk = tags.subject.tag_name.includes("数学")
      ? "math"
      : tags.subject.tag_name.includes("物理")
        ? "physics"
        : tags.subject.tag_name.includes("化学")
          ? "chemistry"
          : tags.subject.tag_name.includes("英语")
            ? "english"
            : null;
    if (!sk) continue;
    const n = perSubjectCount.get(sk) || 0;
    if (opts.maxPerSubject > 0 && n >= opts.maxPerSubject) continue;

    if (opts.dryRun) {
      console.log(`[dry-run] ${sk} ${item.title} (${item.id})`);
      perSubjectCount.set(sk, n + 1);
      continue;
    }

    try {
      const activitySetId = await fetchActivitySetId(item.id, opts.delayMs);
      if (!activitySetId) {
        skipped++;
        console.warn(`skip no activity_set: ${item.title}`);
        continue;
      }
      const fulls = await fetchActivityTree(activitySetId, opts.delayMs);
      const edition = normalizeTree(item, tags, fulls, syncAt);
      if (!edition) {
        skipped++;
        console.warn(`skip empty tree: ${item.title}`);
        continue;
      }
      editionsBySubject.get(sk).push(edition);
      perSubjectCount.set(sk, n + 1);
      console.log(`ok ${sk} ${edition.gradeLabel} ${edition.subjectLabel} ${edition.versionLabel} ${edition.volumeLabel} (${edition.chapters.length} ch)`);
    } catch (e) {
      skipped++;
      console.warn(`fail ${item.title}: ${e.message}`);
      await sleep(opts.delayMs);
    }
  }

  if (opts.dryRun) {
    console.log("Dry run counts:", Object.fromEntries(perSubjectCount));
    return;
  }

  await mkdir(opts.outDir, { recursive: true });
  const stamp = syncAt.replace(/[:.]/g, "-");

  for (const [sk, editions] of editionsBySubject) {
    if (editions.length === 0) continue;
    const buffer = toBufferFile(editions, syncAt);
    const path = resolve(opts.outDir, `tree-${sk}-${stamp}.json`);
    await writeFile(path, JSON.stringify(buffer, null, 2), "utf8");
    console.log(`written ${path} (${editions.length} editions)`);
  }

  console.log(`Done. skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
