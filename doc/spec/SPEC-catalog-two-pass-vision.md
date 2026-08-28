# Spec: 两次视觉（窄探册 + 逐题闭集课时）

来源：[`docs/ideas/catalog-two-pass-vision.md`](../../docs/ideas/catalog-two-pass-vision.md)。产品主 SPEC：[`SPEC.md`](./SPEC.md)。识图切片：[`当前切片实现说明.md`](./当前切片实现说明.md)。手动重试：[`SPEC-recognize-manual-retry.md`](./SPEC-recognize-manual-retry.md)（实现时须同步改配额/`canRetry`）。

**闸门：** SPEC 已确认。计划见 `tasks/plan.md` 文首「两阶段视觉」；任务卡 `tasks/todo.md`「两阶段视觉挂课时」。人确认计划后再写代码。

---

## Assumptions（有异议立刻改本文）

1. 家长仍只拍照、下拉刷新；**不新增页面**。两阶段都在同一 `recognize_job`、同一组 `fileIDs`。
2. **一次 drain 只跑一个视觉阶段**（probe 或 grade），禁止 60 秒内串两次 HTTP 视觉。
3. `start` 的自动额度：`modelCallLimit = 2`（probe + grade）。旧文档无阶段字段视为单次逐题（`modelCallLimit` 缺省 1，行为与现网一致）。
4. **手动重试与两阶段分开：** `retry` 在自动两阶段已用尽或失败后，把 `modelCallLimit` **再 +1**（常见为 3），并只把阶段拨回 **`need_grade`**（若已有本册闭集）；没有闭集则拨回 **`need_probe`**。`deepseekCalls` 仍不清零，只在真正开跑时 +1。
5. **`canRetry`：** `pending`/`running` 为假；`error` 或 `done` 空题；且 `deepseekCalls >= modelCallLimit`（自动次数已用尽）；且尚未把上限加到超过「自动 2 + 手动 1」，即 `modelCallLimit < 3`（或等价：手动尚未用过）。实现时 **R2 的 `limit===1` 条件必须改掉**，否则两阶段 job 永远 `canRetry`。
6. probe JSON **禁止** `questions`。grade 仍用现有逐题契约，可多 `lessonId` 字段。
7. 闭集只含人教该册 `lessonId` + `lessonLabel`（行数上限 **80**，超出截断并打日志）。超长不塞章名。英语：probe 可出学科，**grade 不带闭集、不写 lessonId**（与现网一致）。
8. probe 失败、解析失败、选不出版：grade **不带闭集**，走现有逐题 + `matchLesson`。不把空表塞进 prompt。
9. 模型返回的 `lessonId` 必须在本 job 保存的闭集内，否则清空该题 `lessonId`，再 `matchLesson(lessonHint)`。不确定宁空，不选「邻近课时」。
10. 验收以 **数学** 为主；实现按现有 `pickEdition` 覆盖其它非英语科，不单独写死只数学。
11. 控制台 `VISION_MODEL` 应为 `glm-5v-turbo`；本 SPEC 不负责改中台。4v 下两阶段可能双双超时，视为运维前提而非代码缺陷。

→ 不对请改 SPEC 再实现。

---

## Objective

同一张作业照：先短视觉锁定年级/册/学科（及两三个知识点俗称），云函数选出人教一册课时表；再在下一轮 drain 做现有逐题批改，并把闭集 `lessonId` 交给模型。家长看到的仍是「识别中 → 已完成/失败」。成功 = 有题目，且能挂上的题 `lessonId` 均来自该册（或合法兜底匹配）。

## Tech Stack

现有 `recognizeHomework` + `catalog_*` + `homeworkBatch`。无新依赖。提示词：`homeworkPrompt.js`（grade）+ 新建 `probePrompt.js`（须同步技能 `kaixin-homework-vision` 或专节）。

## Commands

```
Dev: 微信开发者工具部署 recognizeHomework（超时 60s，定时器 drainRecognize）
Test: npm test -- tests/recognizeMatch.test.js
云端: 拍一张数学作业，看 job 先 probe 再 grade；列表约两分钟内出题
```

## Project Structure

```
cloudfunctions/recognizeHomework/probePrompt.js   → 窄探 prompt
cloudfunctions/recognizeHomework/homeworkPrompt.js → 逐题；可拼接闭集附录
cloudfunctions/recognizeHomework/index.js         → 阶段状态机 + drain 单阶段
cloudfunctions/recognizeHomework/parse.js         → probe JSON；grade 校验 lessonId
cloudfunctions/recognizeHomework/matchCatalog.js  → 闭集丢弃后的 matchLesson 兜底
cloudfunctions/homeworkBatch/index.js             → 更新 canRetry（与假设 5 一致）
tests/recognizeMatch.test.js                      → 非法 id 丢弃、probe 解析
doc/spec/api.md、当前切片实现说明.md               → 实现后同步
.cursor/skills/kaixin-homework-vision/SKILL.md     → 两套 prompt 全文
```

## Code Style

阶段字段建议：`visionStage`: `need_probe` | `need_grade` | `complete`。闭集：`lessonClosedList: [{ lessonId, lessonLabel }]`。

```javascript
function sanitizeLessonId(id, closedList) {
  const s = String(id || "").trim();
  if (!s) return "";
  return (closedList || []).some((x) => x.lessonId === s) ? s : "";
}
```

Drain：`need_probe` 且额度未满 → 只 probe；成功则 `need_grade`+写闭集或空闭集；`need_grade` → 只 grade。`status` 在两阶段之间回 `pending`（非 done），`jobStatus` 对家长仍是识别中。

## Testing Strategy

| 层 | 内容 |
| --- | --- |
| 单测 | probe JSON 无 questions 仍 parseOk；`sanitizeLessonId` 拒绝表外 id；空闭集不调用 sanitize 当合法 |
| 云端 | 新 job `modelCallLimit===2`；probe 后 questions 仍空；grade 后有题 |
| 预览 | 检查列表两分钟内从排队到完成；失败仍可按更新后的 canRetry 重试 |
| 回归 | 旧 job 无 visionStage 且 limit 1：仍单次逐题；英语无 lessonId |

不测 embedding、不测一次 drain 双视觉。

## Boundaries

- **Always：** 一 drain 一视觉；闭集校验；英语不挂；prompt/技能双处同步；改 `canRetry` 与重试 SPEC 一致；密钥不进 git。
- **Ask first：** 自动改成 3 次视觉、清单 >80、一次 drain 双请求、前端展示「探测中」。
- **Never：** 两次全量逐题；空表当闭集；用重试额度顶第二次视觉；客户端直写库。

## Success Criteria

1. 新 `start`：`visionStage=need_probe`，`modelCallLimit=2`。
2. probe prompt 不含课时表、不要求 `questions`；解析结果写入 `probeGrade`/`probeVolume`/`probeSubject`/`lessonHints`（字段名可微调，须文档化）。
3. 选册成功则 job 带 `lessonClosedList`（≤80）；英语或失败则列表为空，grade 不附附录。
4. 下一 drain 跑 grade；逐题 prompt 仅在列表非空时追加闭集；返回 id 经 `sanitizeLessonId`。
5. 两阶段都成功：`status=done`，`visionStage=complete`。
6. 家长 UI 无新按钮；进行中不可重试；两阶段用尽失败后 `canRetry` 符合假设 5。
7. `npm test` 覆盖非法 id 与 probe 解析。

## 与手动重试的关系

实现本 SPEC 时 **必须** 修订 `SPEC-recognize-manual-retry.md` 假设 5 与 `computeCanRetry`：自动两次视觉不是「可重试」。手动 +1 最多共 3 次模型 HTTP。文案「共两次」若仍写在确认框，改为「将再识别一次」或「自动两次后还可再试一次」，避免和 probe+grade 的「两次」混淆。

## Open Questions

- 无（清单 80 行、重试 +1 且优先重跑 grade、新 job limit=2 已写入 Assumptions）。改这些先改 SPEC。
