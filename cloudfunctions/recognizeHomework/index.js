const cloud = require("wx-server-sdk");
const https = require("https");
const { URL } = require("url");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  timeout: 60000,
});

const DEFAULT_VISION_MODEL = "deepseek-v4-flash-vision-exp";
const DEFAULT_TEXT_MODEL = "hy3";
const DEEPSEEK_BASE = "https://api.deepseek.com";
const MAX_BASE64_CHARS = 7 * 1024 * 1024;

const HOMEWORK_PROMPT = `你是家庭作业错题识别助手。只根据图片作答。
用 JSON 返回，不要 markdown 围栏，不要其它说明。格式：
{"questions":[{"stem":"题干原文或转写","isWrong":true,"lessonCandidates":["可能对应的课时名"],"confidence":0.0}]}
isWrong：图中该题是否像错题。confidence 为 0 到 1。
看不清就降低 confidence，不要编造不存在的题。`;

function mockQuestions() {
  return [
    {
      stem: "（mock）示例题干",
      isWrong: true,
      lessonCandidates: ["未绑定课时"],
      confidence: 0.2,
    },
  ];
}

function asDataUrl(base64, mime) {
  const raw = String(base64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  if (raw.length > MAX_BASE64_CHARS) {
    throw Object.assign(new Error("image_too_large"), { code: "image_too_large" });
  }
  return `data:${mime || "image/jpeg"};base64,${raw}`;
}

async function resolveImageUrl(event) {
  if (event.imageUrl) {
    return String(event.imageUrl);
  }
  if (event.imageBase64) {
    return asDataUrl(event.imageBase64, event.mime);
  }
  if (event.fileID) {
    const dl = await cloud.downloadFile({ fileID: event.fileID });
    const buf = dl.fileContent;
    const b64 = Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");
    return asDataUrl(b64, event.mime || "image/jpeg");
  }
  return null;
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
  return {
    message: err && err.message ? String(err.message) : "ai_failed",
    httpStatus: status,
    detail: detail || undefined,
  };
}

function parseQuestions(text) {
  if (!text || typeof text !== "string") {
    return { questions: [], parseOk: false };
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { questions: [], parseOk: false };
  }
  try {
    const obj = JSON.parse(match[0]);
    const list = Array.isArray(obj.questions) ? obj.questions : [];
    return { questions: list, parseOk: true };
  } catch (e) {
    return { questions: [], parseOk: false };
  }
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

exports.main = async (event = {}) => {
  if (event.mock === true) {
    return {
      ok: true,
      mocked: true,
      model: event.model || DEFAULT_VISION_MODEL,
      questions: mockQuestions(),
    };
  }

  if (event.textSmoke === true) {
    const modelName = event.model || DEFAULT_TEXT_MODEL;
    const prompt = event.prompt || "只回复两个字：正常";
    return generate(modelName, [{ role: "user", content: prompt }]);
  }

  const modelName = event.model || DEFAULT_VISION_MODEL;

  let imageUrl;
  try {
    imageUrl = await resolveImageUrl(event);
  } catch (e) {
    return { ok: false, error: e.code || "image_error", message: e.message };
  }
  if (!imageUrl) {
    return { ok: false, error: "need_image" };
  }

  const prompt = event.prompt || (event.smoke ? "用一两句话描述这张图片里有什么。" : HOMEWORK_PROMPT);
  const extra = {};
  if (event.smoke) {
    extra.thinking = { type: "disabled" };
  }
  const result = await generateDeepseek(
    modelName,
    [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: event.smoke ? "low" : "original" },
          },
        ],
      },
    ],
    extra
  );
  if (!result.ok || event.smoke) {
    return result.ok
      ? { ...result, questions: [], parseOk: true }
      : result;
  }
  const parsed = parseQuestions(result.text);
  return { ...result, questions: parsed.questions, parseOk: parsed.parseOk };
};
