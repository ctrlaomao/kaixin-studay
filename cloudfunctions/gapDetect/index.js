const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function subjectKeyFromLabel(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  const lower = n.toLowerCase();
  const keys = [
    "chinese",
    "math",
    "english",
    "morality",
    "history",
    "physics",
    "chemistry",
    "geography",
    "biology",
  ];
  if (keys.includes(lower)) return lower;
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
      /* ignore */
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

function chapterFromProgress(child, subjectKey) {
  const pc = child && child.progressChapter;
  if (pc == null) return null;
  if (typeof pc === "string") return { chapterId: pc };
  const node = pc[subjectKey];
  if (typeof node === "string") return { chapterId: node };
  if (node && typeof node === "object") {
    return {
      chapterId: trimStr(node.chapterId || node.id),
      editionId: trimStr(node.editionId),
    };
  }
  if (trimStr(pc.subjectKey) && subjectKeyFromLabel(pc.subjectKey) !== subjectKey) {
    return null;
  }
  if (trimStr(pc.chapterId)) {
    return { chapterId: trimStr(pc.chapterId), editionId: trimStr(pc.editionId) };
  }
  return null;
}

function editionIdFromChild(child, subjectKey) {
  const tb = child && child.textbookBySubject;
  if (!tb || typeof tb !== "object") return "";
  const node = tb[subjectKey];
  if (typeof node === "string") return node;
  if (node && typeof node === "object") return trimStr(node.editionId || node.id);
  return "";
}

function mockQuestion(lesson, index, source) {
  const lessonId = lesson.lessonId || lesson._id;
  const label = lesson.lessonLabel || lessonId;
  const questionId = `${source}_${lessonId}_${index}`;
  if (index % 3 === 2) {
    return {
      questionId,
      lessonId,
      stem: `请用自己的话写出「${label}」的一个要点。`,
      type: "fill",
      source,
    };
  }
  return {
    questionId,
    lessonId,
    stem: `关于「${label}」下列说法更接近课堂内容的是？`,
    type: "choice",
    choices: ["A 概念表述", "B 易错干扰", "C 无关内容", "D 过度推广"],
    source,
  };
}

async function findGapLessons(child, subjectKey) {
  const ch = chapterFromProgress(child, subjectKey);
  if (!ch || !ch.chapterId) return { error: "no_progress_chapter" };
  const editionId = ch.editionId || editionIdFromChild(child, subjectKey);
  const where = { chapterId: ch.chapterId };
  if (editionId) where.editionId = editionId;
  let lessons = [];
  try {
    await ensureCollection("catalog_lesson");
    lessons = await listWhere("catalog_lesson", where);
  } catch (e) {
    return { error: "catalog_unavailable", lessons: [] };
  }
  const childId = child._id;
  await ensureCollection("mastery");
  await ensureCollection("wrong_item");
  const mastery = await listWhere("mastery", { childId });
  const wrongs = await listWhere("wrong_item", { childId });
  const seen = new Set();
  for (const m of mastery) if (m.lessonId) seen.add(m.lessonId);
  for (const w of wrongs) if (w.lessonId) seen.add(w.lessonId);
  const gaps = lessons.filter((ls) => {
    const id = ls.lessonId || ls._id;
    return id && !seen.has(id);
  });
  return { chapterId: ch.chapterId, editionId, gaps };
}

exports.findGapLessons = findGapLessons;
exports.mockQuestion = mockQuestion;

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const childId = trimStr(e.childId);
  const subjectKey = subjectKeyFromLabel(e.subjectKey || e.subject);
  if (!childId) return fail("child_id_required");
  if (!subjectKey) return fail("subject_key_required");
  try {
    await ensureCollection("child");
    const child = await getDoc("child", childId);
    if (!child) return fail("child_not_found");
    child._id = childId;
    const found = await findGapLessons(child, subjectKey);
    if (found.error === "no_progress_chapter") return fail("no_progress_chapter");
    const gaps = found.gaps || [];
    const picked = gaps.slice(0, 3);
    const questions = picked.map((ls, i) => mockQuestion(ls, i, "gap"));
    return {
      ok: true,
      subjectKey,
      chapterId: found.chapterId || "",
      questions,
      lessonIds: picked.map((ls) => ls.lessonId || ls._id),
    };
  } catch (err) {
    console.error("gapDetect", err);
    return fail("internal_error");
  }
};
