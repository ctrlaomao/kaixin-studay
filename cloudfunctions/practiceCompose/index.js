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

function mockQuestion(lessonId, label, index, source) {
  const questionId = `${source}_${lessonId}_${index}`;
  const title = label || lessonId;
  if (index % 3 === 2) {
    return {
      questionId,
      lessonId,
      stem: `请写出「${title}」的一个要点。`,
      type: "fill",
      source,
    };
  }
  return {
    questionId,
    lessonId,
    stem: `关于「${title}」下列说法更接近课堂内容的是？`,
    type: "choice",
    choices: ["A 概念表述", "B 易错干扰", "C 无关内容", "D 过度推广"],
    source,
  };
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

async function gapQuestions(child, maxN) {
  const pc = child.progressChapter;
  if (pc == null) return [];
  const keys = [];
  if (typeof pc === "object" && !Array.isArray(pc)) {
    for (const k of Object.keys(pc)) {
      const sk = subjectKeyFromLabel(k);
      if (sk) keys.push(sk);
    }
    if (!keys.length && trimStr(pc.chapterId)) {
      const sk = subjectKeyFromLabel(pc.subjectKey);
      if (sk) keys.push(sk);
    }
  }
  const out = [];
  const used = new Set();
  for (const subjectKey of keys.length ? keys : ["math"]) {
    const ch = chapterFromProgress(child, subjectKey);
    if (!ch || !ch.chapterId) continue;
    const editionId = ch.editionId || editionIdFromChild(child, subjectKey);
    const where = { chapterId: ch.chapterId };
    if (editionId) where.editionId = editionId;
    let lessons = [];
    try {
      lessons = await listWhere("catalog_lesson", where);
    } catch (e) {
      continue;
    }
    const mastery = await listWhere("mastery", { childId: child._id });
    const wrongs = await listWhere("wrong_item", { childId: child._id });
    const seen = new Set();
    for (const m of mastery) if (m.lessonId) seen.add(m.lessonId);
    for (const w of wrongs) if (w.lessonId) seen.add(w.lessonId);
    for (const ls of lessons) {
      const id = ls.lessonId || ls._id;
      if (!id || seen.has(id) || used.has(id)) continue;
      used.add(id);
      out.push(mockQuestion(id, ls.lessonLabel, out.length, "gap"));
      if (out.length >= maxN) return out;
    }
  }
  return out;
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const childId = trimStr(e.childId);
  if (!childId) return fail("child_id_required");
  try {
    await ensureCollection("child");
    await ensureCollection("wrong_item");
    const child = await getDoc("child", childId);
    if (!child) return fail("child_not_found");
    child._id = childId;

    const where = { childId };
    const subjectKey = subjectKeyFromLabel(e.subjectKey || e.subject);
    if (subjectKey) where.subjectKey = subjectKey;
    const wrongs = await listWhere("wrong_item", where);
    const lessonMap = new Map();
    for (const w of wrongs) {
      if (!w.lessonId) continue;
      if (!lessonMap.has(w.lessonId)) {
        lessonMap.set(w.lessonId, w.lessonLabel || w.stem || w.lessonId);
      }
    }
    const lessonIds = [...lessonMap.keys()];
    if (!lessonIds.length) return fail("no_wrong_lessons");

    const target = Math.min(8, Math.max(3, lessonIds.length));
    const questions = [];
    let i = 0;
    while (questions.length < target) {
      const lessonId = lessonIds[i % lessonIds.length];
      questions.push(
        mockQuestion(lessonId, lessonMap.get(lessonId), questions.length, "wrong")
      );
      i += 1;
      if (i > 40) break;
    }

    if (e.includeGaps === true) {
      const room = Math.max(0, 10 - questions.length);
      const gapN = Math.min(3, room);
      if (gapN > 0) {
        await ensureCollection("catalog_lesson");
        await ensureCollection("mastery");
        const gaps = await gapQuestions(child, gapN);
        questions.push(...gaps);
      }
    }

    return { ok: true, questions, count: questions.length };
  } catch (err) {
    console.error("practiceCompose", err);
    return fail("internal_error");
  }
};
