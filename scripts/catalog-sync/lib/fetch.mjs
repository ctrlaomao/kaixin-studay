const MANIFEST_URL =
  "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/version/data_version.json";

const TAG_DIM = {
  stage: "zxxxd",
  grade: "zxxnj",
  subject: "zxxxk",
  version: "zxxbb",
  volume: "zxxcc",
  textbookKind: "zxxxjjc",
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson(url, { retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, {
      headers: { "user-agent": BROWSER_UA, accept: "application/json,*/*" },
    });
    if (res.ok) {
      return res.json();
    }
    if (res.status === 403 || res.status === 404) {
      const err = new Error(`fetch_failed_${res.status}: ${url}`);
      err.status = res.status;
      throw err;
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
  const textbookKind = tagByDimension(tagList, TAG_DIM.textbookKind) || {
    tag_dimension_id: TAG_DIM.textbookKind,
    tag_id: "unknown",
    tag_name: "未标注",
  };
  if (!stage || !grade || !subject || !version || !volume) return null;
  return { stage, grade, subject, version, volume, textbookKind };
}

import { gradeAllowed, subjectKeyFromName, versionAllowed } from "./policy.mjs";

export { subjectKeyFromName };

export function filterJuniorMaterials(items, subjectKeys) {
  const allowed = new Set(subjectKeys);
  const out = [];
  for (const item of items) {
    if (item.status !== "ONLINE") continue;
    const tags = pickEditionTags(item.tag_list);
    if (!tags) continue;
    if (tags.stage.tag_name !== "初中") continue;
    if (!gradeAllowed(tags.grade.tag_name)) continue;
    const sk = subjectKeyFromName(tags.subject.tag_name);
    if (!sk || !allowed.has(sk)) continue;
    if (!versionAllowed(sk, tags.version.tag_name)) continue;
    out.push({ item, tags });
  }
  return out;
}

export async function fetchActivitySetId(teachingMaterialId, delayMs) {
  const url = `https://s-file-1.ykt.cbern.com.cn/zxx/s_course/v2/business_courses/${teachingMaterialId}/course_relative_infos/zh-CN.json`;
  try {
    const data = await fetchJson(url);
    await sleep(delayMs);
    return data?.course_detail?.activity_set_id || null;
  } catch (e) {
    await sleep(delayMs);
    if (e.status === 403 || e.status === 404) return null;
    throw e;
  }
}

export async function fetchActivityTree(activitySetId, delayMs) {
  const url = `https://s-file-1.ykt.cbern.com.cn/zxx/s_course/v2/activity_sets/${activitySetId}/fulls.json`;
  const data = await fetchJson(url);
  await sleep(delayMs);
  return data;
}

/** 新教材课时清单（旧教材的 course_relative_infos 对该路径 AccessDenied）。 */
export async function fetchNewTextbookLessons(teachingMaterialId, delayMs) {
  const url = `https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/${teachingMaterialId}/resources/part_100.json`;
  try {
    const data = await fetchJson(url);
    await sleep(delayMs);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    await sleep(delayMs);
    if (e.status === 403 || e.status === 404) return [];
    throw e;
  }
}

export function buildDefaultTagUrl(platformTag) {
  const q = encodeURIComponent(platformTag);
  return `https://basic.smartedu.cn/syncClassroom?defaultTag=${q}`;
}
