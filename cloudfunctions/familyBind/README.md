# familyBind（F03A）

家庭成员与角色。一号一家庭；`role` 仅 `parent` | `student`。学生成员必须带 `childId`。邀请码绑定 `inviteChildId`，72 小时过期，使用后清空。

**禁止：** 一号多家庭、一号多角色。心愿 redeem 不在本函数（一期不做兑心愿；学生调 redeem 应在后续卡拒绝）。

## action

| action | 入参 | 成功返回 |
| --- | --- | --- |
| `createFamily` | 无 | `{ ok, family, migratedChildCount }` |
| `createInvite` | 可选 `inviteChildId`（有则加入方为学生） | `{ ok, inviteCode, inviteExpireAt, inviteChildId, familyId }` |
| `joinFamily` | `inviteCode` | `{ ok, family }` |
| `me` | 无（默认） | `{ ok, family, role, member }`；未加入则 `family: null` |

鉴权：`cloud.getWXContext().OPENID`。无 OPENID 返回 `openid_missing`。`createInvite` 仅家长。

`createFamily` 后把该 OPENID 下 `child.familyId === "tmp:" + OPENID` 改成正式 `family._id`。

## 集合 `family`

`members[{openid, role, childId?}]`、`inviteCode`、`inviteExpireAt`、`inviteChildId`。

集合不存在时 `createCollection("family")` 容错。客户端拒绝写，仅云函数写。

## 部署

对 `cloudfunctions/familyBind` 右键 → **上传并部署：云端安装依赖**。`config.json` timeout 60s。`wx-server-sdk ~2.4`，`DYNAMIC_CURRENT_ENV`。

## 云端测试 JSON

控制台云端测试可能没有真实 OPENID，会返回 `openid_missing`。有 OPENID 后用下面 JSON。

**建家庭（创建者默认为 parent）：**

```json
{
  "action": "createFamily"
}
```

**本人：**

```json
{
  "action": "me"
}
```

**发邀请（可选绑定孩子，加入方为学生）：**

```json
{
  "action": "createInvite",
  "inviteChildId": "替换为 child._id"
}
```

**无 childId 的邀请：加入方为 parent（共同家长）。**

```json
{
  "action": "createInvite"
}
```

**加入（换另一个 OPENID 测；两号 `me` 的 `role` 应不同）：**

```json
{
  "action": "joinFamily",
  "inviteCode": "替换为邀请码"
}
```

统一错误：`{ "ok": false, "error": "<code>" }`。常见：`already_in_family`、`parent_only`、`invite_invalid`、`invite_expired`、`child_id_required`、`unknown_action`。
