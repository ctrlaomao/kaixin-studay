import { createHash } from "node:crypto";
import { buildDefaultTagUrl } from "./fetch.mjs";

export function shaId(platformTag) {
  return createHash("sha256").update(platformTag, "utf8").digest("hex").slice(0, 32);
}

export function joinPlatformTag(...ids) {
  return ids.filter(Boolean).join("/");
}

export function platformTagPathFromEdition(tags) {
  const keys = ["stage", "grade", "subject", "version", "volume", "textbookKind"];
  return keys
    .filter((k) => tags[k])
    .map((k) => ({
      level: k,
      tagId: tags[k].tag_id,
      label: tags[k].tag_name,
    }));
}

function editionTagParts(tags) {
  return [
    tags.stage.tag_id,
    tags.grade.tag_id,
    tags.subject.tag_id,
    tags.version.tag_id,
    tags.volume.tag_id,
    tags.textbookKind?.tag_id,
  ];
}

function editionShell(material, tags, chapters, syncAt) {
  const editionPlatformTag = joinPlatformTag(...editionTagParts(tags));
  const editionId = shaId(editionPlatformTag);
  const editionPlatformTagPath = platformTagPathFromEdition(tags);
  return {
    editionId,
    stageId: tags.stage.tag_id,
    stageLabel: tags.stage.tag_name,
    gradeId: tags.grade.tag_id,
    gradeLabel: tags.grade.tag_name,
    subjectId: tags.subject.tag_id,
    subjectLabel: tags.subject.tag_name,
    versionId: tags.version.tag_id,
    versionLabel: tags.version.tag_name,
    volumeId: tags.volume.tag_id,
    volumeLabel: tags.volume.tag_name,
    textbookKindId: tags.textbookKind?.tag_id || "",
    textbookKindLabel: tags.textbookKind?.tag_name || "未标注",
    platformTag: editionPlatformTag,
    platformTagPath: editionPlatformTagPath,
    online: true,
    sourceUrl: buildDefaultTagUrl(editionPlatformTag),
    chapters,
    _teachingMaterialId: material.id,
    _title: material.title,
  };
}

function chineseOrdinal(n) {
  const d = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n <= 0) return String(n);
  if (n < 10) return d[n];
  if (n === 10) return "十";
  if (n < 20) return `十${d[n - 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${d[tens]}十${ones ? d[ones] : ""}`;
  }
  return String(n);
}

export function normalizeTree(material, tags, fulls, syncAt) {
  const editionPlatformTag = joinPlatformTag(...editionTagParts(tags));
  const editionPlatformTagPath = platformTagPathFromEdition(tags);

  const chapters = [];
  const nodes = fulls?.nodes || [];
  for (const ch of nodes) {
    if (ch.node_type !== "catalog") continue;
    const chapterOrder = Number(ch.order_no) || chapters.length + 1;
    const lessons = [];
    for (const ln of ch.child_nodes || []) {
      if (ln.node_type !== "activity") continue;
      const lessonOrder = Number(ln.order_no) || lessons.length + 1;
      const lessonPlatformTag = joinPlatformTag(
        editionPlatformTag,
        ch.node_id,
        ln.node_id
      );
      const lessonId = shaId(lessonPlatformTag);
      lessons.push({
        lessonId,
        lessonLabel: String(ln.node_name || "").trim(),
        lessonOrder,
        platformTag: lessonPlatformTag,
        platformTagPath: [
          ...editionPlatformTagPath,
          { level: "chapter", tagId: ch.node_id, label: ch.node_name },
          { level: "lesson", tagId: ln.node_id, label: ln.node_name },
        ],
        sortKey: `${String(chapterOrder).padStart(3, "0")}_${String(lessonOrder).padStart(3, "0")}`,
      });
    }
    if (lessons.length === 0) continue;
    chapters.push({
      chapterId: ch.node_id,
      chapterLabel: String(ch.node_name || "").trim(),
      chapterOrder,
      lessons,
    });
  }

  if (chapters.length === 0) {
    return null;
  }

  return editionShell(material, tags, chapters, syncAt);
}

/** 新教材：part_100 课时列表，按 chapter_ids[0] 归为单元（平台未公开单元中文名时用第N单元）。 */
export function normalizeNewTextbookTree(material, tags, resources, syncAt) {
  const editionPlatformTag = joinPlatformTag(...editionTagParts(tags));
  const editionPlatformTagPath = platformTagPathFromEdition(tags);
  const grouped = new Map();
  for (const r of resources || []) {
    if (r.status && r.status !== "ONLINE") continue;
    const unitId = (r.chapter_ids && r.chapter_ids[0]) || r.id;
    if (!grouped.has(unitId)) grouped.set(unitId, []);
    grouped.get(unitId).push(r);
  }

  const chapters = [];
  let chapterOrder = 0;
  for (const [unitId, items] of grouped) {
    chapterOrder += 1;
    const chapterLabel = `第${chineseOrdinal(chapterOrder)}单元`;
    const lessons = [];
    items.forEach((r, i) => {
      const lessonNodeId = (r.chapter_ids && r.chapter_ids[r.chapter_ids.length - 1]) || r.id;
      const lessonLabel = String(r.title || "").replace(/^\[课程包\]\s*/, "").trim();
      const lessonOrder = i + 1;
      const lessonPlatformTag = joinPlatformTag(editionPlatformTag, unitId, lessonNodeId);
      lessons.push({
        lessonId: shaId(lessonPlatformTag),
        lessonLabel,
        lessonOrder,
        platformTag: lessonPlatformTag,
        platformTagPath: [
          ...editionPlatformTagPath,
          { level: "chapter", tagId: unitId, label: chapterLabel },
          { level: "lesson", tagId: lessonNodeId, label: lessonLabel },
        ],
        sortKey: `${String(chapterOrder).padStart(3, "0")}_${String(lessonOrder).padStart(3, "0")}`,
      });
    });
    if (lessons.length === 0) continue;
    chapters.push({
      chapterId: unitId,
      chapterLabel,
      chapterOrder,
      lessons,
    });
  }

  if (chapters.length === 0) return null;
  return editionShell(material, tags, chapters, syncAt);
}

export function groupBySubject(editions) {
  const map = new Map();
  for (const ed of editions) {
    const sk = subjectKeyFromLabel(ed.subjectLabel);
    if (!map.has(sk)) map.set(sk, []);
    map.get(sk).push(ed);
  }
  return map;
}

function subjectKeyFromLabel(label) {
  const n = String(label || "");
  if (n.includes("数学")) return "math";
  if (n.includes("物理")) return "physics";
  if (n.includes("化学")) return "chemistry";
  if (n === "英语" || n.startsWith("英语")) return "english";
  if (n.includes("语文")) return "chinese";
  if (n.includes("道德与法治") || n.includes("思想政治")) return "morality";
  if (n.includes("历史")) return "history";
  if (n.includes("地理")) return "geography";
  if (n.includes("生物")) return "biology";
  return "other";
}

export function toBufferFile(editions, syncAt) {
  const clean = editions.map((ed) => {
    const { _teachingMaterialId, _title, ...rest } = ed;
    return rest;
  });
  return {
    schemaVersion: 1,
    syncAt,
    source: "smartedu-syncClassroom",
    editions: clean,
  };
}
