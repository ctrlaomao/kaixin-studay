const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeQuestion, parseProbe, sanitizeLessonId, parseQuestions } = require("../cloudfunctions/recognizeHomework/parse.js");
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

test("empty stem uses studentAnswer", () => {
  const q = normalizeQuestion({
    no: 1,
    stem: "",
    studentAnswer: "2+3=6",
    subject: "数学",
    isWrong: true,
  });
  assert.equal(q.stem, "2+3=6");
  assert.equal(q.studentAnswer, "2+3=6");
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

test("parseQuestions finds JSON after thinking and latex braces", () => {
  const body =
    '思考 $\\sqrt{x}$ 后输出\n{"pageHint":"","questionCount":1,"questions":[{"no":1,"stem":"已知 $\\sqrt{x}=2$","studentAnswer":"B","isWrong":false}]}';
  const r = parseQuestions(body);
  assert.equal(r.parseOk, true);
  assert.equal(r.questions.length, 1);
  assert.match(r.questions[0].stem, /sqrt/);
});

test("parseQuestions unwraps stringified json", () => {
  const inner = { pageHint: "", questionCount: 1, questions: [{ no: 1, stem: "1+1", studentAnswer: "2" }] };
  const r = parseQuestions(JSON.stringify(JSON.stringify(inner)));
  assert.equal(r.parseOk, true);
  assert.equal(r.questions[0].stem, "1+1");
});

test("parseProbe truncated json still gets grade", () => {
  const r = parseProbe('{"grade":"七年级","volume":"下');
  assert.equal(r.parseOk, true);
  assert.equal(r.grade, "七年级");
  assert.equal(r.volume, "下册");
});

test("parseProbe without questions still ok", () => {
  const r = parseProbe(
    '{"grade":"八年级","volume":"上册","subject":"数学","lessonHints":["实数","二次根式"]}'
  );
  assert.equal(r.parseOk, true);
  assert.equal(r.grade, "八年级");
  assert.equal(r.lessonHints.length, 2);
  assert.equal(r.questions, undefined);
});

test("sanitizeLessonId drops id not in closed list", () => {
  const closed = [{ lessonId: "pep-math-1", lessonLabel: "实数" }];
  assert.equal(sanitizeLessonId("pep-math-1", closed), "pep-math-1");
  assert.equal(sanitizeLessonId("other", closed), "");
  assert.equal(sanitizeLessonId("pep-math-1", []), "");
});
