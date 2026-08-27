/**
 * 赤峰家庭教材对照（家长提供）。只采这些学科+版本，年级仅七八九。
 * 英语禁止外研社版。
 */
export const CHIFENG_GRADES = ["七年级", "八年级", "九年级", "初一", "初二", "初三"];

export const CHIFENG_SUBJECTS = [
  "chinese",
  "math",
  "english",
  "morality",
  "history",
  "physics",
  "chemistry",
  "geography",
  "biology",
];

export function subjectKeyFromName(name) {
  const n = String(name || "").trim();
  if (n.includes("数学")) return "math";
  if (n.includes("物理")) return "physics";
  if (n.includes("化学")) return "chemistry";
  if (n === "英语" || n.startsWith("英语")) return "english";
  if (n.includes("语文")) return "chinese";
  if (n.includes("道德与法治") || n.includes("思想政治")) return "morality";
  if (n.includes("历史") && !n.includes("历史与社会")) return "history";
  if (n.includes("地理")) return "geography";
  if (n.includes("生物")) return "biology";
  return null;
}

function pepRenjiao(v) {
  return /人教/.test(v) && !/A版|B版|澳门/.test(v);
}

function pepMinistry(v) {
  return pepRenjiao(v) || /部编/.test(v) || /统编/.test(v);
}

export function versionAllowed(subjectKey, versionLabel) {
  const v = String(versionLabel || "");
  switch (subjectKey) {
    case "math":
    case "physics":
    case "chemistry":
    case "geography":
    case "biology":
      return pepRenjiao(v);
    case "chinese":
    case "morality":
    case "history":
      return pepMinistry(v);
    case "english":
      if (/外研/.test(v)) return false;
      return /仁爱/.test(v) || /科普/.test(v) || /科学普及/.test(v);
    default:
      return false;
  }
}

export function gradeAllowed(gradeLabel) {
  const g = String(gradeLabel || "");
  return CHIFENG_GRADES.some((x) => g === x || g.includes(x));
}

/** 年级+学科+版本+册+新旧各采一条，不再把新旧合成一组。 */
export function groupEditionCandidates(matched) {
  const keyOf = ({ tags }) =>
    [
      tags.subject.tag_name,
      tags.grade.tag_name,
      tags.version.tag_name,
      tags.volume.tag_name,
      tags.textbookKind?.tag_name || "未标注",
    ].join("|");
  const map = new Map();
  for (const row of matched) {
    const k = keyOf(row);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}
