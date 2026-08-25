# S2 子 Agent：任务拆解

先完整阅读并遵循：

- `C:/Users/admin/.agents/skills/planning-and-task-breakdown/SKILL.md`
- `doc/plan/agent-skills-编排.md` 宪法
- `doc/spec/SPEC.md`

## 任务

**只规划，不写功能代码。** 粒度必须对齐已有 [`doc/plan/功能任务清单.md`](../功能任务清单.md)（一卡一会话）。

1. 输出 `tasks/plan.md`：把 F00a–F28 画成依赖图，可增补子任务但 **不要合并** 成「整个错题闭环」这种大项。
2. 输出 `tasks/todo.md`：每条 = 清单里一个 Fxx，状态 pending，复制完成定义。
3. 实现期 **禁止并行改同一文件**；仅文档/独立 JSON 经总控特批可并行。
4. 风险：识图超时、打星状态机、双 openid、今日页插槽被写爆。

## 验收

- [ ] 每个 todo 有 Done 定义（可测）
- [ ] 顺序与 S4→S7 编排一致
- [ ] 无「一次做完全部页面」的巨型任务

## 阶段报告

任务数、关键路径、建议切片大小。
