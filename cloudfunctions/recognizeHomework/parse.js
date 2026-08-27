function stripFence(text) {
  return String(text)
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function normalizeQuestion(q) {
  if (!q || typeof q !== "object") return null;
  const stem = String(q.stem || q.text || q.question || "").trim();
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
  return {
    stem,
    grade,
    volume,
    subject,
    lessonHint,
    lessonCandidates,
    confidence,
    isWrong: q.isWrong !== false,
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
    const list = Array.isArray(obj.questions) ? obj.questions : null;
    if (!list) {
      return { questions: [], parseOk: false };
    }
    const questions = list.map(normalizeQuestion).filter(Boolean);
    return { questions, parseOk: true };
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
