# 实现计划

## 当前：识别失败手动重试

依据 [`doc/spec/SPEC-recognize-manual-retry.md`](../doc/spec/SPEC-recognize-manual-retry.md)。**未确认本段前不写代码。**

### Overview

同一 `recognize_job`：用户点「重试」把 `modelCallLimit` 提到 2 并改回 `pending`；`runJob` 用上限代替写死的 `deepseekCalls >= 1`。列表由 `homeworkBatch` 带 `canRetry`。检查页确认后调 `retry`，仍靠 `drainRecognize` 执行。

### Architecture Decisions

- **`modelCallLimit` 缺省 1。** 旧文档无此字段视为 1，与现网自动配额一致。
- **不抽跨函数 `_common`。** 云函数包不互相 require；`computeCanRetry(job)` 在 `recognizeHomework` 与 `homeworkBatch` **各放一份、注释互指**，避免未复制目录导致部署失败。
- **鉴权 `retry`：** `createdByOpenid === OPENID`（与批次创建者一致即可；家庭自用）。不匹配 → `forbidden`。
- **`runJob` 开跑：** `deepseekCalls = (Number(doc.deepseekCalls)||0) + 1`，不再写死赋 1。`status === "done"` 且已有题目仍 skip；`done` 且空题若未 retry 仍 skip（须先 `retry` 改 pending）。
- **卡住 running：** `deepseekCalls >= 1` 仍标 error、不清零（与现网相同）。不要改成「按 limit 清零」。
- **`canRetry`：** error，或 done 且 `!(questions||[]).length`；非 pending/running；`deepseekCalls < 2`；`modelCallLimit` 缺省或为 1（尚未解锁）。`limit===2` 且仍失败 → 假。
- 前端不算配额；只信 `canRetry`。`catchtap` 防止点按钮冒泡打开详情。error 行仍可点卡片：无 `canRetry` 时 toast「请重拍」；有按钮时打开详情仍拦截（error 本来就不能进详情）。

### 顺序（必须串行）

```
配额+retry（recognizeHomework）
    → list/get canRetry（homeworkBatch）
        → api + 检查列表 UI
            → api.md + 切片说明
```

不可并行改同一云函数。无页面可先云端测 retry。

### Task List

见 `tasks/todo.md`「识别失败手动重试」R1–R4。

### Checkpoint: 云函数

- [ ] 控制台 `retry` 成功/拒绝码符合 SPEC
- [ ] 未 retry 的 calls=1 任务 drain 不二次调模型
- [ ] 人确认后再做前端

### Checkpoint: 端到端

- [ ] 检查列表失败行确认后变排队，按钮消失，8/20/40s 刷新
- [ ] 二次失败无按钮、提示重拍
- [ ] 正常拍照成功路径不变

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `runJob` 仍 skip 全部 `done` | 空题 done 无法二次跑 | retry 必须改 `pending` 再 drain |
| 两份 `computeCanRetry` 漂移 | 按钮与 API 不一致 | 实现时同一注释+同一布尔条件 |
| 第二次再超时 | 家长觉得按钮无效 | 用尽后面文案改重拍，不第三次 |
| 部署漏 homeworkBatch | 无按钮 | 两函数都上传 |

### Open Questions

无（SPEC Assumptions 已锁定）。

---

# 一期总计划（历史）

依据 `doc/spec/SPEC.md` 与 `doc/plan/功能任务清单.md`。

本文件覆盖 **一期**（不含兑心愿）。二期：兑心愿；费曼学习法辅助讲解。

**策略：先后端（云开发），再前端（Uni-app）。** 同一功能若含页面，拆成 A/B 两次子 agent。

## 依赖图（简）

```
波次 A（无 pages）
F00b → F00d → F00e → F00g
F00b → F10
F00b → F01A → F02A → F03A
F01A → F04A
F01A → F06A → F07 → F09A → F11
F10 → F11
F09A → F12A → F13A
F11 → F14 → F16A → F20A
F02A+F11 → F17 → F14b
F11 → F18A
F18A → F24A → F25 → F27A
# F22A F23A F28A 二期兑心愿，一期不排

波次 B（A 完成后）
F00g → F00a → F00f
F00a + F01A → F01B → F02B → F03B
F00a + F04A → F04B
F01B → F05 → F06B → F08 → F09B
F12A → F12B → F13B
F14 → F15 → F16B
F18A → F18B → F19
F06B+F14 → F21
F24A → F24B
F25 → F26 → F27B
# F22B F23B F28B 二期
```

## 顺序

总控先清空波次 A 队列，再清空波次 B。禁止两 agent 改同一页面或同一云函数。

F10 在 F09 之前完成（仅依赖 F00b）。  
F06A / F09A / F16A / F27A 用请求体模拟客户端数据，不依赖拍照/答题页。

## 风险

- 识图超时 → 按张调用、可 mock  
- 打星状态机 → F10 单测锁死规则  
- 今日页膨胀 → 只插槽  
- 双 openid → **F03 一期必做**：微信号加入家庭，角色在成员记录上  
- 多名孩子 → 拍照/计时挂当前 childId；仅一名学生则默认，多名必选  
- 计时同时仅一段：按 **当前孩子** 计（多孩切换后不得混记）  
- A/B 接线：页面经 `api` 调 `callFunction`，禁止客户端直写库

## 验证检查点

- F00g：控制台能查到课时文档  
- F10：`npm test` 通过  
- F09A：wrong_item 可查  
- F00a：四 Tab 能开  
- F16B：星会变  
- F27B：综合卷及格/不及格与冷却可见
- S8：主路径报告  
