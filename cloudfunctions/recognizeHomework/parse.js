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
  const stem = String(q.stem || q.text || q.question || q.题干 || "").trim();
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
    lessonCandidates,
    confidence,
    isWrong,
  };
}

function parseQuestions(text) {
  if (!text || typeof text !== "string") {
    return { questions: [], parseOk: false };
  }
  const stripped = stripFence(text);
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) {
    return { questions: [], parseOk: false };
  }
  try {
    const obj = JSON.parse(match[0]);
    let list = obj.questions;
    if (typeof list === "string") {
      try {
        list = JSON.parse(list);
      } catch (e) {
        list = null;
      }
    }
    if (!Array.isArray(list)) {
      return { questions: [], parseOk: false, rawCount: 0 };
    }
    const questions = list.map(normalizeQuestion).filter(Boolean);
    return { questions, parseOk: true, rawCount: list.length };
  } catch (e) {
    return { questions: [], parseOk: false };
  }
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

module.exports = { parseQuestions, normalizeQuestion, mockQuestions };
