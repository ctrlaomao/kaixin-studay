const cloud = require("wx-server-sdk");
const { applyMasteryEvent, DAY_MS } = require("./masteryStars");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COOLDOWN_MS = 3 * DAY_MS;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nowIso() {
  return new Date().toISOString();
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
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
  await ensureCollection("mastery");
  const rows = await db
    .collection("mastery")
    .where({ childId, lessonId })
    .limit(1)
    .get();
  const prev = (rows.data && rows.data[0]) || null;
  const next = applyMasteryEvent(prev, { type: eventType });
  const data = masteryPayload(childId, lessonId, next, subjectKey || (prev && prev.subjectKey));
  if (prev) {
    await db.collection("mastery").doc(prev._id).update({ data });
    return { ...data, _id: prev._id };
  }
  const add = await db.collection("mastery").add({
    data: { ...data, createdAt: data.updatedAt },
  });
  return { ...data, _id: add._id };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const childId = trimStr(e.childId);
  if (!childId) return fail("child_id_required");
  const answers = Array.isArray(e.answers) ? e.answers : [];
  if (!answers.length) return fail("answers_required");

  let score = Number(e.score);
  if (!Number.isFinite(score)) {
    score = Math.round((answers.filter((a) => a.correct).length / answers.length) * 100);
  }

  try {
    await ensureCollection("child");
    await ensureCollection("wrong_item");
    await ensureCollection("practice_record");
    const child = await getDoc("child", childId);
    if (!child) return fail("child_not_found");

    const pass = score >= 80;
    const now = nowIso();
    const masteryChanges = [];
    const reflux = [];
    let examCooldownUntil = child.examCooldownUntil || "";

    if (!pass) {
      for (const ans of answers) {
        const lessonId = trimStr(ans.lessonId);
        if (!lessonId) continue;
        if (ans.correct) continue;
        const mastery = await upsertMastery(childId, lessonId, "wrong", trimStr(ans.subjectKey));
        masteryChanges.push({ lessonId, stars: mastery.stars });
        const data = {
          childId,
          lessonId,
          stem: trimStr(ans.stem) || `综合卷错题 ${trimStr(ans.questionId) || lessonId}`,
          errorType: "exam",
          confidence: 1,
          fileID: "",
          subjectKey: trimStr(ans.subjectKey) || mastery.subjectKey || "",
          source: "exam",
          createdAt: now,
          updatedAt: now,
        };
        const add = await db.collection("wrong_item").add({ data });
        reflux.push({ id: add._id, lessonId });
      }
      examCooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
      await db.collection("child").doc(childId).update({
        data: { examCooldownUntil, updatedAt: now },
      });
    }

    const durationSec = Number.isFinite(Number(e.durationSec)) ? Number(e.durationSec) : 0;
    const record = {
      childId,
      type: "exam",
      items: answers.map((a) => ({
        questionId: trimStr(a.questionId),
        lessonId: trimStr(a.lessonId),
        correct: Boolean(a.correct),
      })),
      score,
      pass,
      durationSec,
      createdAt: now,
    };
    const rec = await db.collection("practice_record").add({ data: record });

    return {
      ok: true,
      pass,
      score,
      recordId: rec._id,
      examCooldownUntil,
      mastery: masteryChanges,
      reflux,
    };
  } catch (err) {
    console.error("examSubmit", err);
    return fail("internal_error");
  }
};
