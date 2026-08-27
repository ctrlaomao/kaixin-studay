import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterJuniorMaterials,
  fetchActivitySetId,
  fetchActivityTree,
  fetchNewTextbookLessons,
  loadAllTeachingMaterials,
  sleep,
  subjectKeyFromName,
} from "./lib/fetch.mjs";
import { CHIFENG_SUBJECTS, groupEditionCandidates } from "./lib/policy.mjs";
import { normalizeNewTextbookTree, normalizeTree, toBufferFile } from "./lib/normalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, "../../data/catalog");

function parseArgs(argv) {
  const opts = {
    subjects: [...CHIFENG_SUBJECTS],
    delayMs: 300,
    maxPerSubject: 0,
    outDir: DEFAULT_OUT,
    dryRun: false,
    listVersions: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--list-versions") opts.listVersions = true;
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
  console.log(`Matched ${matched.length} ONLINE 七八九年级对照版本册次（before limit）.`);

  if (opts.listVersions) {
    const rows = matched.map(({ item, tags }) => ({
      subject: tags.subject.tag_name,
      grade: tags.grade.tag_name,
      version: tags.version.tag_name,
      volume: tags.volume.tag_name,
      textbookKind: tags.textbookKind?.tag_name,
      title: item.title,
    }));
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const groups = groupEditionCandidates(matched);
  console.log(`Unique 年级+学科+版本+册+新旧: ${groups.size}`);

  const perSubjectCount = new Map();
  const editionsBySubject = new Map();
  for (const sk of opts.subjects) editionsBySubject.set(sk, []);

  let skipped = 0;
  for (const candidates of groups.values()) {
    const tags = candidates[0].tags;
    const sk = subjectKeyFromName(tags.subject.tag_name);
    if (!sk) continue;
    const n = perSubjectCount.get(sk) || 0;
    if (opts.maxPerSubject > 0 && n >= opts.maxPerSubject) continue;

    if (opts.dryRun) {
      console.log(
        `[dry-run] ${sk} ${tags.grade.tag_name} ${tags.version.tag_name} ${tags.volume.tag_name} ${tags.textbookKind?.tag_name || ""} (${candidates.length})`
      );
      perSubjectCount.set(sk, n + 1);
      continue;
    }

    let ok = false;
    for (const { item, tags: t } of candidates) {
      try {
        const kind = t.textbookKind?.tag_name || "";
        let edition = null;
        const activitySetId = await fetchActivitySetId(item.id, opts.delayMs);
        if (activitySetId) {
          const fulls = await fetchActivityTree(activitySetId, opts.delayMs);
          edition = normalizeTree(item, t, fulls, syncAt);
        }
        if (!edition) {
          const lessons = await fetchNewTextbookLessons(item.id, opts.delayMs);
          edition = normalizeNewTextbookTree(item, t, lessons, syncAt);
        }
        if (!edition) {
          console.warn(`empty tree: ${item.title}`);
          continue;
        }
        editionsBySubject.get(sk).push(edition);
        perSubjectCount.set(sk, n + 1);
        console.log(
          `ok ${sk} ${edition.gradeLabel} ${edition.volumeLabel} ${kind} (${edition.chapters.length} ch) ← ${item.title}`
        );
        ok = true;
        break;
      } catch (e) {
        console.warn(`fail ${item.title}: ${e.message}`);
        await sleep(opts.delayMs);
      }
    }
    if (!ok) skipped++;
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
