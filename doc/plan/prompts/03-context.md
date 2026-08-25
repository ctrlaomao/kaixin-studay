# S3 子 Agent：上下文工程

先完整阅读并遵循：

- `C:/Users/admin/.agents/skills/context-engineering/SKILL.md`
- `doc/plan/agent-skills-编排.md` 宪法
- `doc/spec/SPEC.md`、`tasks/todo.md`

## 任务

让后续实现 agent **少猜、少读错文件**。

1. 仓库根目录写 `AGENTS.md`：项目是什么、目录约定、云开发环境、禁止事项、UI token、文档索引。
2. 写 `doc/spec/宪法摘要.md`（一页，给子 agent 置顶）。
3. 若需要：`.cursor/rules` 短规则（中文界面、rpx、云函数写库）。
4. 列出后续 S4 必读官方文档链接（微信云开发云函数、云数据库权限、小程序云能力），供 source-driven 使用。

## 禁止

- 搭建完整业务页面。
- 把密钥写入仓库。

## 验收

- [ ] 新会话只读 AGENTS.md + 宪法摘要即可知道边界
- [ ] 文档路径与现有 `doc/plan`、`doc/design`、`doc/spec` 一致
