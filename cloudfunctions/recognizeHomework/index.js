const cloud = require("wx-server-sdk");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const Jimp = require("jimp");
const { parseQuestions, mockQuestions, parseProbe, sanitizeLessonId } = require("./parse");
const { normalizeGrade, normalizeVolume, subjectKeyFromLabel, pickEdition, matchLesson, attachMatch } = require("./matchCatalog");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  timeout: 60000,
});

const db = cloud.database();
const _ = db.command;
const EDITION_COL = "catalog_edition";
const LESSON_COL = "catalog_lesson";
const JOB_COL = "recognize_job";

const DEFAULT_VISION_MODEL = "glm-5v-turbo";
const DEFAULT_TEXT_MODEL = "hy3";
const GATEWAY_BASE = "http://119.45.25.177:3000/v1";
const PROVIDER = "glm";
const MAX_INLINE_JPEG = 46 * 1024;
const MAX_BASE64_CHARS = 64 * 1024;

const HOMEWORK_PROMPT = require("./homeworkPrompt");
const { closedListAppendix } = HOMEWORK_PROMPT;
const PROBE_PROMPT = require("./probePrompt");
const CLOSED_LIST_MAX = 80;

const SUBJECT_LABEL = {
  math: "数学",
  chinese: "语文",
  physics: "物理",
  chemistry: "化学",
  geography: "地理",
  biology: "生物",
  history: "历史",
  morality: "道德与法治",
};

function asDataUrl(base64, mime) {
  const raw = String(base64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  if (raw.length > MAX_BASE64_CHARS) {
    throw Object.assign(new Error("image_too_large"), { code: "image_too_large" });
  }
  return `data:${mime || "image/jpeg"};base64,${raw}`;
}

async function compressToJpegDataUrl(buf, tag) {
  const input = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const img = await Jimp.read(input);
  let side = 1200;
  if (img.bitmap.width > side || img.bitmap.height > side) {
    img.scaleToFit(side, side);
  }
  let quality = 68;
  let out = await img.clone().quality(quality).getBufferAsync(Jimp.MIME_JPEG);
  let guard = 0;
  while (out.length > MAX_INLINE_JPEG && guard < 14) {
    guard += 1;
    if (quality > 48) {
      quality -= 5;
    } else {
      side = Math.max(480, Math.floor(side * 0.82));
      img.scaleToFit(side, side);
      quality = 55;
    }
    out = await img.clone().quality(quality).getBufferAsync(Jimp.MIME_JPEG);
  }
  logDs("image_compressed", {
    tag,
    inBytes: input.length,
    outBytes: out.length,
    quality,
    w: img.bitmap.width,
    h: img.bitmap.height,
  });
  return asDataUrl(out.toString("base64"), "image/jpeg");
}

async function downloadFileId(fileID) {
  const dl = await cloud.downloadFile({ fileID: String(fileID) });
  return compressToJpegDataUrl(dl.fileContent, "fileID");
}

function collectFileIds(event) {
  const ids = [];
  if (Array.isArray(event.fileIDs)) {
    for (const id of event.fileIDs) {
      if (id) ids.push(String(id));
    }
  }
  if (event.fileID) ids.push(String(event.fileID));
  return ids.filter(Boolean);
}

async function resolveImageUrls(event) {
  const urls = [];
  if (event.imageUrl) {
    const src = String(event.imageUrl);
    if (/^https?:\/\//i.test(src)) {
      urls.push(src);
    }
  }
  if (event.imageBase64) {
    const raw = String(event.imageBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    urls.push(await compressToJpegDataUrl(Buffer.from(raw, "base64"), "base64"));
  }
  for (const id of collectFileIds(event)) {
    urls.push(await downloadFileId(id));
  }
  return urls;
}

function formatAiError(err) {
  const status = err && err.response && err.response.status;
  const data = err && err.response && err.response.data;
  let detail = "";
  if (data != null) {
    try {
      detail = typeof data === "string" ? data : JSON.stringify(data);
    } catch (e) {
      detail = String(data);
    }
  }
  if (detail.length > 2000) {
    detail = detail.slice(0, 2000);
  }
  let message = err && err.message ? String(err.message) : "ai_failed";
  if (status === 401 || status === 403) {
    message = "模型中台鉴权失败，请检查云函数环境变量 AI_GATEWAY_API_KEY";
  }
  if (status === 413) {
    message = "模型中台拒绝过大请求（413）。图片需压缩到约 60KB 以内";
  }
  if (!status && /timeout/i.test(message)) {
    message =
      "识图超时：云函数约 50 秒内中台未返回。控制台 VISION_MODEL 若为 glm-4v-turbo 请改成 glm-5v-turbo（4v 常被 TokenHub 拖到 120 秒，云函数 60 秒会先断开）";
  }
  return {
    message,
    httpStatus: status,
    detail: detail || undefined,
  };
}

function logDs(msg, extra) {
  if (extra !== undefined) console.log("[kx-ds]", msg, extra);
  else console.log("[kx-ds]", msg);
}

function logDrain(msg, extra) {
  if (extra !== undefined) console.log("[kx-drain]", msg, extra);
  else console.log("[kx-drain]", msg);
}

function countVisionImages(messages) {
  let n = 0;
  for (const m of messages || []) {
    const c = m.content;
    if (!Array.isArray(c)) continue;
    for (const p of c) {
      if (p && p.type === "image_url") n += 1;
    }
  }
  return n;
}
function gatewayKey() {
  return String(process.env.AI_GATEWAY_API_KEY || process.env.DEEPSEEK_API_KEY || "").trim();
}

function gatewayBase() {
  return String(process.env.AI_GATEWAY_BASE_URL || GATEWAY_BASE).replace(/\/$/, "");
}

function postJson({ url, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body || "";
    const startedAt = Date.now();
    const isHttp = u.protocol === "http:";
    const lib = isHttp ? http : https;
    const port = u.port ? Number(u.port) : isHttp ? 80 : 443;
    logDs("http_begin", {
      host: u.hostname,
      port,
      path: u.pathname,
      bodyBytes: Buffer.byteLength(payload),
    });
    const req = lib.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: timeoutMs || 50000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          const elapsed = Date.now() - startedAt;
          logDs("http_end", { status: res.statusCode, elapsedMs: elapsed, bytes: raw.length });
          let data;
          try {
            data = JSON.parse(raw);
          } catch (e) {
            data = { raw: raw.slice(0, 2000) };
          }
          if (res.statusCode >= 400) {
            const err = new Error(`Request failed with status code ${res.statusCode}`);
            err.response = { status: res.statusCode, data };
            reject(err);
            return;
          }
          resolve(data);
        });
      }
    );
    req.on("error", (err) => {
      logDs("http_error", { message: String(err && err.message) });
      reject(err);
    });
    req.on("timeout", () => {
      logDs("http_timeout", { timeoutMs: timeoutMs || 50000 });
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(payload);
    req.end();
  });
}

async function generateChat(modelName, messages, extra = {}) {
  const apiKey = gatewayKey();
  if (!apiKey) {
    logDs("skip_no_key", { model: modelName });
    return { ok: false, error: "missing_ai_key", model: modelName };
  }
  const base = gatewayBase();
  logDs("request", {
    model: modelName,
    images: countVisionImages(messages),
    hasKey: true,
    base,
  });
  if (/4v/i.test(modelName)) {
    logDs("warn_slow_model", { model: modelName, hint: "prefer glm-5v-turbo" });
  }
  try {
    const data = await postJson({
      url: `${base}/chat/completions`,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "identity",
        },
      body: JSON.stringify({
        model: modelName,
        messages,
        ...extra,
      }),
      timeoutMs: 45000,
    });
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const chunks = [];
    const pushChunk = (v) => {
      if (v == null) return;
      if (Array.isArray(v)) {
        if (v.length && typeof v[0] === "object") {
          chunks.push(JSON.stringify(v));
          return;
        }
        chunks.push(v.map((p) => (p && p.text ? p.text : String(p || ""))).join(""));
        return;
      }
      if (typeof v === "object") {
        chunks.push(JSON.stringify(v));
        return;
      }
      const s = String(v);
      if (s) chunks.push(s);
    };
    pushChunk(msg && msg.content);
    pushChunk(msg && msg.reasoning_content);
    pushChunk(msg && msg.reasoning);
    if (data && data.choices && data.choices[0] && data.choices[0].text) {
      pushChunk(data.choices[0].text);
    }
    const text = chunks.join("\n");
    logDs("ok", {
      model: modelName,
      textLen: text.length,
      contentLen: String((msg && msg.content) || "").length,
      usage: data && data.usage,
    });
    return {
      ok: true,
      mocked: false,
      provider: PROVIDER,
      model: modelName,
      text: text.slice(0, 50000),
      usage: data && data.usage ? data.usage : undefined,
    };
  } catch (err) {
    const formatted = formatAiError(err);
    logDs("fail", { model: modelName, ...formatted });
    return {
      ok: false,
      mocked: false,
      error: "ai_failed",
      provider: PROVIDER,
      model: modelName,
      ...formatted,
    };
  }
}

async function generate(modelName, messages, extra = {}) {
  if (typeof cloud.ai !== "function") {
    return { ok: false, error: "ai_sdk_missing" };
  }
  try {
    const ai = cloud.ai();
    const chat = ai.createModel("cloudbase");
    const result = await chat.generateText({
      model: modelName,
      messages,
      ...extra,
    });
    const text = result && result.text ? String(result.text) : "";
    return {
      ok: true,
      mocked: false,
      model: modelName,
      text: text.slice(0, 4000),
      usage: result && result.usage ? result.usage : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      mocked: false,
      error: "ai_failed",
      model: modelName,
      ...formatAiError(err),
    };
  }
}

function imageContentParts(imageUrls) {
  return imageUrls.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));
}

async function listEditionsFor(grade, subjectLabel) {
  const where = { online: true };
  if (grade) where.gradeLabel = grade;
  if (subjectLabel) where.subjectLabel = subjectLabel;
  try {
    const res = await db.collection(EDITION_COL).where(where).limit(100).get();
    return res.data || [];
  } catch (e) {
    return [];
  }
}

async function listLessonsForEdition(editionId) {
  const out = [];
  let skip = 0;
  try {
    while (skip < 300) {
      const res = await db.collection(LESSON_COL).where({ editionId }).skip(skip).limit(100).get();
      const rows = res.data || [];
      out.push(...rows);
      if (rows.length < 100) break;
      skip += 100;
    }
  } catch (e) {
    return out;
  }
  return out;
}

function findClosedLesson(lessonId, closedList) {
  const id = String(lessonId || "").trim();
  if (!id || !Array.isArray(closedList) || !closedList.length) return null;
  const row = closedList.find((x) => x && x.lessonId === id);
  if (!row) return null;
  return { lesson: { lessonId: row.lessonId, lessonLabel: row.lessonLabel || "" }, score: 100 };
}

async function enrichQuestions(questions, closedList) {
  const cache = new Map();
  const out = [];
  for (const q of questions || []) {
    const grade = normalizeGrade(q.grade);
    const volume = normalizeVolume(q.volume);
    const subjectKey = subjectKeyFromLabel(q.subject);
    const withNorm = { ...q, grade, volume, subjectKey };
    if (!subjectKey || subjectKey === "english" || !grade) {
      out.push(attachMatch(withNorm, null, null));
      continue;
    }
    const cacheKey = `${grade}|${subjectKey}|${volume}`;
    let pack = cache.get(cacheKey);
    if (!pack) {
      let editions = await listEditionsFor(grade, SUBJECT_LABEL[subjectKey]);
      if (!editions.length && subjectKey === "morality") {
        editions = await listEditionsFor(grade, "思想政治");
      }
      const edition = pickEdition(editions, { grade, volume, subjectKey });
      let lessons = [];
      if (edition) {
        const eid = edition.editionId || edition._id;
        lessons = await listLessonsForEdition(eid);
      }
      pack = { edition, lessons };
      cache.set(cacheKey, pack);
    }
    const closedHit = findClosedLesson(q.lessonId, closedList);
    const hit = closedHit || matchLesson(pack.lessons, q.lessonHint);
    out.push(attachMatch(withNorm, pack.edition, hit));
  }
  return out;
}

async function ensureJobCol() {
  try {
    await db.createCollection(JOB_COL);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/already exist|已存在|-501001|DATABASE_COLLECTION_EXIST/i.test(msg)) {
      // ignore
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

function jobCallLimit(doc) {
  const n = Number(doc && doc.modelCallLimit);
  return n > 0 ? n : 1;
}

/** keep in sync with homeworkBatch computeCanRetry（SPEC-catalog-two-pass-vision 假设 5） */
function computeCanRetry(job) {
  if (!job) return false;
  const status = job.status;
  if (status === "pending" || status === "running") return false;
  const qs = job.questions || [];
  const emptyDone = status === "done" && !qs.length;
  if (status !== "error" && !emptyDone) return false;
  const limit = jobCallLimit(job);
  const calls = Number(job.deepseekCalls) || 0;
  if (calls < limit) return false;
  if (limit >= 3) return false;
  return true;
}

async function syncBatch(batchId, patch) {
  if (!batchId) return;
  try {
    await db.collection("homework_batch").doc(batchId).update({
      data: { ...patch, updatedAt: nowIso() },
    });
  } catch (e) {
    console.error("syncBatch", e);
  }
}

async function startJob(event, openid) {
  await ensureJobCol();
  const fileIDs = collectFileIds(event);
  const mock = event.mock === true;
  const batchId = String(event.batchId || "").trim();
  if (!mock && !fileIDs.length && !event.imageUrl && !event.imageBase64) {
    return { ok: false, error: "need_image" };
  }
  const now = nowIso();
  const add = await db.collection(JOB_COL).add({
    data: {
      status: "pending",
      fileIDs,
      imageUrl: event.imageUrl || "",
      mock,
      batchId,
      childId: event.childId || "",
      createdByOpenid: openid || "",
      questions: [],
      error: "",
      deepseekCalls: 0,
      modelCallLimit: 2,
      visionStage: "need_probe",
      lessonClosedList: [],
      createdAt: now,
      updatedAt: now,
    },
  });
  const jobId = add._id;
  logDrain("start_created", { jobId, batchId, fileCount: fileIDs.length, mock });
  await syncBatch(batchId, { jobId, jobStatus: "pending" });
  return { ok: true, jobId, batchId, status: "pending" };
}

async function pollJob(event) {
  const jobId = String(event.jobId || event.id || "").trim();
  if (!jobId) return { ok: false, error: "job_id_required" };
  await ensureJobCol();
  let doc;
  try {
    const got = await db.collection(JOB_COL).doc(jobId).get();
    doc = got.data;
  } catch (e) {
    return { ok: false, error: "job_not_found" };
  }
  if (!doc) return { ok: false, error: "job_not_found" };
  return {
    ok: true,
    jobId,
    status: doc.status,
    questions: doc.questions || [],
    mocked: !!doc.mocked,
    error: doc.error || "",
    message: doc.message || "",
  };
}

async function runJob(event) {
  const jobId = String(event.jobId || "").trim();
  if (!jobId) return { ok: false, error: "job_id_required" };
  await ensureJobCol();
  let doc;
  try {
    const got = await db.collection(JOB_COL).doc(jobId).get();
    doc = got.data;
  } catch (e) {
    return { ok: false, error: "job_not_found" };
  }
  if (!doc) return { ok: false, error: "job_not_found" };
  if (doc.status === "done") {
    logDrain("run_skip", { jobId, reason: "done" });
    return { ok: true, jobId, status: "done", skipped: true };
  }
  const limit = jobCallLimit(doc);
  const calls = Number(doc.deepseekCalls) || 0;
  if (calls >= limit) {
    logDrain("run_skip", { jobId, reason: "quota", status: doc.status, deepseekCalls: calls, limit });
    return { ok: true, jobId, status: doc.status, skipped: true, reason: "quota" };
  }
  const stage = doc.visionStage;
  logDrain("run_begin", {
    jobId,
    mock: !!doc.mock,
    files: (doc.fileIDs || []).length,
    calls,
    limit,
    visionStage: stage || "",
  });
  await db.collection(JOB_COL).doc(jobId).update({
    data: { deepseekCalls: calls + 1, status: "running", updatedAt: nowIso() },
  });
  await syncBatch(doc.batchId, { jobStatus: "running" });
  const payload = {
    mock: doc.mock === true,
    fileIDs: doc.fileIDs,
    imageUrl: doc.imageUrl,
  };
  const twoPassProbe = stage === "need_probe" && doc.mock !== true;
  let result;
  try {
    if (twoPassProbe) {
      result = await processProbe(payload);
      if (!result.ok && (result.error === "missing_ai_key" || result.error === "missing_deepseek_key")) {
        result = await processRecognize({ mock: true });
        result.message = "无模型密钥，已用演示结果";
      } else {
        const parked = await parkAfterProbe(jobId, doc, result);
        return parked;
      }
    } else {
      const closed = Array.isArray(doc.lessonClosedList) ? doc.lessonClosedList : [];
      const english = subjectKeyFromLabel(doc.probeSubject) === "english";
      const useClosed = stage === "need_grade" && !english && closed.length;
      result = await processRecognize({
        ...payload,
        lessonClosedList: useClosed ? closed : [],
      });
      if (!result.ok && (result.error === "missing_ai_key" || result.error === "missing_deepseek_key")) {
        result = await processRecognize({ mock: true });
        result.message = "无模型密钥，已用演示结果";
      }
    }
  } catch (err) {
    result = {
      ok: false,
      error: "run_exception",
      message: String((err && err.message) || err),
      questions: [],
    };
  }
  const patch = {
    updatedAt: nowIso(),
    mocked: !!result.mocked,
    error: result.ok ? "" : result.error || "run_failed",
    message: result.message || "",
    httpStatus: result.httpStatus || 0,
    detail: String(result.detail || "").slice(0, 800),
    questions: result.questions || [],
    status: result.ok ? "done" : "error",
  };
  if (result.ok) patch.visionStage = "complete";
  if (!result.ok) {
    console.error("recognize run fail", patch.error, patch.message, patch.httpStatus, patch.detail);
  }
  await db.collection(JOB_COL).doc(jobId).update({ data: patch });
  await syncBatch(doc.batchId, {
    jobStatus: patch.status,
    questionCount: (patch.questions || []).length,
    jobError: result.ok ? "" : [patch.error, patch.message].filter(Boolean).join(" ").slice(0, 240),
  });
  logDrain("run_end", { jobId, status: patch.status, questions: (patch.questions || []).length, error: patch.error });
  return { ok: true, jobId, status: patch.status };
}

async function buildLessonClosedList(probe) {
  const grade = normalizeGrade(probe && probe.grade);
  const volume = normalizeVolume(probe && probe.volume);
  const subjectKey = subjectKeyFromLabel(probe && probe.subject);
  if (!subjectKey || subjectKey === "english" || !grade) return [];
  let editions = await listEditionsFor(grade, SUBJECT_LABEL[subjectKey]);
  if (!editions.length && subjectKey === "morality") {
    editions = await listEditionsFor(grade, "思想政治");
  }
  const edition = pickEdition(editions, { grade, volume, subjectKey });
  if (!edition) return [];
  const lessons = await listLessonsForEdition(edition.editionId || edition._id);
  const list = [];
  for (const row of lessons) {
    const lessonId = String((row && (row.lessonId || row._id)) || "").trim();
    if (!lessonId) continue;
    list.push({
      lessonId,
      lessonLabel: String((row && row.lessonLabel) || "").trim(),
    });
    if (list.length >= CLOSED_LIST_MAX) {
      logDs("closed_list_truncated", {
        editionId: edition.editionId || edition._id,
        total: lessons.length,
        cap: CLOSED_LIST_MAX,
      });
      break;
    }
  }
  return list;
}

async function processProbe(event = {}) {
  const modelName = event.model || process.env.VISION_MODEL || DEFAULT_VISION_MODEL;
  let imageUrls;
  try {
    imageUrls = await resolveImageUrls(event);
  } catch (e) {
    return { ok: false, error: e.code || "image_error", message: e.message };
  }
  if (!imageUrls.length) {
    return { ok: false, error: "need_image" };
  }
  const result = await generateChat(
    modelName,
    [
      {
        role: "user",
        content: [{ type: "text", text: PROBE_PROMPT }, ...imageContentParts(imageUrls)],
      },
    ],
    { max_tokens: 2048 }
  );
  if (!result.ok) return result;
  const parsed = parseProbe(result.text);
  logDs("probe_parse", {
    parseOk: parsed.parseOk,
    grade: parsed.grade,
    volume: parsed.volume,
    subject: parsed.subject,
    hints: (parsed.lessonHints || []).length,
    textLen: String(result.text || "").length,
  });
  return {
    ok: true,
    parseOk: parsed.parseOk,
    grade: parsed.grade,
    volume: parsed.volume,
    subject: parsed.subject,
    lessonHints: parsed.lessonHints,
    usage: result.usage,
  };
}

async function parkAfterProbe(jobId, doc, probeResult) {
  let closed = [];
  try {
    if (probeResult && probeResult.parseOk) {
      closed = await buildLessonClosedList(probeResult);
    }
  } catch (e) {
    console.error("buildLessonClosedList", e);
    closed = [];
  }
  const patch = {
    status: "pending",
    visionStage: "need_grade",
    questions: [],
    probeGrade: (probeResult && probeResult.grade) || "",
    probeVolume: (probeResult && probeResult.volume) || "",
    probeSubject: (probeResult && probeResult.subject) || "",
    lessonHints: (probeResult && probeResult.lessonHints) || [],
    lessonClosedList: closed,
    error: "",
    message: "",
    mocked: false,
    updatedAt: nowIso(),
  };
  await db.collection(JOB_COL).doc(jobId).update({ data: patch });
  await syncBatch(doc.batchId, { jobStatus: "pending", jobError: "", questionCount: 0 });
  logDrain("probe_park", { jobId, closed: closed.length, subject: patch.probeSubject });
  return { ok: true, jobId, status: "pending", visionStage: "need_grade" };
}

async function drainPending() {
  logDrain("tick", { at: nowIso() });
  await ensureJobCol();
  const now = Date.now();
  let stuck = [];
  try {
    const res = await db.collection(JOB_COL).where({ status: "running" }).limit(20).get();
    stuck = res.data || [];
  } catch (e) {
    logDrain("query_running_fail", { message: String((e && e.message) || e) });
    stuck = [];
  }
  logDrain("query_running", { count: stuck.length, ids: stuck.map((x) => x._id) });
  for (const row of stuck) {
    const qs = row.questions || [];
    const age = now - Date.parse(row.updatedAt || 0);
    if (qs.length || !Number.isFinite(age) || age < 20000) {
      logDrain("stuck_keep", { jobId: row._id, ageMs: age, questions: qs.length });
      continue;
    }
    if ((Number(row.deepseekCalls) || 0) >= 1) {
      logDrain("stuck_fail", { jobId: row._id, ageMs: age });
      await db.collection(JOB_COL).doc(row._id).update({
        data: {
          status: "error",
          error: "ai_failed",
          message: "云函数等待超时（中台可能已成功）。同一任务不会再调模型。",
          updatedAt: nowIso(),
        },
      });
      await syncBatch(row.batchId, { jobStatus: "error", jobError: "等待超时" });
      continue;
    }
    logDrain("stuck_reset", { jobId: row._id, ageMs: age });
    await db.collection(JOB_COL).doc(row._id).update({
      data: { status: "pending", deepseekCalls: 0, updatedAt: nowIso() },
    });
    await syncBatch(row.batchId, { jobStatus: "pending", jobError: "" });
  }
  let pending = [];
  try {
    const res = await db.collection(JOB_COL).where({ status: "pending" }).limit(1).get();
    pending = res.data || [];
  } catch (e) {
    logDrain("query_pending_fail", { message: String((e && e.message) || e) });
    return { ok: false, error: "drain_query_failed" };
  }
  logDrain("query_pending", { count: pending.length, ids: pending.map((x) => x._id) });
  if (!pending.length) {
    logDrain("idle");
    return { ok: true, drained: 0 };
  }
  logDrain("pick", { jobId: pending[0]._id });
  return runJob({ jobId: pending[0]._id });
}

async function retryJob(event, openid) {
  const jobId = String((event && (event.jobId || event.id)) || "").trim();
  if (!jobId) return { ok: false, error: "job_id_required" };
  if (!openid) return { ok: false, error: "forbidden" };
  await ensureJobCol();
  let doc;
  try {
    const got = await db.collection(JOB_COL).doc(jobId).get();
    doc = got.data;
  } catch (e) {
    return { ok: false, error: "job_not_found" };
  }
  if (!doc) return { ok: false, error: "job_not_found" };
  if (String(doc.createdByOpenid || "") !== openid) {
    return { ok: false, error: "forbidden" };
  }
  const status = doc.status;
  if (status === "pending" || status === "running") {
    return { ok: false, error: "not_retryable" };
  }
  if (status === "done" && (doc.questions || []).length) {
    return { ok: false, error: "not_retryable" };
  }
  if (!computeCanRetry(doc)) {
    if (jobCallLimit(doc) >= 3) {
      return { ok: false, error: "quota_exhausted" };
    }
    return { ok: false, error: "not_retryable" };
  }
  const nextLimit = Math.min(3, jobCallLimit(doc) + 1);
  const closedLen = Array.isArray(doc.lessonClosedList) ? doc.lessonClosedList.length : 0;
  const visionStage = closedLen ? "need_grade" : "need_probe";
  await db.collection(JOB_COL).doc(jobId).update({
    data: {
      status: "pending",
      modelCallLimit: nextLimit,
      visionStage,
      error: "",
      message: "",
      updatedAt: nowIso(),
    },
  });
  await syncBatch(doc.batchId, { jobStatus: "pending", jobError: "" });
  logDrain("retry", { jobId, deepseekCalls: doc.deepseekCalls, modelCallLimit: nextLimit, visionStage });
  return { ok: true, jobId, status: "pending", modelCallLimit: nextLimit };
}

async function processRecognize(event = {}) {
  if (event.mock === true) {
    const questions = mockQuestions().map((q) =>
      attachMatch(
        {
          ...q,
          grade: normalizeGrade(q.grade),
          volume: normalizeVolume(q.volume),
          subjectKey: subjectKeyFromLabel(q.subject),
        },
        null,
        null
      )
    );
    return {
      ok: true,
      mocked: true,
      model: event.model || DEFAULT_VISION_MODEL,
      questions,
    };
  }

  if (event.textSmoke === true) {
    const modelName = event.model || DEFAULT_TEXT_MODEL;
    const prompt = event.prompt || "只回复两个字：正常";
    return generate(modelName, [{ role: "user", content: prompt }]);
  }

  const modelName = event.model || process.env.VISION_MODEL || DEFAULT_VISION_MODEL;

  let imageUrls;
  try {
    imageUrls = await resolveImageUrls(event);
  } catch (e) {
    return { ok: false, error: e.code || "image_error", message: e.message };
  }
  if (!imageUrls.length) {
    return { ok: false, error: "need_image" };
  }

  const smoke = event.smoke === true;
  const closedList = Array.isArray(event.lessonClosedList) ? event.lessonClosedList : [];
  let prompt = event.prompt || (smoke ? "用一两句话描述这张图片里有什么。" : HOMEWORK_PROMPT);
  if (!smoke && !event.prompt && closedList.length) {
    prompt += closedListAppendix(closedList);
  }
  const result = await generateChat(
    modelName,
    [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageContentParts(imageUrls)],
      },
    ],
    smoke ? {} : { max_tokens: 8192 }
  );
  if (!result.ok) {
    return result;
  }
  if (smoke) {
    return { ...result, questions: [], parseOk: true };
  }

  const parsed = parseQuestions(result.text);
  logDs("parse", {
    parseOk: parsed.parseOk,
    rawCount: parsed.rawCount,
    kept: (parsed.questions || []).length,
    textLen: String(result.text || "").length,
    preview: parsed.parseOk ? undefined : String(result.text || "").slice(0, 160),
  });
  if (!parsed.parseOk) {
    return {
      ok: false,
      mocked: false,
      error: "parse_failed",
      provider: PROVIDER,
      model: modelName,
      message: "模型未返回合法 JSON（需含 questions 数组）",
      preview: String(result.text || "").slice(0, 240),
    };
  }
  if (!parsed.questions.length) {
    return {
      ok: false,
      mocked: false,
      error: "parse_failed",
      provider: PROVIDER,
      model: modelName,
      message: "模型返回了 JSON 但没有可用题干，请下拉刷新或重拍",
      preview: String(result.text || "").slice(0, 240),
    };
  }
  let questions = parsed.questions;
  if (closedList.length) {
    questions = questions.map((q) => ({
      ...q,
      lessonId: sanitizeLessonId(q.lessonId, closedList),
    }));
  }
  try {
    questions = await enrichQuestions(questions, closedList);
  } catch (e) {
    console.error("enrichQuestions", e);
  }
  return {
    ok: true,
    mocked: false,
    provider: PROVIDER,
    model: modelName,
    questions,
    parseOk: true,
    usage: result.usage,
  };
}

function remainMs(context) {
  try {
    if (context && typeof context.getRemainingTimeInMillis === "function") {
      return context.getRemainingTimeInMillis();
    }
  } catch (e) {
    return undefined;
  }
  return undefined;
}

exports.main = async (event = {}, context) => {
  const e = event && typeof event === "object" ? event : {};
  const action = String(e.action || "").trim();
  const { OPENID } = cloud.getWXContext();
  try {
    if (e.Type === "Timer" || e.TriggerName || action === "drain") {
      logDrain("invoke", {
        Type: e.Type,
        TriggerName: e.TriggerName,
        action,
        remainMs: remainMs(context),
      });
      return await drainPending();
    }
    if (action === "start") return await startJob(e, OPENID);
    if (action === "retry") return await retryJob(e, OPENID);
    if (action === "poll") return await pollJob(e);
    if (action === "run") return await runJob(e);
    return await processRecognize(e);
  } catch (err) {
    console.error("recognizeHomework", err);
    return { ok: false, error: "internal_error", message: String((err && err.message) || err) };
  }
};
