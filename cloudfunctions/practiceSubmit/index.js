const cloud = require("wx-server-sdk");
const { applyMasteryEvent } = require("./masteryStars");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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
  const answers = Array.isArray(e.answers) ? e.answers : null;
  if (!answers || !answers.length) return fail("answers_required");
  const durationSec = Number(e.durationSec);
  if (!Number.isFinite(durationSec) || durationSec < 0) return fail("duration_sec_required");

  try {
    await ensureCollection("child");
    const child = await getDoc("child", childId);
    if (!child) return fail("child_not_found");

    await ensureCollection("wrong_item");
    await ensureCollection("practice_record");

    const masteryChanges = [];
    const reflux = [];
    const now = nowIso();

    for (const ans of answers) {
      const lessonId = trimStr(ans.lessonId);
      if (!lessonId) continue;
      const correct = Boolean(ans.correct);
      const mastery = await upsertMastery(
        childId,
        lessonId,
        correct ? "correct" : "wrong",
        trimStr(ans.subjectKey)
      );
      masteryChanges.push({
        lessonId,
        stars: mastery.stars,
        countsTowardFullStar: mastery.countsTowardFullStar,
      });
      if (!correct) {
        const data = {
          childId,
          lessonId,
          stem: trimStr(ans.stem) || `补练错题 ${trimStr(ans.questionId) || lessonId}`,
          errorType: "practice",
          confidence: 1,
          fileID: "",
          subjectKey: trimStr(ans.subjectKey) || mastery.subjectKey || "",
          source: "practice",
          createdAt: now,
          updatedAt: now,
        };
        const add = await db.collection("wrong_item").add({ data });
        reflux.push({ id: add._id, lessonId });
      }
    }

    const score =
      answers.length === 0
        ? 0
        : Math.round(
            (answers.filter((a) => a.correct).length / answers.length) * 100
          );

    const record = {
      childId,
      type: "practice",
      items: answers.map((a) => ({
        questionId: trimStr(a.questionId),
        lessonId: trimStr(a.lessonId),
        correct: Boolean(a.correct),
      })),
      score,
      durationSec,
      createdAt: now,
    };
    const rec = await db.collection("practice_record").add({ data: record });

    return {
      ok: true,
      recordId: rec._id,
      score,
      durationSec,
      mastery: masteryChanges,
      reflux,
    };
  } catch (err) {
    console.error("practiceSubmit", err);
    return fail("internal_error");
  }
};
