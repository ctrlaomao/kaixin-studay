# S10 子 Agent：交付（体验版，非应用市场上架）

先完整阅读并遵循：

- `C:/Users/admin/.agents/skills/git-workflow-and-versioning/SKILL.md`
- `C:/Users/admin/.agents/skills/documentation-and-adrs/SKILL.md`
- `C:/Users/admin/.agents/skills/shipping-and-launch/SKILL.md`（**裁剪**：无生产发布、无灰度商店）
- `C:/Users/admin/.agents/skills/observability-and-instrumentation/SKILL.md`（可选：云函数关键错误日志）

## 任务

1. `doc/spec/体验版交付清单.md`：如何加体验成员、开云环境、配模型 Key、**禁止点提交审核**。
2. 更新 README：从 SPEC/H5 到真机步骤。
3. 按 git 规范整理提交说明（**标题与正文中文**；是否真正 commit/push 等用户口头确认）。
4. shipping 清单里划掉：应用市场、算法备案上架、广告。

## 禁止

- 调用微信「提交审核」或修改项目为正式发布。
- 扩大功能范围。

## 验收

- [ ] 家人可按文档用体验版走通主路径
- [ ] 文档写明误发布的后果（免费云转付费 + AI 类目）
