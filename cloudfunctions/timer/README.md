# timer（F04A）

纸质作业计时。按 `childId` 同时仅一段未结束会话（`running` 或 `paused`）。结束时墙钟超过 4 小时则 `forgotten: true`（可能忘关）。其它 action 若发现已超 4h 也会自动结束并打标。

**禁止监考：** 不读其它 App、不截屏巡查、不用摄像头、不后台偷偷计时。时长不计入掌握门槛、不计入心愿。

## action

| action | 入参 | 成功返回 |
| --- | --- | --- |
| `start` | `childId`、`subject`；可选 `note` | `{ ok, session }` |
| `pause` | `sessionId` 或 `childId` | `{ ok, session }` |
| `resume` | 同上 | `{ ok, session }` |
| `end` | 同上；可选 `note`、`subject`（结束时可改） | `{ ok, session }` |

`subject` 仅：语文 / 数学 / 英语 / 物理 / 化学 / 生物 / 历史 / 地理 / 道德与法治 / 未分科。

鉴权：OPENID。无 OPENID → `openid_missing`。孩子须属于调用者正式家庭或 `tmp:OPENID`。

已有未结束段再 `start` → `already_running`（带当前 `session`）。

## 集合 `timer_session`

`childId`、`familyId`、`subject`、`status`（running/paused/ended）、`startedAt`、`pausedMs`、`lastPausedAt`、`endedAt`、`durationSec`、`note`、`forgotten`。

`createCollection("timer_session")` 容错。

## 部署

对 `cloudfunctions/timer` 右键 → **上传并部署：云端安装依赖**。timeout 60s。`wx-server-sdk ~2.4`。

## 云端测试 JSON

先有一条 `child`，把 `childId` 换成真实 `_id`。连续调用：start → pause → resume → end。

```json
{
  "action": "start",
  "childId": "替换为 child._id",
  "subject": "数学"
}
```

```json
{
  "action": "pause",
  "childId": "替换为 child._id"
}
```

```json
{
  "action": "resume",
  "sessionId": "替换为 session.id"
}
```

```json
{
  "action": "end",
  "sessionId": "替换为 session.id",
  "note": "练习册 P12"
}
```

错误：`already_running`、`subject_invalid`、`session_not_found`、`already_ended`、`family_mismatch`。
