const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

const BATCH_COL = "homework_batch";
const CHILD_COL = "child";
const FAMILY_COL = "family";
const STATUS_PENDING = "待核对";
const FILE_MAX = 30;
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

function formatJobError(j) {
  if (!j) return "";
  return [j.error, j.message, j.httpStatus && `http${j.httpStatus}`, j.detail]
    .filter(Boolean)
    .join(" ")
    .slice(0, 240);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nowIso() {
  return new Date().toISOString();
}

function jobCallLimit(doc) {
  const n = Number(doc && doc.modelCallLimit);
  return n > 0 ? n : 1;
}

/** keep in sync with recognizeHomework computeCanRetry */
function computeCanRetry(job) {
  if (!job) return false;
  const status = job.status;
  if (status === "pending" || status === "running") return false;
  const qs = job.questions || [];
  const emptyDone = status === "done" && !qs.length;
  if (status !== "error" && !emptyDone) return false;
  if ((Number(job.deepseekCalls) || 0) >= 2) return false;
  if (jobCallLimit(job) !== 1) return false;
  return true;
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

function parseSubject(raw) {
  const subject = trimStr(raw) || "未分科";
  if (!SUBJECTS.includes(subject)) return { error: "subject_invalid" };
  return { subject };
}

function parseFileIDs(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw && raw.fileIds) ? raw.fileIds : [];
  const fileIDs = [];
  for (const item of list) {
    const id = trimStr(item);
    if (id) fileIDs.push(id);
  }
  if (!fileIDs.length) return { error: "file_ids_required" };
  if (fileIDs.length > FILE_MAX) return { error: "file_ids_too_many" };
  return { fileIDs };
}

function parseDate(raw) {
  const s = trimStr(raw);
  if (!s) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return { date: `${y}-${m}-${day}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: "date_invalid" };
  return { date: s };
}

function toBatch(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    childId: doc.childId,
    familyId: doc.familyId || "",
    subject: doc.subject,
    date: doc.date,
    source: doc.source || "",
    fileIDs: doc.fileIDs || doc.images || [],
    status: doc.status,
    jobId: doc.jobId || "",
    jobStatus: doc.jobStatus || "",
    fileCount: (doc.fileIDs || doc.images || []).length,
    questionCount: doc.questionCount || 0,
    jobError: doc.jobError || "",
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

async function listChildren(familyId) {
  await ensureCollection(CHILD_COL);
  const res = await db.collection(CHILD_COL).where({ familyId }).limit(100).get();
  return res.data || [];
}

async function resolveChildId(event, openid) {
  const given = trimStr(event && event.childId);
  const family = await findFamilyByOpenid(openid);
  const familyId = family ? family._id : placeholderFamilyId(openid);
  const children = await listChildren(familyId);

  if (given) {
    let doc = children.find((c) => c._id === given) || null;
    if (!doc) {
      try {
        const got = await db.collection(CHILD_COL).doc(given).get();
        doc = got.data || null;
      } catch (e) {
        doc = null;
      }
    }
    if (!doc) return { error: "child_not_found" };
    const tmp = placeholderFamilyId(openid);
    const allowed =
      doc.familyId === familyId ||
      doc.familyId === tmp ||
      doc.createdByOpenid === openid;
    if (!allowed) return { error: "family_mismatch" };
    return { childId: given, familyId: doc.familyId || familyId };
  }

  if (children.length === 1) {
    return { childId: children[0]._id, familyId, defaulted: true };
  }
  if (children.length === 0) return { error: "child_id_required" };
  return { error: "child_id_required" };
}

async function createBatch(event, openid) {
  const files = parseFileIDs(event && (event.fileIDs || event.fileIds));
  if (files.error) return fail(files.error);
  const sub = parseSubject(event && event.subject);
  if (sub.error) return fail(sub.error);
  const dateRes = parseDate(event && event.date);
  if (dateRes.error) return fail(dateRes.error);
  const source = trimStr(event && event.source);
  if (source.length > 64) return fail("source_too_long");

  const childRes = await resolveChildId(event, openid);
  if (childRes.error) return fail(childRes.error);

  await ensureCollection(BATCH_COL);
  const now = nowIso();
  const data = {
    childId: childRes.childId,
    familyId: childRes.familyId,
    subject: sub.subject,
    date: dateRes.date,
    source,
    fileIDs: files.fileIDs,
    images: files.fileIDs,
    status: STATUS_PENDING,
    jobId: "",
    jobStatus: "queued",
    questionCount: 0,
    createdByOpenid: openid,
    createdAt: now,
    updatedAt: now,
  };
  const addRes = await db.collection(BATCH_COL).add({ data });
  return {
    ok: true,
    batch: toBatch({ ...data, _id: addRes._id }),
    childIdDefaulted: !!childRes.defaulted,
  };
}

async function listBatches(event, openid) {
  const childRes = await resolveChildId(event, openid);
  if (childRes.error) return fail(childRes.error);
  await ensureCollection(BATCH_COL);
  const res = await db.collection(BATCH_COL).where({ childId: childRes.childId }).limit(50).get();
  const batches = (res.data || [])
    .map(toBatch)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const jobIds = batches.map((b) => b.jobId).filter(Boolean);
  for (const b of batches) {
    b.canRetry = false;
  }
  if (jobIds.length) {
    try {
      const jobs = await db.collection("recognize_job").where({ _id: _.in(jobIds) }).limit(50).get();
      const byId = {};
      for (const j of jobs.data || []) {
        byId[j._id] = j;
      }
      for (const b of batches) {
        const j = byId[b.jobId];
        if (!j) continue;
        b.jobStatus = j.status || b.jobStatus;
        if (Array.isArray(j.questions) && j.questions.length) {
          b.questionCount = j.questions.length;
        }
        b.jobError = formatJobError(j) || b.jobError;
        b.canRetry = computeCanRetry(j);
      }
    } catch (e) {
      // 无任务集合时仍返回批次
    }
  }
  return { ok: true, batches };
}

async function getBatch(event, openid) {
  const id = trimStr(event && (event.batchId || event.id));
  if (!id) return fail("batch_id_required");
  await ensureCollection(BATCH_COL);
  let doc;
  try {
    const got = await db.collection(BATCH_COL).doc(id).get();
    doc = got.data;
  } catch (e) {
    return fail("batch_not_found");
  }
  if (!doc) return fail("batch_not_found");
  const tmp = placeholderFamilyId(openid);
  const allowed = doc.createdByOpenid === openid || doc.familyId === tmp;
  if (!allowed) {
    const childRes = await resolveChildId({ childId: doc.childId }, openid);
    if (childRes.error) return fail("forbidden");
  }
  let questions = [];
  let mocked = false;
  let jobStatus = doc.jobStatus || "";
  let jobError = "";
  let canRetry = false;
  if (doc.jobId) {
    try {
      const job = await db.collection("recognize_job").doc(doc.jobId).get();
      const j = job.data;
      if (j) {
        questions = j.questions || [];
        mocked = !!j.mocked;
        jobStatus = j.status || jobStatus;
        jobError = formatJobError(j);
        canRetry = computeCanRetry(j);
      }
    } catch (e) {
      // 任务集合尚未建立时仍返回批次
    }
  }
  return {
    ok: true,
    batch: {
      ...toBatch({ ...doc, _id: id, jobStatus, questionCount: questions.length || doc.questionCount }),
      canRetry,
    },
    questions,
    mocked,
    jobError,
  };
}

exports.main = async (event) => {
  const e = event && typeof event === "object" ? event : {};
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail("openid_missing");

  const action = trimStr(e.action) || "create";
  try {
    if (action === "create") return await createBatch(e, OPENID);
    if (action === "list") return await listBatches(e, OPENID);
    if (action === "get") return await getBatch(e, OPENID);
    return fail("unknown_action");
  } catch (err) {
    console.error("homeworkBatch", err);
    return fail("internal_error");
  }
};
