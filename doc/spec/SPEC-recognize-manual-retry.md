# Spec: 拍照检查失败后手动重试

来源：[`docs/ideas/recognize-manual-retry.md`](../../docs/ideas/recognize-manual-retry.md)。产品主 SPEC：[`SPEC.md`](./SPEC.md)。切片现状：[`当前切片实现说明.md`](./当前切片实现说明.md)。

**闸门：** SPEC 已确认。实现计划见 `tasks/plan.md` 文首「手动重试」；任务卡在 `tasks/todo.md`「识别失败手动重试」。人确认计划后再写代码。

---

## Assumptions（有异议立刻改本文，不要默默改代码）

1. 单能力：同一 `recognize_job` 上解锁第 2 次模型调用。不拆成独立模块图。
2. 用户是家长；入口只在检查列表（`pages/today`），批改详情不做重试按钮。
3. 成功 = 同一组 `fileIDs` 再跑识图后 `questions.length > 0`（或 `questionCount > 0`）。
4. **允许重试的状态：** `job.status === "error"`，**或** `job.status === "done"` 且题目为空（`questions` 空且批次 `questionCount` 为 0）。这覆盖「中台有题、落库为空仍标 done」的现网坑。
5. 每任务模型调用上限：默认 1；用户成功 `retry` 一次后上限为 2。`deepseekCalls` **不因 drain 超时自动清零**；仅 `runJob` 真正开跑时递增。
6. 第二次仍可能 60s 超时（中台其实已成功）——本期 **接受再烧一次**，不存 `rawText`、不做只解析。
7. `retry` 只改库状态为 `pending` 并提高上限；执行仍走 `drainRecognize` / `runJob`。客户端 **不等待** 识图结束。
8. 鉴权：与现网识图一致（`OPENID` + 该 job 的 `createdByOpenid` / `childId` 属于当前家庭孩子）。不新做角色系统。
9. 列表是否可点重试由 **服务端** 算 `canRetry`，前端不复制配额公式。
10. 点重试前 `wx.showModal` 确认：「将再用一次识别（共两次）。点完约一分钟后下拉刷新。」

→ 以上不对请直接改本 SPEC 再实现。

---

## Objective

家长在检查列表看到识别失败（或「已完成但 0 题」）时，可对 **同一张（组）作业照、同一 job** 再排队识图一次。自动 drain **不得** 在无人按按钮时突破第 1 次配额。

**成功标准（可测）：**

- 失败行出现「重试」；`pending`/`running` 不出现；配额已用尽（已 2 次仍失败或仍 0 题）不出现，并提示重拍。
- 点重试且确认后：job 为 `pending`，`modelCallLimit === 2`（或等价字段），`deepseekCalls` 仍为已发生次数（一般为 1）；约一分钟内 drain 可再跑；跑完后批次 `jobStatus`/`questionCount`/`jobError` 与首次 `runJob` **同一套 `syncBatch`**。
- 未点重试：`deepseekCalls >= 1` 且上限仍为 1 时，drain/`runJob` 行为与现网一致（跳过或标超时 error，不二次调模型）。
- 客户端不调用「同步 run」；不直写云库。

## Tech Stack

与主 SPEC：微信小程序 `frontend/` + 普通云函数 `recognizeHomework` / `homeworkBatch`。集合 `recognize_job`、`homework_batch`。无新依赖。

## Commands

```
Dev: 微信开发者工具打开仓库，上传并部署 recognizeHomework、homeworkBatch（超时 60s，确认定时器 drainRecognize）
云端测 retry: 云开发控制台云函数「测试」传入 { "action": "retry", "jobId": "<id>" }
Preview: 开发者工具预览检查 Tab，对失败记录点重试
```

无强制单测框架覆盖本能力；以云端测试 + 真机/开发者工具预览验收。

## Project Structure

```
cloudfunctions/recognizeHomework/index.js  → action=retry；runJob 配额改为 limit
cloudfunctions/homeworkBatch/index.js      → list/get 带出 canRetry（及现有 job 字段）
frontend/utils/api.js                       → homework.recognizeRetry
frontend/pages/today/index.js|wxml|wxss     → 重试按钮、确认、刷新
doc/spec/api.md                             → 实现时同步 action 说明
doc/spec/当前切片实现说明.md                → 实现后改「每任务 1 次」为「自动 1 次，手动可到 2」
docs/ideas/recognize-manual-retry.md       → 产品一页纸，不替代本 SPEC
```

## Code Style

与现有云函数一致：`action` 分发、`{ ok, error }`、`nowIso()`、`logDrain` 打点。字段用 camelCase。示例（实现须与此语义一致，不必逐字）：

```javascript
const limit = Number(doc.modelCallLimit) > 0 ? Number(doc.modelCallLimit) : 1;
if (doc.status === "done" && (doc.questions || []).length) {
  return { ok: true, skipped: true, reason: "done" };
}
if ((Number(doc.deepseekCalls) || 0) >= limit) {
  return { ok: true, skipped: true, reason: "quota" };
}
```

`retry` 失败码稳定字符串，例如：`job_id_required` / `job_not_found` / `forbidden` / `not_retryable` / `quota_exhausted`。

## Testing Strategy

| 层级 | 内容 |
| --- | --- |
| 云端 | `retry`：无 jobId、错 openid、pending 中、已 2 次、error、done 空题、done 有题 |
| drain | 上限 1 且 calls=1：不调模型；`retry` 后 pending 且 limit=2、calls=1：会进入 `runJob` 并把 calls 增为 2 |
| 预览 | 失败行确认后文案变为排队/识别中；按钮消失；下拉后有题或再次失败且无重试 |
| 回归 | 正常拍一张成功路径不变；未点重试的超时 job 仍不自动再打 |

不要求覆盖率数字。不测换模型、不测详情页按钮。

## Boundaries

- **Always：** 经 `callFunction`；配额规则只在云函数；自动路径不把 `deepseekCalls` 清零；更新本 SPEC / `api.md` 与切片说明后才算做完文档。
- **Ask first：** 存模型原文、改超时 60s、加云函数依赖、无限重试、详情页入口、新建第二条 job。
- **Never：** 客户端直写 `recognize_job`；小程序同步 `action=run` 等结果；为重试自动换 Key/模型；把密钥写入 git。

## Success Criteria

1. `recognizeHomework` 支持 `action: "retry"`，`data.jobId` 必填。
2. `recognize_job` 有明确上限字段（推荐 `modelCallLimit`，缺省视为 1）；`start` 写入 `1`。
3. `canRetry` 为真当且仅当：调用者可操作该 job，且（error 或 done 空题），且 `deepseekCalls < 2` 且当前上限为 1（尚未解锁第二次），且状态不是 `pending`/`running`。
4. 检查列表：`canRetry` 为真显示「重试」；`catchtap` 不打开详情；确认后调 API，成功则刷新列表并沿用 8/20/40s 刷新。
5. `runJob` 用 `modelCallLimit` 替代写死的 `>= 1`；第二次开跑时 `deepseekCalls` 变为 2。
6. 卡住的 `running` 且已调用过模型：仍标 error、**不清零** calls（与现网一致）。
7. 二次失败或二次仍 0 题：`canRetry` 为假；列表提示重拍（toast 或副文案），不再显示「不会重试」这种绝对句（改为可重试时出按钮）。
8. 一期不做：换模型、rawText、新 job、详情重试、客户端等待。

## API（实现时写入 `api.md` 的合同）

`wx.cloud.callFunction({ name: "recognizeHomework", data: { action: "retry", jobId } })`

成功：`{ ok: true, jobId, status: "pending", modelCallLimit: 2 }`  
失败：`{ ok: false, error: "<code>" }`

`homeworkBatch` `list`/`get` 每条带 `canRetry: boolean`（及现有 `jobId`/`jobStatus`/`questionCount`/`jobError`）。

前端：`api.homework.recognizeRetry({ jobId })`。

## Open Questions

- 无（产品选择已写入 Assumptions 第 4、6 条）。若要改「仅 error 可重试」或「二次超时改存原文」，先改 SPEC 再改代码。
