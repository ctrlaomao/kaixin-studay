# childProfile（F01A / F02A）

孩子档案：同一 `familyId` 可多条 `child`。显示名、年级；分科教材版本与进度章。家庭邀请码见 F03A。

## action

| action | 入参 | 成功返回 |
| --- | --- | --- |
| `ensureSolo` | 无 | `{ ok, child, created }` 当前微信一条默认孩子，不填名年级 |
| `list` | 可选 `familyId` | `{ ok, familyId, children }` |
| `update` | `childId`（或 `id`）、可选 `displayName` / `grade`；可选 `familyId` | `{ ok, child }` |
| `setTextbook` | `childId`、`subjectKey`、`editionId`；可选 `familyId` | `{ ok, childId, subjectKey, textbook, textbookBySubject }` |
| `setProgress` | `childId`、`subjectKey`、`chapterId`、`chapterLabel`；可选 `familyId` | `{ ok, childId, subjectKey, progress, progressChapter }` |
| `getTextbooks` | `childId`；可选 `familyId` | `{ ok, childId, textbookBySubject, progressChapter }` |

`grade` 仅：`七年级` / `八年级` / `九年级`。

鉴权：`cloud.getWXContext().OPENID`。无 OPENID 返回 `openid_missing`。

## 临时 familyId（F03A 会替换）

尚无 `family` 集合时：

- 若 `event.familyId` 非空，写入该值。
- 否则 `child.familyId = "tmp:" + OPENID`（openid 临时家庭）。
- `create` 在走占位时 `familyIdPlaceholder: true`。

F03A 建正式家庭后，应把 `tmp:OPENID` 换成真实 `family._id`。本期不实现邀请码。

`list` / `update` 用同一套 `familyId` 解析。`update` 时文档 `familyId` 必须与解析结果一致，否则 `family_mismatch`。本期不做成员表校验（F03A）。

## 集合 `child`

字段：`familyId`、`displayName`、`grade`、`textbookBySubject`、`progressChapter`、`createdByOpenid`、`createdAt`、`updatedAt`。

`subjectKey` 仅：`math` / `chinese` / `english` / `morality` / `history` / `physics` / `chemistry` / `geography` / `biology`。

`setTextbook` 的 `editionId` 必须在 `catalog_edition` 能查到，且册的 `subjectLabel` 与 `subjectKey` 对应（如 `math` → 数学）。选项列表用 `catalogRead.listEditions`。

`progressChapter[subjectKey] = { chapterId, chapterLabel }`（两字段都存）。

集合不存在时函数会 `createCollection("child")`。权限应对客户端只读拒绝，仅云函数写。

## 部署

对 `cloudfunctions/childProfile` 右键 → **上传并部署：云端安装依赖**。`config.json` timeout 10s。

## 云端测试 JSON

控制台云端测试可能没有真实 OPENID，会返回 `openid_missing`。有 OPENID 后用下面 JSON。

**新增（走临时家庭）：**

```json
{
  "action": "create",
  "displayName": "大宝",
  "grade": "七年级"
}
```

**再增一名（同一临时家庭）：**

```json
{
  "action": "create",
  "displayName": "二宝",
  "grade": "八年级"
}
```

**指定 familyId 新增：**

```json
{
  "action": "create",
  "familyId": "fam_demo_001",
  "displayName": "大宝",
  "grade": "七年级"
}
```

**列出（省略 familyId 则列临时家庭）：**

```json
{
  "action": "list"
}
```

```json
{
  "action": "list",
  "familyId": "fam_demo_001"
}
```

**更新（childId 换成 create 返回的 `child.id`；familyId 须与创建时一致）：**

```json
{
  "action": "update",
  "childId": "替换为文档_id",
  "displayName": "大宝改名",
  "grade": "八年级"
}
```

**设教材（editionId 须已在 catalog_edition）：**

```json
{
  "action": "setTextbook",
  "childId": "替换为文档_id",
  "subjectKey": "math",
  "editionId": "替换为 catalog_edition.editionId"
}
```

**设进度章：**

```json
{
  "action": "setProgress",
  "childId": "替换为文档_id",
  "subjectKey": "math",
  "chapterId": "替换为 catalog_lesson.chapterId",
  "chapterLabel": "第一章"
}
```

**读教材与进度：**

```json
{
  "action": "getTextbooks",
  "childId": "替换为文档_id"
}
```

统一错误：`{ "ok": false, "error": "<code>" }`。常见：`display_name_required`、`grade_invalid`、`child_not_found`、`family_mismatch`、`subject_key_invalid`、`edition_not_found`、`subject_mismatch`、`unknown_action`。
