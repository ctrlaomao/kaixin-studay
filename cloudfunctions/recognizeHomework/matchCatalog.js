function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeGrade(raw) {
  const s = trimStr(raw);
  if (/九年级|初三/.test(s)) return "九年级";
  if (/八年级|初二/.test(s)) return "八年级";
  if (/七年级|初一/.test(s)) return "七年级";
  return s;
}

function normalizeVolume(raw) {
  const s = trimStr(raw);
  if (/下/.test(s)) return "下册";
  if (/上/.test(s)) return "上册";
  if (/全/.test(s)) return "全一册";
  return s;
}

function subjectKeyFromLabel(name) {
  const n = trimStr(name);
  if (!n) return "";
  if (n.includes("数学")) return "math";
  if (n.includes("物理")) return "physics";
  if (n.includes("化学")) return "chemistry";
  if (n === "英语" || n.startsWith("英语")) return "english";
  if (n.includes("语文")) return "chinese";
  if (n.includes("道德与法治") || n.includes("思想政治")) return "morality";
  if (n.includes("历史") && !n.includes("历史与社会")) return "history";
  if (n.includes("地理")) return "geography";
  if (n.includes("生物")) return "biology";
  return "";
}

function subjectLabelFromKey(key) {
  const map = {
    math: "数学",
    chinese: "语文",
    english: "英语",
    morality: "道德与法治",
    history: "历史",
    physics: "物理",
    chemistry: "化学",
    geography: "地理",
    biology: "生物",
  };
  return map[key] || "";
}

function isPepVersion(v) {
  const s = String(v || "");
  if (/外研|澳门/.test(s)) return false;
  if (/人教/.test(s) && !/A版|B版/.test(s)) return true;
  if (/统编|部编/.test(s)) return true;
  return false;
}

function kindRank(k) {
  const s = String(k || "");
  if (/新教材/.test(s)) return 0;
  if (/旧教材/.test(s)) return 1;
  return 2;
}

function volumeMatch(editionVol, want) {
  if (!want) return true;
  return String(editionVol || "").includes(want) || want.includes(String(editionVol || ""));
}

function pickEdition(editions, { grade, volume, subjectKey }) {
  const gradeN = normalizeGrade(grade);
  const volN = normalizeVolume(volume);
  const wantLabel = subjectLabelFromKey(subjectKey);
  const pep = (editions || []).filter((ed) => {
    if (ed && ed.online === false) return false;
    if (!isPepVersion(ed.versionLabel)) return false;
    if (gradeN && trimStr(ed.gradeLabel) !== gradeN && !trimStr(ed.gradeLabel).includes(gradeN)) {
      return false;
    }
    if (wantLabel) {
      const lab = trimStr(ed.subjectLabel);
      if (subjectKey === "morality") {
        if (!(lab.includes("道德与法治") || lab.includes("思想政治"))) return false;
      } else if (lab !== wantLabel && !lab.includes(wantLabel)) {
        return false;
      }
    }
    if (volN && !volumeMatch(ed.volumeLabel, volN)) return false;
    return true;
  });
  pep.sort((a, b) => kindRank(a.textbookKindLabel) - kindRank(b.textbookKindLabel));
  return pep[0] || null;
}

function scoreLesson(lesson, hint) {
  const h = trimStr(hint);
  if (!h) return 0;
  const label = trimStr(lesson && lesson.lessonLabel);
  const chap = trimStr(lesson && lesson.chapterLabel);
  if (!label) return 0;
  if (label === h) return 100;
  if (label.includes(h) || h.includes(label)) return 80;
  if (chap && (chap.includes(h) || h.includes(chap))) return 50;
  const parts = h.split(/[\s、，,]+/).filter((x) => x.length >= 2);
  let n = 0;
  for (const p of parts) {
    if (label.includes(p) || chap.includes(p)) n += 10;
  }
  return n;
}

function matchLesson(lessons, hint) {
  let best = null;
  let bestScore = 0;
  for (const lesson of lessons || []) {
    const s = scoreLesson(lesson, hint);
    if (s > bestScore) {
      bestScore = s;
      best = lesson;
    }
  }
  if (!best || bestScore < 10) return { lesson: null, score: bestScore };
  return { lesson: best, score: bestScore };
}

function attachMatch(q, edition, lessonHit) {
  const subjectKey = q.subjectKey || subjectKeyFromLabel(q.subject);
  const english = subjectKey === "english";
  const needConfirm =
    Number(q.confidence) < 0.7 ||
    !q.grade ||
    !q.volume ||
    !subjectKey ||
    (!english && !(lessonHit && lessonHit.lesson));
  const lesson = lessonHit && lessonHit.lesson;
  return {
    ...q,
    subjectKey,
    editionId: (edition && (edition.editionId || edition._id)) || "",
    lessonId: (lesson && (lesson.lessonId || lesson._id)) || "",
    lessonLabel: (lesson && lesson.lessonLabel) || q.lessonHint || "",
    chapterLabel: (lesson && lesson.chapterLabel) || "",
    matchScore: (lessonHit && lessonHit.score) || 0,
    needConfirm: !!needConfirm,
  };
}

module.exports = {
  normalizeGrade,
  normalizeVolume,
  subjectKeyFromLabel,
  pickEdition,
  matchLesson,
  attachMatch,
  isPepVersion,
};
