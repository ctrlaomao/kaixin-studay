const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const EDITION_COL = "catalog_edition";
const LESSON_COL = "catalog_lesson";
const LIST_LIMIT = 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function parsePaging(event) {
  const rawLimit = Number(event && event.limit);
  const rawSkip = Number(event && event.skip);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(LIST_LIMIT, Math.floor(rawLimit))
      : LIST_LIMIT;
  const skip = Number.isFinite(rawSkip) && rawSkip > 0 ? Math.floor(rawSkip) : 0;
  return { skip, limit };
}

function toEdition(doc) {
  if (!doc) return null;
  return {
    editionId: doc.editionId || doc._id,
    stageLabel: doc.stageLabel || "",
    gradeLabel: doc.gradeLabel || "",
    subjectLabel: doc.subjectLabel || "",
    versionLabel: doc.versionLabel || "",
    volumeLabel: doc.volumeLabel || "",
    textbookKindLabel: doc.textbookKindLabel || "",
    platformTag: doc.platformTag || "",
    online: doc.online !== false,
    syncAt: doc.syncAt || "",
  };
}

function toLesson(doc) {
  if (!doc) return null;
  return {
    lessonId: doc.lessonId || doc._id,
    editionId: doc.editionId || "",
    chapterId: doc.chapterId || "",
    chapterLabel: doc.chapterLabel || "",
    chapterOrder: doc.chapterOrder,
    lessonLabel: doc.lessonLabel || "",
    lessonOrder: doc.lessonOrder,
    sortKey: doc.sortKey || "",
  };
}

async function listEditions(event) {
  const { skip, limit } = parsePaging(event);
  const gradeLabel = trimStr(event && event.gradeLabel);
  const subjectLabel = trimStr(event && event.subjectLabel);
  const where = { online: true };
  if (gradeLabel) where.gradeLabel = gradeLabel;
  if (subjectLabel) where.subjectLabel = subjectLabel;

  const col = db.collection(EDITION_COL);
  const countRes = await col.where(where).count();
  const res = await col.where(where).skip(skip).limit(limit).get();
  const editions = (res.data || []).map(toEdition);

  return {
    ok: true,
    skip,
    limit,
    total: countRes.total || 0,
    editions,
  };
}

async function listLessons(event) {
  const editionId = trimStr(event && event.editionId);
  if (!editionId) return fail("edition_id_required");

  const { skip, limit } = parsePaging(event);
  const where = { editionId };

  const query = db.collection(LESSON_COL).where(where);
  const countRes = await query.count();
  const res = await db
    .collection(LESSON_COL)
    .where(where)
    .orderBy("sortKey", "asc")
    .skip(skip)
    .limit(limit)
    .get();
  const lessons = (res.data || []).map(toLesson);

  return {
    ok: true,
    editionId,
    skip,
    limit,
    total: countRes.total || 0,
    lessons,
  };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const action = trimStr(e.action) || "listEditions";
  try {
    if (action === "listEditions") return await listEditions(e);
    if (action === "listLessons") return await listLessons(e);
    return fail("unknown_action");
  } catch (err) {
    console.error("catalogRead", err);
    return fail("internal_error");
  }
};
