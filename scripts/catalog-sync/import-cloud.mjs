/**
 * 将 data/catalog/tree-*-STAMP.json 分册调用 catalogImport。
 * 依赖本机已登录 tcb，且函数已部署。
 *
 *   node import-cloud.mjs --stamp 2026-08-27T02-33-33-640Z
 */
import { readFile, writeFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_ID = "cloudbase-d7ggaqrps717e5be9";
const CATALOG_DIR = resolve(__dirname, "../../data/catalog");

function parseArgs(argv) {
  const opts = { stamp: "", dryRun: false, envId: ENV_ID };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stamp") opts.stamp = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--env") opts.envId = argv[++i];
  }
  return opts;
}

function run(cmd, args) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || out || `exit ${code}`));
      else resolveP(out);
    });
  });
}

function invoke(envId, paramsPath) {
  return run("npx", [
    "--yes",
    "--package",
    "@cloudbase/cli",
    "tcb",
    "fn",
    "invoke",
    "catalogImport",
    "-e",
    envId,
    "--params",
    `@${paramsPath}`,
  ]);
}

async function main() {
  const opts = parseArgs(process.argv);
  const files = (await readdir(CATALOG_DIR))
    .filter((f) => f.startsWith("tree-") && f.endsWith(".json"))
    .filter((f) => (opts.stamp ? f.includes(opts.stamp) : true))
    .sort();

  if (files.length === 0) {
    console.error("no tree files match");
    process.exit(1);
  }

  const dir = await mkdtemp(join(tmpdir(), "kx-import-"));
  let editionCount = 0;
  let lessonCount = 0;
  const batchId = `import_${opts.stamp || Date.now()}`;

  for (const file of files) {
    const path = join(CATALOG_DIR, file);
    const tree = JSON.parse(await readFile(path, "utf8"));
    const editions = tree.editions || [];
    console.log(`file ${file} editions=${editions.length}`);
    for (let i = 0; i < editions.length; i++) {
      const payload = {
        action: "importEdition",
        edition: editions[i],
        sourceFile: file,
        batchId,
        lessonBatchSize: 80,
        lessonOffset: 0,
      };
      const paramsPath = join(dir, `${file}-${i}.json`);
      await writeFile(paramsPath, JSON.stringify(payload), "utf8");
      const lessons = editions[i].chapters.reduce((n, ch) => n + (ch.lessons?.length || 0), 0);
      if (opts.dryRun) {
        console.log(`  dry ${editions[i].gradeLabel} ${editions[i].volumeLabel} ${editions[i].textbookKindLabel} lessons=${lessons}`);
        continue;
      }
      let offset = 0;
      let done = false;
      while (!done) {
        payload.lessonOffset = offset;
        await writeFile(paramsPath, JSON.stringify(payload), "utf8");
        const out = await invoke(opts.envId, paramsPath);
        let parsed;
        try {
          parsed = JSON.parse(out.replace(/^[^{]*/, "").replace(/[^}]*$/, "") || out);
        } catch {
          const m = out.match(/\{[\s\S]*\}/);
          parsed = m ? JSON.parse(m[0]) : { raw: out };
        }
        if (!parsed.ok) {
          console.error("FAIL", file, i, parsed);
          process.exit(1);
        }
        done = parsed.lessonDone;
        offset = parsed.lessonOffset;
        console.log(
          `  ok ${editions[i].subjectLabel} ${editions[i].gradeLabel} ${editions[i].volumeLabel} ${editions[i].textbookKindLabel} lessons ${parsed.lessonUpserted}/${parsed.lessonTotal} offset=${offset} done=${done}`
        );
      }
      editionCount += 1;
      lessonCount += lessons;
    }
  }

  console.log(`Done editions=${editionCount} lessons≈${lessonCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
