const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const EDITION_COL = "catalog_edition";
const LESSON_COL = "catalog_lesson";
const LOG_COL = "catalog_sync_log";

const DEFAULT_LESSON_BATCH = 25;
const DEFAULT_EDITION_LIMIT = 1;

function nowIso() {
  return new Date().toISOString();
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function editionDocFromNode(edition, syncAt) {
  const { chapters, ...rest } = edition;
  return {
    editionId: edition.editionId,
    stageId: rest.stageId,
    stageLabel: rest.stageLabel,
    gradeId: rest.gradeId,
    gradeLabel: rest.gradeLabel,
    subjectId: rest.subjectId,
    subjectLabel: rest.subjectLabel,
    versionId: rest.versionId,
    versionLabel: rest.versionLabel,
    volumeId: rest.volumeId,
    volumeLabel: rest.volumeLabel,
    platformTag: rest.platformTag,
    platformTagPath: rest.platformTagPath || [],
    online: rest.online !== false,
    syncAt,
    sourceUrl: rest.sourceUrl || "",
  };
}

function lessonDocsFromEdition(edition, syncAt) {
  const docs = [];
  for (const ch of edition.chapters || []) {
    for (const ls of ch.lessons || []) {
      docs.push({
        lessonId: ls.lessonId,
        editionId: edition.editionId,
        chapterId: ch.chapterId,
        chapterLabel: ch.chapterLabel,
        chapterOrder: ch.chapterOrder,
        lessonLabel: ls.lessonLabel,
        lessonOrder: ls.lessonOrder,
        sortKey:
          ls.sortKey ||
          `${String(ch.chapterOrder).padStart(3, "0")}_${String(ls.lessonOrder).padStart(3, "0")}`,
        platformTag: ls.platformTag,
        platformTagPath: ls.platformTagPath || [],
        syncAt,
      });
    }
  }
  return docs;
}

async function upsertEdition(editionFields) {
  const id = editionFields.editionId;
  await db.collection(EDITION_COL).doc(id).set({
    data: editionFields,
  });
  return id;
}

async function upsertLessonsBatch(lessonDocs, offset, limit) {
  const slice = lessonDocs.slice(offset, offset + limit);
  let upserted = 0;
  for (const doc of slice) {
    const id = doc.lessonId;
    await db.collection(LESSON_COL).doc(id).set({
      data: doc,
    });
    upserted += 1;
  }
  return { upserted, total: lessonDocs.length, nextOffset: offset + upserted };
}

async function writeLog(entry) {
  const res = await db.collection(LOG_COL).add({
    data: entry,
  });
  return res._id;
}

/**
 * Actions:
 * - importEdition: 单册 + 分批课时（lessonOffset / lessonBatchSize）
 * - importTree: 按 editionStart + editionLimit 导入多册（每册仍分批课时）
 * - ping: 健康检查
 */
exports.main = async (event = {}) => {
  const action = event.action || "importTree";

  if (action === "ping") {
    return { ok: true, service: "catalogImport" };
  }

  const wxContext = cloud.getWXContext();
  const operator = wxContext.OPENID || "unknown";
  const syncAt = event.syncAt || nowIso();
  const lessonBatchSize = Number(event.lessonBatchSize) || DEFAULT_LESSON_BATCH;
  const editionLimit = Number(event.editionLimit) || DEFAULT_EDITION_LIMIT;
  const editionStart = Number(event.editionStart) || 0;
  const batchId = event.batchId || `import_${Date.now()}`;
  const startedAt = nowIso();

  try {
    if (action === "importEdition") {
      const edition = event.edition;
      if (!edition || !edition.editionId || !edition.chapters) {
        return fail("invalid_edition");
      }
      const lessonOffset = Number(event.lessonOffset) || 0;
      const allLessons = lessonDocsFromEdition(edition, syncAt);
      const editionFields = editionDocFromNode(edition, syncAt);

      let editionUpserted = 0;
      if (lessonOffset === 0) {
        await upsertEdition(editionFields);
        editionUpserted = 1;
      }

      const batch = await upsertLessonsBatch(allLessons, lessonOffset, lessonBatchSize);
      const done = batch.nextOffset >= batch.total;
      const finishedAt = nowIso();

      if (done) {
        await writeLog({
          batchId,
          startedAt,
          finishedAt,
          editionUpserted: 1,
          lessonUpserted: batch.total,
          sourceFile: event.sourceFile || "",
          ok: true,
          operator,
        });
      }

      return {
        ok: true,
        batchId,
        editionId: edition.editionId,
        editionUpserted,
        lessonUpserted: batch.upserted,
        lessonTotal: batch.total,
        lessonOffset: batch.nextOffset,
        lessonDone: done,
        editionDone: done,
      };
    }

    if (action === "importTree") {
      const tree = event.tree;
      const editions = tree?.editions || event.editions;
      if (!Array.isArray(editions) || editions.length === 0) {
        return fail("missing_editions");
      }

      const slice = editions.slice(editionStart, editionStart + editionLimit);
      if (slice.length === 0) {
        return fail("edition_range_empty", { editionStart, editionLimit });
      }

      let editionUpserted = 0;
      let lessonUpserted = 0;
      let lessonTotal = 0;
      const editionResults = [];

      for (const edition of slice) {
        const editionFields = editionDocFromNode(edition, syncAt);
        await upsertEdition(editionFields);
        editionUpserted += 1;

        const allLessons = lessonDocsFromEdition(edition, syncAt);
        lessonTotal += allLessons.length;
        let offset = 0;
        while (offset < allLessons.length) {
          const batch = await upsertLessonsBatch(allLessons, offset, lessonBatchSize);
          lessonUpserted += batch.upserted;
          offset = batch.nextOffset;
        }
        editionResults.push({
          editionId: edition.editionId,
          lessons: allLessons.length,
        });
      }

      const nextEditionStart = editionStart + slice.length;
      const treeDone = nextEditionStart >= editions.length;
      const finishedAt = nowIso();

      if (treeDone) {
        await writeLog({
          batchId,
          startedAt,
          finishedAt,
          editionUpserted,
          lessonUpserted,
          sourceFile: event.sourceFile || tree?.source || "",
          ok: true,
          operator,
        });
      }

      return {
        ok: true,
        batchId,
        editionUpserted,
        lessonUpserted,
        lessonTotal,
        editionResults,
        editionStart,
        nextEditionStart,
        treeDone,
        totalEditions: editions.length,
      };
    }

    return fail("unknown_action", { action });
  } catch (err) {
    const finishedAt = nowIso();
    await writeLog({
      batchId,
      startedAt,
      finishedAt,
      editionUpserted: 0,
      lessonUpserted: 0,
      sourceFile: event.sourceFile || "",
      ok: false,
      error: String(err.message || err),
      operator,
    });
    return fail("import_failed", { message: String(err.message || err) });
  }
};
