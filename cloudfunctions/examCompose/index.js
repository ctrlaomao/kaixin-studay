const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function countsFull(doc) {
  if (typeof doc.countsTowardFullStar === "boolean") return doc.countsTowardFullStar;
  return Number(doc.stars) === 5 && !doc.manualOverride;
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

async function listWhere(col, where, max = 1000) {
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

function mockQuestion(lessonId, label, index) {
  const title = label || lessonId;
  const questionId = `exam_${lessonId}_${index}`;
  if (index % 4 === 3) {
    return {
      questionId,
      lessonId,
      stem: `请简述「${title}」的核心结论。`,
      type: "fill",
      source: "exam",
    };
  }
  return {
    questionId,
    lessonId,
    stem: `综合检验：「${title}」下列哪项正确？`,
    type: "choice",
    choices: ["A", "B", "C", "D"],
    source: "exam",
  };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const childId = trimStr(e.childId);
  if (!childId) return fail("child_id_required");
  try {
    await ensureCollection("child");
    await ensureCollection("mastery");
    const child = await getDoc("child", childId);
    if (!child) return fail("child_not_found");

    const until = child.examCooldownUntil ? new Date(child.examCooldownUntil) : null;
    if (until && !Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
      return fail("exam_cooldown", { examCooldownUntil: child.examCooldownUntil });
    }

    const rows = await listWhere("mastery", { childId });
    const full = rows.filter(countsFull);
    if (!full.length) return fail("cannot_exam");

    const lessons = full.map((d) => ({
      lessonId: d.lessonId,
      lessonLabel: d.lessonLabel || d.lessonId,
    }));
    const target = Math.min(25, Math.max(15, lessons.length));
    const questions = [];
    let i = 0;
    while (questions.length < target) {
      const ls = lessons[i % lessons.length];
      questions.push(mockQuestion(ls.lessonId, ls.lessonLabel, questions.length));
      i += 1;
      if (i > 80) break;
    }

    return {
      ok: true,
      questions,
      count: questions.length,
      fullStarCount: full.length,
      cooldownMs: COOLDOWN_MS,
    };
  } catch (err) {
    console.error("examCompose", err);
    return fail("internal_error");
  }
};
