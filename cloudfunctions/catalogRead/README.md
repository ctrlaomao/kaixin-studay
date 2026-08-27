# catalogRead（F02A）

只读查询云库目录真源：`catalog_edition`、`catalog_lesson`。不写库。写入仍只走 `catalogImport`。

## action

| action | 入参 | 成功返回 |
| --- | --- | --- |
| `listEditions` | 可选 `gradeLabel`、`subjectLabel`；可选 `skip` / `limit`（默认 0 / 100，上限 100） | `{ ok, skip, limit, total, editions }` |
| `listLessons` | 必填 `editionId`；可选 `skip` / `limit` | `{ ok, editionId, skip, limit, total, lessons }` |

`editions` 只含 `online !== false` 的册。课时按 `sortKey` 升序。

## 部署

对 `cloudfunctions/catalogRead` 右键 → **上传并部署：云端安装依赖**。

## 云端测试 JSON

**全部在线册（可筛年级/学科）：**

```json
{
  "action": "listEditions"
}
```

```json
{
  "action": "listEditions",
  "gradeLabel": "七年级",
  "subjectLabel": "数学"
}
```

**某册课时（`editionId` 换成 `listEditions` 返回的值）：**

```json
{
  "action": "listLessons",
  "editionId": "替换为 catalog_edition.editionId",
  "skip": 0,
  "limit": 100
}
```

统一错误：`{ "ok": false, "error": "<code>" }`。常见：`edition_id_required`、`unknown_action`、`internal_error`。
