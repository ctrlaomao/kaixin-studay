const cloud = require("wx-server-sdk");
const https = require("https");
const { URL } = require("url");
const { parseQuestions, mockQuestions } = require("./parse");
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

const DEFAULT_VISION_MODEL = "deepseek-v4-flash-vision-exp";
const DEFAULT_TEXT_MODEL = "hy3";
const DEEPSEEK_BASE = "https://api.deepseek.com";
const MAX_BASE64_CHARS = 7 * 1024 * 1024;

const HOMEWORK_PROMPT = `你是家庭作业错题识别助手。只根据图片作答。
只输出一个 JSON 对象，不要 markdown 围栏，不要其它说明。格式：
{"questions":[{"stem":"题干原文或转写","grade":"七年级或八年级或九年级","volume":"上册或下册","subject":"语文或数学或英语或物理或化学或生物或历史或地理或道德与法治","lessonHint":"同步课堂课时名，看不清可空","confidence":0.0,"isWrong":true}]}
isWrong 表示学生这题做错。confidence 0 到 1。看不清就降低 confidence，不要编造。年级册次学科从卷面归纳。`;

function asDataUrl(base64, mime) {
  const raw = String(base64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  if (raw.length > MAX_BASE64_CHARS) {
    throw Object.assign(new Error("image_too_large"), { code: "image_too_large" });
  }
  return `data:${mime || "image/jpeg"};base64,${raw}`;
}

async function downloadFileId(fileID) {
  const dl = await cloud.downloadFile({ fileID: String(fileID) });
  const buf = dl.fileContent;
  const b64 = Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");
  return asDataUrl(b64, "image/jpeg");
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
  if (event.imageUrl) urls.push(String(event.imageUrl));
  if (event.imageBase64) urls.push(asDataUrl(event.imageBase64, event.mime));
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
  if (status === 402 || /Insufficient Balance/i.test(detail)) {
    message = "DeepSeek 余额不足，请到 platform.deepseek.com 充值后再识别";
  }
  return {
    message,
    httpStatus: status,
    detail: detail || undefined,
  };
}

function httpsJson({ url, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body || "";
    const req = https.request(
      {
        hostname: u.hostname,
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
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(payload);
    req.end();
  });
}

async function generateDeepseek(modelName, messages, extra = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "missing_deepseek_key", model: modelName };
  }
  const base = (process.env.DEEPSEEK_BASE_URL || DEEPSEEK_BASE).replace(/\/$/, "");
  try {
    const data = await httpsJson({
      url: `${base}/chat/completions`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        ...extra,
      }),
    });
    const text =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? String(data.choices[0].message.content)
        : "";
    return {
      ok: true,
      mocked: false,
      provider: "deepseek",
      model: modelName,
      text: text.slice(0, 4000),
      usage: data && data.usage ? data.usage : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      mocked: false,
      error: "ai_failed",
      provider: "deepseek",
      model: modelName,
      ...formatAiError(err),
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

function imageContentParts(imageUrls, detail) {
  return imageUrls.map((url) => ({
    type: "image_url",
    image_url: { url, detail },
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

async function enrichQuestions(questions) {
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
      const labelMap = {
        math: "数学",
        chinese: "语文",
        physics: "物理",
        chemistry: "化学",
        geography: "地理",
        biology: "生物",
        history: "历史",
        morality: "道德与法治",
      };
      let editions = await listEditionsFor(grade, labelMap[subjectKey]);
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
    const hit = matchLesson(pack.lessons, q.lessonHint);
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
      createdAt: now,
      updatedAt: now,
    },
  });
  const jobId = add._id;
  await syncBatch(batchId, { jobId, jobStatus: "pending" });
  const ran = await runJob({ jobId });
  return { ok: true, jobId, batchId, status: ran.status || "pending" };
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
    return { ok: true, jobId, status: "done", skipped: true };
  }
  if ((Number(doc.deepseekCalls) || 0) >= 1) {
    return { ok: true, jobId, status: doc.status, skipped: true, reason: "quota_1" };
  }
  await db.collection(JOB_COL).doc(jobId).update({
    data: { deepseekCalls: 1, status: "running", updatedAt: nowIso() },
  });
  await syncBatch(doc.batchId, { jobStatus: "running" });
  const payload = {
    mock: doc.mock === true,
    fileIDs: doc.fileIDs,
    imageUrl: doc.imageUrl,
  };
  let result;
  try {
    result = await processRecognize(payload);
    if (!result.ok && result.error === "missing_deepseek_key") {
      result = await processRecognize({ mock: true });
      result.message = "无模型密钥，已用演示结果";
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
  if (!result.ok) {
    console.error("recognize run fail", patch.error, patch.message, patch.httpStatus, patch.detail);
  }
  await db.collection(JOB_COL).doc(jobId).update({ data: patch });
  await syncBatch(doc.batchId, {
    jobStatus: patch.status,
    questionCount: (patch.questions || []).length,
    jobError: result.ok ? "" : [patch.error, patch.message].filter(Boolean).join(" ").slice(0, 240),
  });
  return { ok: true, jobId, status: patch.status };
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

  const modelName = event.model || DEFAULT_VISION_MODEL;

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
  const prompt = event.prompt || (smoke ? "用一两句话描述这张图片里有什么。" : HOMEWORK_PROMPT);
  const extra = {};
  if (smoke) extra.thinking = { type: "disabled" };
  const result = await generateDeepseek(
    modelName,
    [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageContentParts(imageUrls, smoke ? "low" : "low")],
      },
    ],
    extra
  );
  if (!result.ok) {
    return result;
  }
  if (smoke) {
    return { ...result, questions: [], parseOk: true };
  }

  const parsed = parseQuestions(result.text);
  if (!parsed.parseOk) {
    return {
      ok: false,
      mocked: false,
      error: "parse_failed",
      provider: "deepseek",
      model: modelName,
      message: "模型未返回合法 JSON（需含 questions 数组）",
      preview: String(result.text || "").slice(0, 240),
    };
  }
  let questions = parsed.questions;
  try {
    questions = await enrichQuestions(parsed.questions);
  } catch (e) {
    console.error("enrichQuestions", e);
  }
  return {
    ok: true,
    mocked: false,
    provider: "deepseek",
    model: modelName,
    questions,
    parseOk: true,
    usage: result.usage,
  };
}

exports.main = async (event = {}) => {
  const e = event && typeof event === "object" ? event : {};
  const action = String(e.action || "").trim();
  const { OPENID } = cloud.getWXContext();
  try {
    if (action === "start") return await startJob(e, OPENID);
    if (action === "poll") return await pollJob(e);
    if (action === "run") return await runJob(e);
    return await processRecognize(e);
  } catch (err) {
    console.error("recognizeHomework", err);
    return { ok: false, error: "internal_error", message: String((err && err.message) || err) };
  }
};
