const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const CHILD_COL = "child";
const FAMILY_COL = "family";
const EDITION_COL = "catalog_edition";
const LIST_LIMIT = 100;
const NAME_MAX = 32;
const GRADE_MAX = 16;
const CHAPTER_LABEL_MAX = 128;

/** 一期初中年级；教材版本写 textbookBySubject */
const GRADES = ["七年级", "八年级", "九年级"];

const SUBJECT_KEYS = [
  "math",
  "chinese",
  "english",
  "morality",
  "history",
  "physics",
  "chemistry",
  "geography",
  "biology",
];

const SUBJECT_LABEL_BY_KEY = {
  math: "数学",
  chinese: "语文",
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

function placeholderFamilyId(openid) {
  return `tmp:${openid}`;
}

/**
 * F03A 前：有 event.familyId 则用；否则用 OPENID 临时家庭。
 * F03A 会把 tmp:OPENID 换成正式 family._id。
 */
function resolveFamilyId(event, openid) {
  const given = trimStr(event && event.familyId);
  if (given) return given;
  return placeholderFamilyId(openid);
}

function parseDisplayName(raw) {
  const displayName = trimStr(raw);
  if (!displayName) return { error: "display_name_required" };
  if (displayName.length > NAME_MAX) return { error: "display_name_too_long" };
  return { displayName };
}

function parseGrade(raw) {
  const grade = trimStr(raw);
  if (!grade) return { error: "grade_required" };
  if (grade.length > GRADE_MAX) return { error: "grade_too_long" };
  if (!GRADES.includes(grade)) return { error: "grade_invalid" };
  return { grade };
}

function toChild(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    familyId: doc.familyId,
    displayName: doc.displayName,
    grade: doc.grade,
    textbookBySubject: doc.textbookBySubject || {},
    progressChapter: doc.progressChapter || {},
    createdAt: doc.createdAt || "",
    updatedAt: doc.updatedAt || "",
  };
}

function parseSubjectKey(raw) {
  const subjectKey = trimStr(raw);
  if (!subjectKey) return { error: "subject_key_required" };
  if (!SUBJECT_KEYS.includes(subjectKey)) return { error: "subject_key_invalid" };
  return { subjectKey };
}

async function getDoc(col, id) {
  try {
    const res = await db.collection(col).doc(id).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
}

function editionSnapshot(edition) {
  return {
    editionId: edition.editionId || edition._id,
    gradeLabel: edition.gradeLabel || "",
    subjectLabel: edition.subjectLabel || "",
    versionLabel: edition.versionLabel || "",
    volumeLabel: edition.volumeLabel || "",
    textbookKindLabel: edition.textbookKindLabel || "",
    platformTag: edition.platformTag || "",
    online: edition.online !== false,
  };
}

function subjectMatchesEdition(subjectKey, edition) {
  const expected = SUBJECT_LABEL_BY_KEY[subjectKey];
  const label = trimStr(edition && edition.subjectLabel);
  if (!expected || !label) return false;
  if (subjectKey === "morality") {
    return label.includes("道德与法治") || label.includes("思想政治");
  }
  return label === expected || label.includes(expected);
}

async function loadOwnedChild(event, openid) {
  const childId = trimStr(event && (event.childId || event.id));
  if (!childId) return { error: "child_id_required" };
  await ensureChildCollection();
  const doc = await getDoc(CHILD_COL, childId);
  if (!doc) return { error: "child_not_found" };
  const familyId = resolveFamilyId(event, openid);
  if (doc.familyId !== familyId) return { error: "family_mismatch" };
  return { childId, doc };
}

async function ensureChildCollection() {
  try {
    await db.createCollection(CHILD_COL);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/already exist|已存在|-501001|DATABASE_COLLECTION_EXIST/i.test(msg)) {
      // 已存在时忽略；其它错误交给后续读写暴露
    }
  }
}

async function lookupFamilyId(openid) {
  try {
    const res = await db
      .collection(FAMILY_COL)
      .where({ members: _.elemMatch({ openid }) })
      .limit(1)
      .get();
    const fam = res.data && res.data[0];
    if (fam && fam._id) return fam._id;
  } catch (e) {
    // 无 family 集合时走临时家庭
  }
  return placeholderFamilyId(openid);
}

async function findFirstChildForOpenid(openid) {
  await ensureChildCollection();
  const familyId = await lookupFamilyId(openid);
  const tmp = placeholderFamilyId(openid);
  const tryWhere = async (where) => {
    const res = await db.collection(CHILD_COL).where(where).limit(1).get();
    return (res.data && res.data[0]) || null;
  };
  return (
    (await tryWhere({ familyId })) ||
    (familyId !== tmp ? await tryWhere({ familyId: tmp }) : null) ||
    (await tryWhere({ createdByOpenid: openid }))
  );
}

async function ensureSoloChild(event, openid) {
  const existing = await findFirstChildForOpenid(openid);
  if (existing) {
    return { ok: true, child: toChild(existing), created: false };
  }
  const familyId = await lookupFamilyId(openid);
  await ensureChildCollection();
  const now = nowIso();
  const addRes = await db.collection(CHILD_COL).add({
    data: {
      familyId,
      displayName: "孩子",
      grade: "",
      solo: true,
      createdByOpenid: openid,
      createdAt: now,
      updatedAt: now,
    },
  });
  return {
    ok: true,
    created: true,
    child: {
      id: addRes._id,
      familyId,
      displayName: "孩子",
      grade: "",
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function createChild(event, openid) {
  const familyId = resolveFamilyId(event, openid);
  const nameRes = parseDisplayName(event && event.displayName);
  if (nameRes.error) return fail(nameRes.error);
  const gradeRes = parseGrade(event && event.grade);
  if (gradeRes.error) return fail(gradeRes.error);

  await ensureChildCollection();
  const now = nowIso();
  const addRes = await db.collection(CHILD_COL).add({
    data: {
      familyId,
      displayName: nameRes.displayName,
      grade: gradeRes.grade,
      createdByOpenid: openid,
      createdAt: now,
      updatedAt: now,
    },
  });

  return {
    ok: true,
    child: {
      id: addRes._id,
      familyId,
      displayName: nameRes.displayName,
      grade: gradeRes.grade,
      createdAt: now,
      updatedAt: now,
    },
    familyIdPlaceholder: !trimStr(event && event.familyId),
  };
}

async function listChildren(event, openid) {
  const familyId = resolveFamilyId(event, openid);
  await ensureChildCollection();
  const res = await db
    .collection(CHILD_COL)
    .where({ familyId })
    .limit(LIST_LIMIT)
    .get();
  const children = (res.data || []).map(toChild);
  return { ok: true, familyId, children };
}

async function updateChild(event, openid) {
  const childId = trimStr(event && (event.childId || event.id));
  if (!childId) return fail("child_id_required");

  const patch = {};
  if (event.displayName !== undefined) {
    const nameRes = parseDisplayName(event.displayName);
    if (nameRes.error) return fail(nameRes.error);
    patch.displayName = nameRes.displayName;
  }
  if (event.grade !== undefined) {
    const gradeRes = parseGrade(event.grade);
    if (gradeRes.error) return fail(gradeRes.error);
    patch.grade = gradeRes.grade;
  }
  if (!Object.keys(patch).length) return fail("no_fields_to_update");

  await ensureChildCollection();
  const got = await db.collection(CHILD_COL).doc(childId).get();
  const doc = got.data;
  if (!doc) return fail("child_not_found");

  const familyId = resolveFamilyId(event, openid);
  if (doc.familyId !== familyId) return fail("family_mismatch");

  patch.updatedAt = nowIso();
  await db.collection(CHILD_COL).doc(childId).update({ data: patch });
  return { ok: true, child: toChild({ ...doc, ...patch, _id: childId }) };
}

async function setTextbook(event, openid) {
  const owned = await loadOwnedChild(event, openid);
  if (owned.error) return fail(owned.error);

  const subRes = parseSubjectKey(event && event.subjectKey);
  if (subRes.error) return fail(subRes.error);
  const editionId = trimStr(event && event.editionId);
  if (!editionId) return fail("edition_id_required");

  const edition = await getDoc(EDITION_COL, editionId);
  if (!edition) return fail("edition_not_found");
  if (edition.online === false) return fail("edition_offline");
  if (!subjectMatchesEdition(subRes.subjectKey, edition)) {
    return fail("subject_mismatch", {
      expectedSubject: SUBJECT_LABEL_BY_KEY[subRes.subjectKey],
      editionSubject: edition.subjectLabel || "",
    });
  }

  const snap = editionSnapshot(edition);
  const now = nowIso();
  const textbookBySubject = {
    ...(owned.doc.textbookBySubject || {}),
    [subRes.subjectKey]: snap,
  };
  await db.collection(CHILD_COL).doc(owned.childId).update({
    data: {
      [`textbookBySubject.${subRes.subjectKey}`]: snap,
      updatedAt: now,
    },
  });
  return {
    ok: true,
    childId: owned.childId,
    subjectKey: subRes.subjectKey,
    textbook: snap,
    textbookBySubject,
  };
}

async function setProgress(event, openid) {
  const owned = await loadOwnedChild(event, openid);
  if (owned.error) return fail(owned.error);

  const subRes = parseSubjectKey(event && event.subjectKey);
  if (subRes.error) return fail(subRes.error);
  const chapterId = trimStr(event && event.chapterId);
  if (!chapterId) return fail("chapter_id_required");
  const chapterLabel = trimStr(event && event.chapterLabel);
  if (!chapterLabel) return fail("chapter_label_required");
  if (chapterLabel.length > CHAPTER_LABEL_MAX) return fail("chapter_label_too_long");

  const progress = { chapterId, chapterLabel };
  const now = nowIso();
  const progressChapter = {
    ...(owned.doc.progressChapter || {}),
    [subRes.subjectKey]: progress,
  };
  await db.collection(CHILD_COL).doc(owned.childId).update({
    data: {
      [`progressChapter.${subRes.subjectKey}`]: progress,
      updatedAt: now,
    },
  });
  return {
    ok: true,
    childId: owned.childId,
    subjectKey: subRes.subjectKey,
    progress,
    progressChapter,
  };
}

async function getTextbooks(event, openid) {
  const owned = await loadOwnedChild(event, openid);
  if (owned.error) return fail(owned.error);
  return {
    ok: true,
    childId: owned.childId,
    textbookBySubject: owned.doc.textbookBySubject || {},
    progressChapter: owned.doc.progressChapter || {},
  };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail("openid_missing");

  const action = trimStr(e.action) || "list";
  try {
    if (action === "ensureSolo") return await ensureSoloChild(e, OPENID);
    if (action === "create") return await createChild(e, OPENID);
    if (action === "list") return await listChildren(e, OPENID);
    if (action === "update") return await updateChild(e, OPENID);
    if (action === "setTextbook") return await setTextbook(e, OPENID);
    if (action === "setProgress") return await setProgress(e, OPENID);
    if (action === "getTextbooks") return await getTextbooks(e, OPENID);
    return fail("unknown_action");
  } catch (err) {
    console.error("childProfile", err);
    return fail("internal_error");
  }
};
