import { createHash } from "node:crypto";
import { buildDefaultTagUrl } from "./fetch.mjs";

export function shaId(platformTag) {
  return createHash("sha256").update(platformTag, "utf8").digest("hex").slice(0, 32);
}

export function joinPlatformTag(...ids) {
  return ids.filter(Boolean).join("/");
}

export function platformTagPathFromEdition(tags) {
  const levels = ["stage", "grade", "subject", "version", "volume"];
  const keys = ["stage", "grade", "subject", "version", "volume"];
  return keys.map((k, i) => ({
    level: levels[i],
    tagId: tags[k].tag_id,
    label: tags[k].tag_name,
  }));
}

export function normalizeTree(material, tags, fulls, syncAt) {
  const editionPlatformTag = joinPlatformTag(
    tags.stage.tag_id,
    tags.grade.tag_id,
    tags.subject.tag_id,
    tags.version.tag_id,
    tags.volume.tag_id
  );
  const editionId = shaId(editionPlatformTag);
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
    platformTag: editionPlatformTag,
    platformTagPath: editionPlatformTagPath,
    online: true,
    sourceUrl: buildDefaultTagUrl(editionPlatformTag),
    chapters,
    _teachingMaterialId: material.id,
    _title: material.title,
  };
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
  if (n.includes("英语")) return "english";
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
