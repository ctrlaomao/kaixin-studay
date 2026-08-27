const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseQuestions, normalizeQuestion } = require("../cloudfunctions/recognizeHomework/parse.js");
const { pickEdition, matchLesson, attachMatch, normalizeGrade } = require("../cloudfunctions/recognizeHomework/matchCatalog.js");

test("parse grade volume subject", () => {
  const q = normalizeQuestion({
    stem: "1+1",
    grade: "七年级",
    volume: "下册",
    subject: "数学",
    lessonHint: "有理数",
    confidence: 0.9,
    isWrong: true,
  });
  assert.equal(q.grade, "七年级");
  assert.equal(q.subject, "数学");
});

test("parseQuestions json", () => {
  const r = parseQuestions('{"questions":[{"stem":"题","grade":"八年级","volume":"上册","subject":"物理","confidence":0.8}]}');
  assert.equal(r.parseOk, true);
  assert.equal(r.questions[0].grade, "八年级");
});

test("normalizeGrade 初一", () => {
  assert.equal(normalizeGrade("初一"), "七年级");
});

test("pick pep new textbook", () => {
  const ed = pickEdition(
    [
      {
        versionLabel: "人教版",
        gradeLabel: "七年级",
        subjectLabel: "数学",
        volumeLabel: "下册",
        textbookKindLabel: "旧教材",
        editionId: "old",
      },
      {
        versionLabel: "人教版",
        gradeLabel: "七年级",
        subjectLabel: "数学",
        volumeLabel: "下册",
        textbookKindLabel: "新教材",
        editionId: "new",
      },
    ],
    { grade: "七年级", volume: "下册", subjectKey: "math" }
  );
  assert.equal(ed.editionId, "new");
});

test("matchLesson by label", () => {
  const hit = matchLesson(
    [{ lessonId: "a", lessonLabel: "有理数加减", chapterLabel: "有理数" }],
    "有理数加减"
  );
  assert.equal(hit.lesson.lessonId, "a");
});

test("english skip lesson still ok confirm if high conf", () => {
  const q = attachMatch(
    { stem: "hi", grade: "七年级", volume: "下册", subject: "英语", subjectKey: "english", confidence: 0.9 },
    null,
    null
  );
  assert.equal(q.needConfirm, false);
});
