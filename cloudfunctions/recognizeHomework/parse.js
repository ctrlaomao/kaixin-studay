function stripFence(text) {
  return String(text)
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function normalizeQuestion(q) {
  if (typeof q === "string") {
    const s = q.trim();
    if (!s) return null;
    try {
      q = JSON.parse(s);
    } catch (e) {
      q = { stem: s };
    }
  }
  if (!q || typeof q !== "object") return null;
  const stem = String(
    q.stem || q.text || q.question || q.题干 || q.studentAnswer || q.answer || ""
  ).trim();
  if (!stem) return null;
  const fromList = Array.isArray(q.lessonCandidates)
    ? q.lessonCandidates.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const lessonHint = String(q.lessonHint || q.suggestedLesson || fromList[0] || "").trim();
  const lessonCandidates = lessonHint
    ? [lessonHint, ...fromList.filter((x) => x !== lessonHint)]
    : fromList;
  let confidence = Number(q.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  const grade = String(q.grade || q.gradeLabel || "").trim();
  const volume = String(q.volume || q.volumeLabel || "").trim();
  const subject = String(q.subject || q.subjectLabel || "").trim();
  let isWrong = null;
  if (q.isWrong === true || q.isWrong === "true") isWrong = true;
  if (q.isWrong === false || q.isWrong === "false") isWrong = false;
  const no = Number(q.no || q.number);
  return {
    no: Number.isFinite(no) && no > 0 ? no : undefined,
    stem,
    studentAnswer: String(q.studentAnswer || q.answer || "").trim(),
    blanks: Array.isArray(q.blanks) ? q.blanks.map((x) => String(x)).filter((x) => x.length) : [],
    grade,
    volume,
    subject,
    lessonHint,
    lessonId: String(q.lessonId || "").trim(),
    lessonCandidates,
    confidence,
    isWrong,
  };
}

function sanitizeLessonId(id, closedList) {
  const s = String(id || "").trim();
  if (!s) return "";
  return (closedList || []).some((x) => x && x.lessonId === s) ? s : "";
}

function probeFieldsFromText(text) {
  const grab = (key) => {
    const m = String(text).match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)'));
    return m ? m[1].trim() : "";
  };
  const grade = grab("grade") || grab("gradeLabel");
  let volume = grab("volume") || grab("volumeLabel");
  if (volume === "上") volume = "上册";
  if (volume === "下") volume = "下册";
  const subject = grab("subject") || grab("subjectLabel");
  const hints = [];
  const hm = String(text).match(/"lessonHints"\s*:\s*\[([\s\S]*?)\]/);
  if (hm) {
    const inner = hm[1];
    const re = /"([^"]+)"/g;
    let x;
    while ((x = re.exec(inner))) hints.push(x[1].trim());
  }
  return { grade, volume, subject, lessonHints: hints.filter(Boolean).slice(0, 3) };
}

function parseProbe(text) {
  const empty = { parseOk: false, grade: "", volume: "", subject: "", lessonHints: [] };
  if (!text || typeof text !== "string") return empty;
  const stripped = stripFence(text);
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && typeof obj === "object") {
        const grade = String(obj.grade || obj.gradeLabel || "").trim();
        const volume = String(obj.volume || obj.volumeLabel || "").trim();
        const subject = String(obj.subject || obj.subjectLabel || "").trim();
        let hints = obj.lessonHints;
        if (typeof hints === "string") hints = [hints];
        if (!Array.isArray(hints)) hints = [];
        const lessonHints = hints.map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
        if (grade || volume || subject) {
          return { parseOk: true, grade, volume, subject, lessonHints };
        }
      }
    } catch (e) {
      // 截断 JSON
    }
  }
  const partial = probeFieldsFromText(stripped);
  if (partial.grade || partial.volume || partial.subject) {
    return { parseOk: true, ...partial };
  }
  return empty;
}

function questionsFromObj(obj) {
  if (!obj || typeof obj !== "object") return null;
  let list = obj.questions;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch (e) {
      list = null;
    }
  }
  if (!Array.isArray(list)) return null;
  const questions = list.map(normalizeQuestion).filter(Boolean);
  return { questions, parseOk: true, rawCount: list.length };
}

function extractJsonSlice(str, start) {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return "";
}

function repairJsonBackslashes(s) {
  return String(s).replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

function parseObject(slice) {
  try {
    return JSON.parse(slice);
  } catch (e) {
    try {
      return JSON.parse(repairJsonBackslashes(slice));
    } catch (e2) {
      return null;
    }
  }
}

function unwrapToObject(v, depth) {
  if (depth > 4 || v == null) return v;
  if (typeof v === "string") {
    const inner = parseObject(v.trim());
    if (inner != null && inner !== v) return unwrapToObject(inner, depth + 1);
    return v;
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    if (Array.isArray(v.questions)) return v;
    if (typeof v.content === "string" || (v.content && typeof v.content === "object")) {
      const inner = unwrapToObject(v.content, depth + 1);
      if (inner && typeof inner === "object" && Array.isArray(inner.questions)) return inner;
    }
  }
  return v;
}

function parseQuestions(text) {
  if (!text || typeof text !== "string") {
    return { questions: [], parseOk: false };
  }
  const stripped = stripFence(text);
  const tryHit = (raw) => questionsFromObj(unwrapToObject(raw, 0));
  try {
    const hit = tryHit(parseObject(stripped) || stripped);
    if (hit) return hit;
  } catch (e) {
    // 夹在思维链或 $\sqrt{x}$ 花括号里
  }
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] !== "{") continue;
    const slice = extractJsonSlice(stripped, i);
    if (!slice) continue;
    const hit = tryHit(parseObject(slice) || slice);
    if (hit) return hit;
  }
  return { questions: [], parseOk: false };
}

function mockQuestions() {
  return [
    {
      stem: "（mock）示例题干：计算 3/4 + 1/8",
      grade: "七年级",
      volume: "下册",
      subject: "数学",
      lessonHint: "分数加减法",
      lessonCandidates: ["分数加减法"],
      confidence: 0.2,
      isWrong: true,
    },
  ];
}

module.exports = { parseQuestions, normalizeQuestion, mockQuestions, parseProbe, sanitizeLessonId };
