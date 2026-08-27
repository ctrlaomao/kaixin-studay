# homeworkBatch（F06A）

作业批次。请求体 `fileIDs` + 学科；`childId` 可省：该家庭（或 `tmp:OPENID`）仅 1 条 `child` 则服务端默认；多条必须带 `childId`。写入 `status: "待核对"`。

## action

| action | 入参 | 成功返回 |
| --- | --- | --- |
| `create`（默认） | `fileIDs[]`、`subject`；可选 `childId`、`date`（`YYYY-MM-DD`）、`source` | `{ ok, batch, childIdDefaulted }` |

`subject` 同计时学科枚举。`fileIDs` 最多 30 个云存储 fileID（上传约定后续 F05）。

鉴权：OPENID。无 OPENID → `openid_missing`。

## 集合 `homework_batch`

`childId`、`familyId`、`subject`、`date`、`source`、`fileIDs` / `images`、`status`（待核对）。

`createCollection("homework_batch")` 容错。客户端拒绝写。

## 部署

对 `cloudfunctions/homeworkBatch` 右键 → **上传并部署：云端安装依赖**。timeout 60s。`wx-server-sdk ~2.4`。

## 云端测试 JSON

单孩子家庭可省略 `childId`：

```json
{
  "action": "create",
  "fileIDs": ["cloud://demo/homework/p1.jpg"],
  "subject": "数学",
  "date": "2026-08-27",
  "source": "练习册"
}
```

多孩子必须带 `childId`：

```json
{
  "action": "create",
  "childId": "替换为 child._id",
  "fileIDs": ["cloud://demo/homework/p1.jpg"],
  "subject": "英语"
}
```

错误：`file_ids_required`、`child_id_required`（0 条或多条未指定）、`family_mismatch`、`subject_invalid`。
