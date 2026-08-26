# 同步课堂目录数据模型（F00d）

> 权威来源：国家中小学智慧教育平台「同步课堂」公开筛选树与课时标题。  
> 线上真源：云数据库 `catalog_edition`、`catalog_lesson`（见 ADR-004）。  
> 本地 `data/catalog/*.json` 仅为采集缓冲，导入后不以之为真源。

## 1. 层级与展示顺序

与平台 P14 / P13 一致，**固定顺序**（不得自创层级名）：

```
学段 → 年级 → 学科 → 版本 → 册次 → 章 → 课时
```

| 层级 | 字段前缀 | 说明 |
| --- | --- | --- |
| 学段 | `stage` | 如「初中」 |
| 年级 | `grade` | 如「七年级」 |
| 学科 | `subject` | 如「数学」「物理」「化学」「英语」 |
| 版本 | `version` | 平台教材版本名（如「人教版」） |
| 册次 | `volume` | 如「上册」「下册」「全一册」 |
| 章 | `chapter` | 章标题；仅出现在课时记录上 |
| 课时 | `lesson` | **打星、错题绑定、组卷、遗漏窗口的唯一知识点粒度** |

一期采集范围：初中 **数学 / 物理 / 化学 / 英语**，仅平台 **已上线** 的版本与册。

## 2. platformTag

平台 URL 参数 `defaultTag` 为 **斜杠分隔的筛选 id 路径**（UUID 或平台内部 id，末段可为数字 id）。

示例（来自产品设计，用于人工复检）：

```
e7bbce2c-0590-11ed-9c79-92fc3b3249d5/
44bebf7c-54e6-11ed-9c34-850ba61fa9f4/
e7bbcf80-0590-11ed-9c79-92fc3b3249d5/
ff8080814371757b01437c363a187b0a/
ff8080814371757b014390f883db0453/
5136342961
```

### 2.1 字段约定

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `platformTag` | string | 规范化路径：`tagId` 用 `/` 连接，**无首尾斜杠**，与 `defaultTag` 解码后一致 |
| `platformTagPath` | array | 可选；结构化路径，便于采集脚本与调试 |

`platformTagPath` 元素：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `level` | string | 是 | 枚举见下表 |
| `tagId` | string | 是 | 平台该层筛选 id |
| `label` | string | 否 | 采集时的展示名，便于对照平台 UI |

`level` 枚举（与顺序一致）：

`stage` | `grade` | `subject` | `version` | `volume` | `chapter` | `lesson`

### 2.2 各层 platformTag 深度

| 记录类型 | `platformTag` 应覆盖到 |
| --- | --- |
| `catalog_edition` | 学段 → 年级 → 学科 → 版本 → **册次**（5 段，不含章、课时） |
| `catalog_lesson` | 学段 → … → 册次 → **章 → 课时**（完整 7 段） |

采集脚本若只能拿到章、课时的 id，须在写入前拼出完整 `platformTag`；`catalogImport` upsert 时以 `platformTag` + 业务 id 做幂等键。

## 3. 稳定业务 id

云库 `_id` 与业务引用字段分离，避免平台改文案导致关联断裂。

| 概念 | 字段 | 生成规则 |
| --- | --- | --- |
| 版本+册 | `editionId` | `sha256(platformTag_edition)` 前 32 位 hex，或 `ed_` + 同上；**同一 platformTag（至册）唯一** |
| 课时 | `lessonId` | `sha256(platformTag_lesson)` 前 32 位 hex，或 `ls_` + 同上；**打星 / wrong_item / mastery 均引用此字段** |

规则要求：

- `editionId`、`lessonId` 仅由 **至册 / 至课时的 platformTag** 推导，**不**把 `label` 拼进 id。
- 平台标题变更只更新 `*Label` 字段，id 不变则掌握度不丢。
- 换教材版本 = 换 `editionId` 集合；掌握度 **不跨版本迁移**（ADR-001）。

## 4. 云集合 `catalog_edition`

**粒度：** 一个「版本 + 册次」一条（同年级同学科下多册各一条）。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | string | 是 | 等于 `editionId` |
| `editionId` | string | 是 | 同 `_id` |
| `stageId` | string | 是 | 平台学段 tagId |
| `stageLabel` | string | 是 | 学段展示名 |
| `gradeId` | string | 是 | 平台年级 tagId |
| `gradeLabel` | string | 是 | 年级展示名 |
| `subjectId` | string | 是 | 平台学科 tagId |
| `subjectLabel` | string | 是 | 学科展示名 |
| `versionId` | string | 是 | 平台版本 tagId |
| `versionLabel` | string | 是 | 版本展示名 |
| `volumeId` | string | 是 | 平台册次 tagId |
| `volumeLabel` | string | 是 | 册次展示名 |
| `platformTag` | string | 是 | 至册次的 tag 路径 |
| `platformTagPath` | array | 否 | 见 §2.1，至多 5 层 |
| `online` | boolean | 是 | 平台是否已上线；`false` 时 P13/P14 不展示 |
| `syncAt` | Date / ISO string | 是 | 本条最后同步时间 |
| `sourceUrl` | string | 否 | 采集复检用同步课堂 URL（含 defaultTag） |

**禁止字段：** 课件、视频、PDF、`fileUrl`、`resourceId`（可播放/可下载的资源 id）等任何媒体或正文引用。

## 5. 云集合 `catalog_lesson`

**粒度：** 一个课时一条。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | string | 是 | 等于 `lessonId` |
| `lessonId` | string | 是 | 同 `_id`；**业务外键统一用此字段** |
| `editionId` | string | 是 | 所属 `catalog_edition.editionId` |
| `chapterId` | string | 是 | 平台章 tagId（无独立 id 时采集脚本生成稳定 id 并记入 `platformTagPath`） |
| `chapterLabel` | string | 是 | 章标题 |
| `chapterOrder` | number | 是 | 章排序，从 1 或 0 起，同一 edition 内单调 |
| `lessonLabel` | string | 是 | 课时标题 |
| `lessonOrder` | number | 是 | 课时在章内排序 |
| `sortKey` | string | 否 | 全局排序键，如 `chapterOrder` 补零 + `lessonOrder`，供列表默认排序 |
| `platformTag` | string | 是 | 至课时的完整路径（含章、课时） |
| `platformTagPath` | array | 否 | 见 §2.1，7 层 |
| `syncAt` | Date / ISO string | 是 | 本条最后同步时间 |
| `sourceUrl` | string | 否 | 复检 URL |

**禁止字段：** 同 `catalog_edition`。

### 与 child 的关联

- `child.textbookBySubject[subjectCode]` 存 `editionId`（或等价结构，见 F02A）。
- `child.progressChapter` 存当前进度 **章**（`chapterId` 或 `chapterLabel`，F02A 锁定一种）。
- `wrong_item.lessonId`、`mastery.lessonId` 必须为 `catalog_lesson.lessonId`。

## 6. 采集缓冲 JSON（F00e 产出）

路径建议：`data/catalog/tree-<subject>-<timestamp>.json`（非真源，仅供 `catalogImport` 读取）。

根对象：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 固定 `1` |
| `syncAt` | string | ISO 8601 |
| `source` | string | 如 `smartedu-syncClassroom` |
| `sourceUrl` | string | 可选，采集入口 URL |
| `editions` | array | 见下 |

`editions[]` 元素 = `catalog_edition` 字段子集 + 嵌套 `chapters`：

```json
{
  "editionId": "…",
  "stageId": "…",
  "stageLabel": "初中",
  "gradeId": "…",
  "gradeLabel": "七年级",
  "subjectId": "…",
  "subjectLabel": "数学",
  "versionId": "…",
  "versionLabel": "人教版",
  "volumeId": "…",
  "volumeLabel": "上册",
  "platformTag": "uuid/…/volumeTagId",
  "platformTagPath": [ { "level": "stage", "tagId": "…", "label": "初中" } ],
  "online": true,
  "sourceUrl": "https://basic.smartedu.cn/syncClassroom?defaultTag=…",
  "chapters": [
    {
      "chapterId": "…",
      "chapterLabel": "第一章 …",
      "chapterOrder": 1,
      "lessons": [
        {
          "lessonId": "…",
          "lessonLabel": "1.1 …",
          "lessonOrder": 1,
          "platformTag": "uuid/…/lessonTagId",
          "platformTagPath": [ … ]
        }
      ]
    }
  ]
}
```

缓冲树 **不得** 包含 `images`、`video`、`pdf`、`resourceBody` 等字段。JSON Schema 见同目录 `catalog-tree.schema.json`。

## 7. `catalog_sync_log`（F00g 写入，本卡仅定义字段）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `batchId` | string | 一次导入批次 id |
| `startedAt` | Date | 开始时间 |
| `finishedAt` | Date | 结束时间 |
| `editionUpserted` | number | 写入/更新 edition 条数 |
| `lessonUpserted` | number | 写入/更新 lesson 条数 |
| `sourceFile` | string | 可选，缓冲文件名 |
| `ok` | boolean | 是否成功 |
| `error` | string | 失败时错误码或摘要 |
| `operator` | string | 可选，导入触发者 openid |

## 8. 验收对照（F00d）

- [x] 文档定义 `platformTag` 及与 `defaultTag` 的关系  
- [x] 字段能表达平台 7 层筛选，且 **打星绑定 `lessonId`**  
- [x] edition / lesson 云集合字段与缓冲 JSON 对齐  
- [x] 明确禁止课件/视频/PDF 字段  
- [x] 提供 JSON Schema 供 F00e / F00g 校验  

## 9. 相关文档

- `doc/spec/ADR-001-知识点以同步课堂课时为准.md`
- `doc/spec/ADR-004-同步课堂目录采集.md`
- `doc/spec/api.md`（集合名与规划路径）
- `doc/spec/catalog-tree.schema.json`
