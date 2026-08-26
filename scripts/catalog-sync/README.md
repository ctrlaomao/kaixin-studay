# catalog-sync（F00e）

从国家中小学智慧教育平台「同步课堂」采集 **目录元数据**（标题、层级、platformTag），写入 `data/catalog/` 缓冲 JSON。  
**不下载** 课件、视频、PDF；输出不含 `cover_url`、`relations`、`ti_items` 等媒体字段。

## 数据源（公开 JSON，2026-08 实测可用）

| 步骤 | URL |
| --- | --- |
| 教材清单 | `…/teachingmaterials/version/data_version.json` → `part_*.json` |
| 活动集 id | `…/business_courses/{teachingMaterialId}/course_relative_infos/zh-CN.json` |
| 章/课时树 | `…/activity_sets/{activitySetId}/fulls.json` |

`platformTag` 与浏览器 `defaultTag` 一致，由 `tag_list` 五维（`zxxxd/zxxnj/zxxxk/zxxbb/zxxcc`）拼接；课时级再追加章 `node_id`、课时 `node_id`。

复检 URL 示例（七年级数学人教版上册）：

```
https://basic.smartedu.cn/syncClassroom?defaultTag=e7bbce2c-0590-11ed-9c79-92fc3b3249d5/44bebf7c-54e6-11ed-9c34-850ba61fa9f4/e7bbcf80-0590-11ed-9c79-92fc3b3249d5/ff8080814371757b01437c363a187b0a/ff8080814371757b014390f883db0453
```

对应 `teachingMaterialId`：`921f145d-f79f-4ef4-91ee-4565622c95c6`（初中初一上数学人教版）。

## 运行

需要 **Node.js ≥ 18**（本机可用 `nvm use 22`）。

```bash
cd scripts/catalog-sync

# 预览匹配册次（不写文件）
node sync.mjs --dry-run --max-per-subject 3

# 每科先采 2 册验收
node sync.mjs --max-per-subject 2 --delay 300

# 初中数/理/化/英 全部 ONLINE 册次（约数分钟，请限速）
node sync.mjs --delay 300

# 校验输出是否符合 catalog-tree.schema.json
node validate.mjs ../../data/catalog/tree-math-*.json
```

## 输出

- 路径：`data/catalog/tree-<subject>-<timestamp>.json`
- 结构见 `doc/spec/catalog-schema.md` §6
- `editionId` / `lessonId` = `sha256(platformTag)` 前 32 位 hex

## 抽查

1. 打开上列 `defaultTag` URL，对照章/课时标题与 JSON 中 `chapters[].lessons[]`。
2. 至少 **2 个学科、各 1 个版本** 完整树（F00e 验收底线）。
3. 确认 JSON 中无视频/PDF 链接字段。

导入云库由 F00g `catalogImport` 负责，本脚本 **不** 写云数据库。
