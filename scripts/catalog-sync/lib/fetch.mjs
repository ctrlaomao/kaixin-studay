const MANIFEST_URL =
  "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/version/data_version.json";

const TAG_DIM = {
  stage: "zxxxd",
  grade: "zxxnj",
  subject: "zxxxk",
  version: "zxxbb",
  volume: "zxxcc",
};

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson(url, { retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, {
      headers: { "user-agent": "kaixin-catalog-sync/1.0 (metadata only)" },
    });
    if (res.ok) {
      return res.json();
    }
    if (i < retries) await sleep(500 * (i + 1));
  }
  throw new Error(`fetch_failed: ${url}`);
}

export async function loadAllTeachingMaterials() {
  const manifest = await fetchJson(MANIFEST_URL);
  const items = [];
  for (const partUrl of manifest.urls || []) {
    const part = await fetchJson(partUrl);
    if (Array.isArray(part)) items.push(...part);
  }
  return items;
}

export function tagByDimension(tagList, dimensionId) {
  return (tagList || []).find((t) => t.tag_dimension_id === dimensionId);
}

export function pickEditionTags(tagList) {
  const stage = tagByDimension(tagList, TAG_DIM.stage);
  const grade = tagByDimension(tagList, TAG_DIM.grade);
  const subject = tagByDimension(tagList, TAG_DIM.subject);
  const version = tagByDimension(tagList, TAG_DIM.version);
  const volume = tagByDimension(tagList, TAG_DIM.volume);
  if (!stage || !grade || !subject || !version || !volume) return null;
  return { stage, grade, subject, version, volume };
}

export function subjectKeyFromName(name) {
  const n = String(name || "");
  if (n.includes("数学")) return "math";
  if (n.includes("物理")) return "physics";
  if (n.includes("化学")) return "chemistry";
  if (n === "英语" || n.startsWith("英语")) return "english";
  return null;
}

export function filterJuniorMaterials(items, subjectKeys) {
  const allowed = new Set(subjectKeys);
  const out = [];
  for (const item of items) {
    if (item.status !== "ONLINE") continue;
    const tags = pickEditionTags(item.tag_list);
    if (!tags) continue;
    if (tags.stage.tag_name !== "初中") continue;
    const sk = subjectKeyFromName(tags.subject.tag_name);
    if (!sk || !allowed.has(sk)) continue;
    out.push({ item, tags });
  }
  return out;
}

export async function fetchActivitySetId(teachingMaterialId, delayMs) {
  const url = `https://s-file-1.ykt.cbern.com.cn/zxx/s_course/v2/business_courses/${teachingMaterialId}/course_relative_infos/zh-CN.json`;
  const data = await fetchJson(url);
  await sleep(delayMs);
  return data?.course_detail?.activity_set_id || null;
}

export async function fetchActivityTree(activitySetId, delayMs) {
  const url = `https://s-file-1.ykt.cbern.com.cn/zxx/s_course/v2/activity_sets/${activitySetId}/fulls.json`;
  const data = await fetchJson(url);
  await sleep(delayMs);
  return data;
}

export function buildDefaultTagUrl(platformTag) {
  const q = encodeURIComponent(platformTag);
  return `https://basic.smartedu.cn/syncClassroom?defaultTag=${q}`;
}
