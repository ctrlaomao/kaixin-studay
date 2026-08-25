# S1 子 Agent：SPEC 收口

先完整阅读并遵循：

- `C:/Users/admin/.agents/skills/spec-driven-development/SKILL.md`
- `C:/Users/admin/.agents/skills/documentation-and-adrs/SKILL.md`
- `doc/plan/agent-skills-编排.md` 第 4 节宪法

## 输入（只读）

- `doc/plan/错题补漏产品设计.md`
- `doc/design/产品设计文档.md`
- `doc/design/h5/`（对照页面，不改 H5 除非发现与 SPEC 冲突需标注）

## 任务

写出 **可验收** 规格，不要写小程序业务代码。

1. 创建 `doc/spec/SPEC.md`：用户故事、验收标准（Given/When/Then）、页面 P01–P13 与状态、非功能（体验版、云开发、压缩上传、云函数超时）。
2. 创建 `doc/spec/ADR-001-知识点以同步课堂课时为准.md`、`ADR-002-体验版不发布.md`、`ADR-003-微信云开发.md`（为什么选、不选什么）。
3. 明确 **Out of scope** 与计划文档「明确不做」一致。
4. 列出未决问题（最多 5 条）；能默认的写进 SPEC 并标记假设。

## 禁止

- 推翻已确认选项（家长主操、四科、同步课堂、不发布、云开发）。
- 发明新 Tab 或支付能力。

## 验收

- [ ] SPEC 每条用户故事有验收标准
- [ ] 打星、计时 4 小时忘关、心愿综合卷 80%、人工星不计心愿 均有条款
- [ ] ADR 解释「课时打星而非课标 ID」
- [ ] 阶段报告：文件列表 + 假设清单

## 阶段报告模板

```
阶段: S1
产出: ...
假设: ...
风险: ...
建议下一阶段: S2
```
