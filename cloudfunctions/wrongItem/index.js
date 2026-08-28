const cloud = require("wx-server-sdk");
const { applyMasteryEvent } = require("./masteryStars");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const COLS = {
  child: "child",
  wrong: "wrong_item",
  mastery: "mastery",
  lesson: "catalog_lesson",
  edition: "catalog_edition",
};

const SUBJECT_LABEL = {
  chinese: "语文",
  math: "数学",
  english: "英语",
  morality: "道德与法治",
  history: "历史",
  physics: "物理",
  chemistry: "化学",
  geography: "地理",
  biology: "生物",
};

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nowIso() {
  return new Date().toISOString();
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function subjectKeyFromLabel(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  const lower = n.toLowerCase();
  if (SUBJECT_LABEL[lower]) return lower;
  if (n.includes("数学")) return "math";
  if (n.includes("物理")) return "physics";
  if (n.includes("化学")) return "chemistry";
  if (n === "英语" || n.startsWith("英语")) return "english";
  if (n.includes("语文")) return "chinese";
  if (n.includes("道德与法治") || n.includes("思想政治")) return "morality";
  if (n.includes("历史") && !n.includes("历史与社会")) return "history";
  if (n.includes("地理")) return "geography";
  if (n.includes("生物")) return "biology";
  return "";
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/already exist|已存在|-501001|DATABASE_COLLECTION_EXIST/i.test(msg)) {
      // ignore; later reads/writes surface real errors
    }
  }
}

async function getDoc(col, id) {
  if (!id) return null;
  try {
    const got = await db.collection(col).doc(id).get();
    return got.data || null;
  } catch (e) {
    return null;
  }
}

async function listWhere(col, where, max = 500) {
  const out = [];
  let skip = 0;
  while (out.length < max) {
    const res = await db.collection(col).where(where).skip(skip).limit(100).get();
    const rows = res.data || [];
    out.push(...rows);
    if (rows.length < 100) break;
    skip += 100;
  }
  return out;
}

async function resolveSubject(lessonId, fallback) {
  let key = subjectKeyFromLabel(fallback);
  if (key) return { subjectKey: key, lesson: await getDoc(COLS.lesson, lessonId) };
  const lesson = await getDoc(COLS.lesson, lessonId);
  if (!lesson) return { subjectKey: "", lesson: null };
  const edition = await getDoc(COLS.edition, lesson.editionId);
  key = subjectKeyFromLabel(edition && edition.subjectLabel);
  return { subjectKey: key, lesson, edition };
}

function masteryPayload(childId, lessonId, next, subjectKey) {
  const now = nowIso();
  return {
    childId,
    lessonId,
    subjectKey: subjectKey || "",
    stars: next.stars,
    lastCorrectAt: next.lastCorrectAt,
    lastWrongAt: next.lastWrongAt,
    consecutiveWrong: next.consecutiveWrong,
    stubborn: next.stubborn,
    manualOverride: next.manualOverride,
    countsTowardFullStar: next.countsTowardFullStar,
    countsTowardWish: next.countsTowardWish,
    updatedAt: now,
  };
}

async function upsertMastery(childId, lessonId, eventType, subjectKey) {
  await ensureCollection(COLS.mastery);
  const rows = await db
    .collection(COLS.mastery)
    .where({ childId, lessonId })
    .limit(1)
    .get();
  const prev = (rows.data && rows.data[0]) || null;
  const next = applyMasteryEvent(prev, { type: eventType });
  const data = masteryPayload(childId, lessonId, next, subjectKey || (prev && prev.subjectKey));
  if (prev) {
    await db.collection(COLS.mastery).doc(prev._id).update({ data });
    return { ...data, _id: prev._id };
  }
  const add = await db.collection(COLS.mastery).add({
    data: { ...data, createdAt: data.updatedAt },
  });
  return { ...data, _id: add._id };
}

function toItem(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    childId: doc.childId,
    lessonId: doc.lessonId,
    stem: doc.stem || "",
    errorType: doc.errorType || "",
    confidence: doc.confidence,
    fileID: doc.fileID || "",
    fileIDs: Array.isArray(doc.fileIDs) && doc.fileIDs.length ? doc.fileIDs : doc.fileID ? [doc.fileID] : [],
    subjectKey: doc.subjectKey || "",
    lessonLabel: doc.lessonLabel || "",
    pending: !!doc.pending,
    gradeLabel: doc.gradeLabel || "",
    volumeLabel: doc.volumeLabel || "",
    no: doc.no || 0,
    source: doc.source || "confirm",
    createdAt: doc.createdAt || "",
    updatedAt: doc.updatedAt || "",
  };
}

async function findDuplicate(childId, fileID, no, stem) {
  if (fileID && no) {
    try {
      const res = await db.collection(COLS.wrong).where({ childId, fileID, no }).limit(1).get();
      if (res.data && res.data[0]) return res.data[0];
    } catch (e) {
      // ignore
    }
  }
  if (!stem) return null;
  try {
    const res = await db.collection(COLS.wrong).where({ childId, stem }).limit(1).get();
    return (res.data && res.data[0]) || null;
  } catch (e) {
    return null;
  }
}

async function createItem(event) {
  const childId = trimStr(event.childId);
  const lessonId = trimStr(event.lessonId);
  const stem = trimStr(event.stem);
  if (!childId) return fail("child_id_required");
  if (!stem) return fail("stem_required");
  const pending = event.pending === true || !lessonId;

  await ensureCollection(COLS.child);
  const child = await getDoc(COLS.child, childId);
  if (!child) return fail("child_not_found");

  const confidence = Number(event.confidence);
  if (!Number.isFinite(confidence)) return fail("confidence_required");

  let subjectKey = subjectKeyFromLabel(event.subjectKey || event.subject);
  let lesson = null;
  if (lessonId) {
    const resolved = await resolveSubject(lessonId, event.subjectKey || event.subject);
    subjectKey = resolved.subjectKey || subjectKey;
    lesson = resolved.lesson;
  }

  await ensureCollection(COLS.wrong);
  const now = nowIso();
  const fileIDs = [];
  if (Array.isArray(event.fileIDs)) {
    for (const id of event.fileIDs) {
      const s = trimStr(id);
      if (s) fileIDs.push(s);
    }
  }
  const fileID = trimStr(event.fileID) || fileIDs[0] || "";
  if (fileID && fileIDs.indexOf(fileID) < 0) fileIDs.unshift(fileID);
  const no = Number(event.no);
  const qNo = Number.isFinite(no) && no > 0 ? no : 0;

  const dup = await findDuplicate(childId, fileID, qNo, stem);
  if (dup) {
    return { ok: true, skipped: true, reason: "duplicate", item: toItem(dup) };
  }

  const data = {
    childId,
    lessonId: lessonId || "",
    stem,
    no: qNo,
    errorType: trimStr(event.errorType),
    confidence,
    fileID,
    fileIDs,
    subjectKey,
    lessonLabel: (lesson && lesson.lessonLabel) || trimStr(event.lessonLabel),
    gradeLabel: trimStr(event.grade || event.gradeLabel),
    volumeLabel: trimStr(event.volume || event.volumeLabel),
    pending,
    source: pending ? "pending" : "confirm",
    createdAt: now,
    updatedAt: now,
  };
  const add = await db.collection(COLS.wrong).add({ data });
  let mastery = null;
  if (lessonId && !pending) {
    mastery = await upsertMastery(childId, lessonId, "wrong", subjectKey);
  }
  return { ok: true, item: toItem({ ...data, _id: add._id }), mastery };
}

async function listItems(event) {
  const childId = trimStr(event.childId);
  if (!childId) return fail("child_id_required");
  await ensureCollection(COLS.wrong);
  const where = { childId };
  const lessonId = trimStr(event.lessonId);
  if (lessonId) where.lessonId = lessonId;
  const subjectKey = subjectKeyFromLabel(event.subject || event.subjectKey);
  if (subjectKey) where.subjectKey = subjectKey;
  const rows = await listWhere(COLS.wrong, where);
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { ok: true, items: rows.map(toItem) };
}

async function updateLesson(event) {
  const id = trimStr(event.wrongItemId || event.id);
  const lessonId = trimStr(event.lessonId);
  if (!id) return fail("wrong_item_id_required");
  if (!lessonId) return fail("lesson_id_required");
  await ensureCollection(COLS.wrong);
  const doc = await getDoc(COLS.wrong, id);
  if (!doc) return fail("wrong_item_not_found");
  const { subjectKey, lesson } = await resolveSubject(lessonId, event.subjectKey);
  const patch = {
    lessonId,
    subjectKey,
    lessonLabel: (lesson && lesson.lessonLabel) || "",
    updatedAt: nowIso(),
  };
  await db.collection(COLS.wrong).doc(id).update({ data: patch });
  return { ok: true, item: toItem({ ...doc, ...patch, _id: id }) };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const action = trimStr(e.action) || "list";
  try {
    if (action === "create") return await createItem(e);
    if (action === "list") return await listItems(e);
    if (action === "updateLesson") return await updateLesson(e);
    return fail("unknown_action");
  } catch (err) {
    console.error("wrongItem", err);
    return fail("internal_error");
  }
};
