# 功能实现子 Agent 通用模板

总控把本模板 + `f-cards.md` 里 **仅一张** 任务卡拼成 prompt。禁止一次实现多张卡。

## 必读技能

- `C:/Users/admin/.agents/skills/incremental-implementation/SKILL.md`
- 涉及界面时：`frontend-ui-engineering/SKILL.md`
- 涉及云函数/集合时：`api-and-interface-design/SKILL.md`（只扩本卡契约）
- 本卡若含打星计算：`test-driven-development/SKILL.md` + `doubt-driven-development/SKILL.md`
- 调微信云 API：`source-driven-development/SKILL.md`（先查官方文档）

## 宪法

见 `doc/plan/agent-skills-编排.md` 第 4 节。必须遵守。

## 工作方式

1. 只实现任务卡中的功能与验收。
2. 只改「允许改动」路径；今日页只加插槽组件，不把新业务写进无关 Tab。
3. 不修改其他任务卡已完成的行为；要共用则调用已有云函数/工具函数。
4. 结束前自测验收清单；给总控阶段报告（改了哪些文件、如何验证、假设）。
5. 不要 commit，除非用户在本轮明确要求。

## 阶段报告

```
任务卡: Fxx
做了: ...
文件: ...
验证: ...
未做（刻意）: ...
阻塞下一张卡的问题: 无 / ...
```
