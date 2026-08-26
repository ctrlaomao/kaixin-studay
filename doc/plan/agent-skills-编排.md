# 用 Agent Skills 开发「开心补漏」：编排说明

> 技能来源：[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)（DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP）。  
> 本机已有对应技能目录：`C:/Users/admin/.agents/skills/`。  
> 产品依据：[`错题补漏产品设计.md`](错题补漏产品设计.md)、[`../design/产品设计文档.md`](../design/产品设计文档.md)、[`../design/h5/`](../design/h5/)。

## 1. 技能怎么用（对本项目）

技能是 **强制工作流**，不是灵感清单。总 agent 在派活前确认：本阶段读了哪份 `SKILL.md`，子 agent 必须按步骤做完 **Verification**，不能跳过。

生命周期与本仓库状态：

| 上游阶段 | 技能 | 本项目现状 |
| --- | --- | --- |
| DEFINE | interview-me / idea-refine | **已完成**（家长主操、全科小程序、同步课堂、体验版、云开发、计时、心愿） |
| DEFINE | spec-driven-development | 有计划+设计文档+H5，**尚未收口为可验收 SPEC** |
| PLAN | planning-and-task-breakdown | **未做** `tasks/plan.md` |
| BUILD | incremental / frontend-ui / api / source-driven / context / doubt | **未写小程序代码** |
| VERIFY | tdd / browser-devtools / debugging | 无 |
| REVIEW | code-review / simplification / security | 无 |
| SHIP | git / docs / shipping | **不正式上架**；SHIP = 体验版可给家人用 + 文档 ADR |

安装（若环境缺技能）：

```bash
npx skills add addyosmani/agent-skills
npx skills add tencentcloudbase/cloudbase-skills -g -y
```

Cursor 里总 agent 用 Task 子 agent 时：把本文件「宪法」+ 该阶段 `prompts/*.md` 整段贴进 `prompt`。

## 2. 总 agent vs 子 agent

```
总agent（调度）
  读宪法 + 上一阶段验收包
  一次只派 1 个子agent（禁止并行改同一目录）
  收「阶段报告」：做了什么、验收证据、未决假设
  更新 tasks/todo.md 与 doc/plan/阶段日志.md
  未过验收不得开下一阶段
```

总 agent **自己不写业务代码**（除非子 agent 失败需急救）。总 agent 负责：选阶段/任务卡、粘贴提示词、对照验收清单、合并文档、git 是否提交由人确认。

## 3. 阶段划分

前期仍按技能生命周期；**实现期改为「一功能一子 agent」**，任务卡见 [`功能任务清单.md`](功能任务清单.md)（F00a–F28）。

| 阶段 | 谁执行 | 产出 |
| --- | --- | --- |
| S0 总控 | 总 agent | 阶段日志 |
| S1 SPEC | 1 子 agent | `doc/spec/SPEC.md` + ADR |
| S2 拆解 | 1 子 agent | 对照功能清单校准 `tasks/todo.md` |
| S3 上下文 | 1 子 agent | `AGENTS.md` |
| 波次 A | 每切片 1 子 agent | 云函数/集合/采集/打星；无 pages |
| 波次 B | 每切片 1 子 agent | F00a 起各页面，只调已有 API |
| S8 验证 | 1 子 agent | 主路径走查报告 |
| S9 评审 | 1 子 agent | 评审报告 |
| S10 交付 | 1 子 agent | 体验版清单 |

实现期禁止再派「整个错题闭环」这种大包 prompt。

## 4. 宪法（每个子 agent 提示词开头必须引用）

1. **产品：** 家庭自用微信小程序体验版，不正式上架；**微信号加入家庭，每号一个角色**（家长主操、学生答题）。可多名孩子；家长记录学习时仅一名学生则默认关联，多名必选。  
2. **知识点：** 只对照同步课堂 年级→学科→版本→册→章→课时；打星单位=课时。  
3. **不做：** 下载课件/视频/电子书、支付/商城、监考计时、班级老师端、语文开放批改。允许采集同步课堂公开目录元数据并按平台层级展示。**一期范围 = 现行任务卡；费曼学习法仅二期规划，禁止顺手做。**  
4. **后端：** 微信云开发即后端，**不自建服务器。** 普通云函数在仓库根 `cloudfunctions/<名>/`（与开发者工具 `cloudfunctionRoot` 一致）。小程序经封装 `callFunction`。禁止客户端直写云库。  
5. **UI：** 对齐 `doc/design`：主色 `#0F766E`，强调 `#D97706`，背景 `#F4F1EA`，页面 ID P01–P14。  
6. **打星/心愿：** 规则以计划文档为准；人工改星默认不计心愿；综合卷及格默认 80%。  
7. **范围：** 只改**当前任务卡**允许的文件；不重构无关代码；不发明需求；不顺手做下一张卡。  
8. **验证：** 无证据不算完成。假设必须写进阶段报告。  
9. **语言：** 用户文档与界面中文。  

## 5. 提示词文件

| 文件 | 用途 |
| --- | --- |
| [prompts/00-orchestrator.md](prompts/00-orchestrator.md) | 总控 |
| [prompts/01-spec.md](prompts/01-spec.md) | S1 |
| [prompts/02-plan.md](prompts/02-plan.md) | S2（产出须对齐功能清单粒度） |
| [prompts/03-context.md](prompts/03-context.md) | S3 |
| [prompts/F-template.md](prompts/F-template.md) | 实现期通用 |
| [prompts/f-cards.md](prompts/f-cards.md) | F00a–F28 任务卡 |
| [prompts/08-verify.md](prompts/08-verify.md) | S8 |
| [prompts/09-review.md](prompts/09-review.md) | S9 |
| [prompts/10-ship.md](prompts/10-ship.md) | S10 |

原 `04/05/06/07` 大包实现 prompt **废弃**，改走任务卡。DEFINE 已完成，不要用 idea-refine 推翻已选项。
