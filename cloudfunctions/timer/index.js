const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const TIMER_COL = "timer_session";
const CHILD_COL = "child";
const FAMILY_COL = "family";
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const SUBJECTS = [
  "语文",
  "数学",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "道德与法治",
  "未分科",
];

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nowMs() {
  return Date.now();
}

function nowIso(ms) {
  return new Date(ms || Date.now()).toISOString();
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function placeholderFamilyId(openid) {
  return `tmp:${openid}`;
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/already exist|已存在|-501001|DATABASE_COLLECTION_EXIST/i.test(msg)) {
      // 已存在忽略
    }
  }
}

function parseSubject(raw, required) {
  const subject = trimStr(raw);
  if (!subject) return required ? { error: "subject_required" } : { subject: "" };
  if (!SUBJECTS.includes(subject)) return { error: "subject_invalid" };
  return { subject };
}

function toSession(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    childId: doc.childId,
    familyId: doc.familyId || "",
    subject: doc.subject,
    status: doc.status,
    startedAt: doc.startedAt,
    lastPausedAt: doc.lastPausedAt || "",
    pausedMs: doc.pausedMs || 0,
    endedAt: doc.endedAt || "",
    durationSec: typeof doc.durationSec === "number" ? doc.durationSec : null,
    note: doc.note || "",
    forgotten: !!doc.forgotten,
    createdAt: doc.createdAt || "",
    updatedAt: doc.updatedAt || "",
  };
}

async function findFamilyByOpenid(openid) {
  await ensureCollection(FAMILY_COL);
  try {
    const res = await db
      .collection(FAMILY_COL)
      .where({ members: _.elemMatch({ openid }) })
      .limit(1)
      .get();
    return (res.data && res.data[0]) || null;
  } catch (e) {
    return null;
  }
}

async function assertChildAccess(openid, childId) {
  await ensureCollection(CHILD_COL);
  const got = await db.collection(CHILD_COL).doc(childId).get();
  const child = got.data;
  if (!child) return { error: "child_not_found" };
  const family = await findFamilyByOpenid(openid);
  if (family) {
    if (child.familyId !== family._id) return { error: "family_mismatch" };
    return { child, familyId: family._id };
  }
  if (child.familyId !== placeholderFamilyId(openid)) {
    return { error: "family_mismatch" };
  }
  return { child, familyId: child.familyId };
}

function wallMs(doc, at) {
  const start = Date.parse(doc.startedAt) || at;
  return at - start;
}

function computeDurationSec(doc, at) {
  let paused = doc.pausedMs || 0;
  if (doc.status === "paused" && doc.lastPausedAt) {
    paused += at - (Date.parse(doc.lastPausedAt) || at);
  }
  const raw = wallMs(doc, at) - paused;
  return Math.max(0, Math.round(raw / 1000));
}

async function findOpenSession(childId) {
  await ensureCollection(TIMER_COL);
  const res = await db
    .collection(TIMER_COL)
    .where({
      childId,
      status: _.in(["running", "paused"]),
    })
    .limit(5)
    .get();
  const rows = res.data || [];
  return rows.find((d) => d.status === "running") || rows[0] || null;
}

async function persistEnd(doc, at, extra = {}) {
  const forgotten = wallMs(doc, at) > FOUR_HOURS_MS;
  const durationSec = computeDurationSec(doc, at);
  const patch = {
    status: "ended",
    endedAt: nowIso(at),
    durationSec,
    forgotten,
    lastPausedAt: "",
    updatedAt: nowIso(at),
  };
  if (extra.note !== undefined) patch.note = extra.note;
  if (extra.subject) patch.subject = extra.subject;
  if (doc.status === "paused" && doc.lastPausedAt) {
    patch.pausedMs = (doc.pausedMs || 0) + (at - (Date.parse(doc.lastPausedAt) || at));
  }
  await db.collection(TIMER_COL).doc(doc._id).update({ data: patch });
  return toSession({ ...doc, ...patch, _id: doc._id });
}

async function autoCloseIfForgotten(doc) {
  if (!doc || (doc.status !== "running" && doc.status !== "paused")) return doc;
  const at = nowMs();
  if (wallMs(doc, at) <= FOUR_HOURS_MS) return doc;
  return persistEnd(doc, at);
}

async function loadSession(event, openid) {
  const sessionId = trimStr(event && (event.sessionId || event.id));
  const childId = trimStr(event && event.childId);
  await ensureCollection(TIMER_COL);
  let doc = null;
  if (sessionId) {
    const got = await db.collection(TIMER_COL).doc(sessionId).get();
    doc = got.data ? { ...got.data, _id: sessionId } : null;
    if (!doc) return { error: "session_not_found" };
  } else if (childId) {
    const access = await assertChildAccess(openid, childId);
    if (access.error) return access;
    doc = await findOpenSession(childId);
    if (!doc) return { error: "session_not_found" };
  } else {
    return { error: "session_id_required" };
  }
  const access = await assertChildAccess(openid, doc.childId);
  if (access.error) return access;
  doc = await autoCloseIfForgotten(doc);
  return { doc };
}

async function startTimer(event, openid) {
  const childId = trimStr(event && event.childId);
  if (!childId) return fail("child_id_required");
  const sub = parseSubject(event && event.subject, true);
  if (sub.error) return fail(sub.error);
  const access = await assertChildAccess(openid, childId);
  if (access.error) return fail(access.error);

  await ensureCollection(TIMER_COL);
  let open = await findOpenSession(childId);
  if (open) {
    open = await autoCloseIfForgotten(open);
  }
  if (open && open.status !== "ended") {
    return fail("already_running", { session: toSession(open) });
  }

  const at = nowMs();
  const now = nowIso(at);
  const note = trimStr(event && event.note);
  const data = {
    childId,
    familyId: access.familyId,
    subject: sub.subject,
    status: "running",
    startedAt: now,
    lastPausedAt: "",
    pausedMs: 0,
    endedAt: "",
    durationSec: null,
    note,
    forgotten: false,
    createdByOpenid: openid,
    createdAt: now,
    updatedAt: now,
  };
  const addRes = await db.collection(TIMER_COL).add({ data });
  return { ok: true, session: toSession({ ...data, _id: addRes._id }) };
}

async function pauseTimer(event, openid) {
  const loaded = await loadSession(event, openid);
  if (loaded.error) return fail(loaded.error);
  const doc = loaded.doc;
  if (doc.status === "ended") return fail("already_ended", { session: toSession(doc) });
  if (doc.status === "paused") return { ok: true, session: toSession(doc) };
  const at = nowMs();
  const patch = {
    status: "paused",
    lastPausedAt: nowIso(at),
    updatedAt: nowIso(at),
  };
  await db.collection(TIMER_COL).doc(doc._id).update({ data: patch });
  return { ok: true, session: toSession({ ...doc, ...patch, _id: doc._id }) };
}

async function resumeTimer(event, openid) {
  const loaded = await loadSession(event, openid);
  if (loaded.error) return fail(loaded.error);
  const doc = loaded.doc;
  if (doc.status === "ended") return fail("already_ended", { session: toSession(doc) });
  if (doc.status === "running") return { ok: true, session: toSession(doc) };
  const at = nowMs();
  const extraPaused = doc.lastPausedAt ? at - (Date.parse(doc.lastPausedAt) || at) : 0;
  const patch = {
    status: "running",
    pausedMs: (doc.pausedMs || 0) + extraPaused,
    lastPausedAt: "",
    updatedAt: nowIso(at),
  };
  await db.collection(TIMER_COL).doc(doc._id).update({ data: patch });
  return { ok: true, session: toSession({ ...doc, ...patch, _id: doc._id }) };
}

async function endTimer(event, openid) {
  const loaded = await loadSession(event, openid);
  if (loaded.error) return fail(loaded.error);
  const doc = loaded.doc;
  if (doc.status === "ended") return { ok: true, session: toSession(doc) };
  const sub = parseSubject(event && event.subject, false);
  if (sub.error) return fail(sub.error);
  const extra = {};
  if (event && event.note !== undefined) extra.note = trimStr(event.note);
  if (sub.subject) extra.subject = sub.subject;
  const session = await persistEnd(doc, nowMs(), extra);
  return { ok: true, session };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail("openid_missing");

  const action = trimStr(e.action);
  try {
    if (action === "start") return await startTimer(e, OPENID);
    if (action === "pause") return await pauseTimer(e, OPENID);
    if (action === "resume") return await resumeTimer(e, OPENID);
    if (action === "end") return await endTimer(e, OPENID);
    return fail("unknown_action");
  } catch (err) {
    console.error("timer", err);
    return fail("internal_error");
  }
};
