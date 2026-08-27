const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

function subjectOf(doc) {
  return trimStr(doc.subjectKey) || "unknown";
}

async function overview(childId) {
  await ensureCollection("mastery");
  const rows = await listWhere("mastery", { childId });
  const bySubject = {};
  for (const doc of rows) {
    const sk = subjectOf(doc);
    if (!bySubject[sk]) {
      bySubject[sk] = { weak: 0, full: 0, total: 0 };
    }
    bySubject[sk].total += 1;
    const stars = Number(doc.stars) || 0;
    if (stars > 0 && stars <= 2) bySubject[sk].weak += 1;
    if (countsFull(doc)) bySubject[sk].full += 1;
  }
  const fullStarCount = rows.filter(countsFull).length;
  return { ok: true, bySubject, fullStarCount, total: rows.length };
}

async function fullStarCount(childId) {
  await ensureCollection("mastery");
  const rows = await listWhere("mastery", { childId });
  const n = rows.filter(countsFull).length;
  return { ok: true, fullStarCount: n };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const childId = trimStr(e.childId);
  if (!childId) return fail("child_id_required");
  const action = trimStr(e.action) || "overview";
  try {
    await ensureCollection("child");
    const child = await getDoc("child", childId);
    if (!child) return fail("child_not_found");
    if (action === "fullStarCount") return await fullStarCount(childId);
    if (action === "overview") return await overview(childId);
    return fail("unknown_action");
  } catch (err) {
    console.error("masteryOverview", err);
    return fail("internal_error");
  }
};
