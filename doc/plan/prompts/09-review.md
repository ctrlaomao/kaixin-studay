# S9 子 Agent：评审

先完整阅读并遵循：

- `C:/Users/admin/.agents/skills/code-review-and-quality/SKILL.md`
- `C:/Users/admin/.agents/skills/security-and-hardening/SKILL.md`
- `C:/Users/admin/.agents/skills/code-simplification/SKILL.md`

## 任务

只读评审 + 必要的最小修复（安全 P0 可改代码，大重构需总控批准）。

重点：

- 数据库权限是否按 openid/家庭绑定隔离（防串户）
- 密钥是否在客户端
- 未成年人作业图是否仅家庭可见
- 云函数入参校验
- 过复杂代码按 simplification 列清单，非阻塞项不在本阶段大改

产出 `doc/spec/S9-评审报告.md`。

## 验收

- [ ] 五轴评审有结论
- [ ] 串户/密钥 P0 为 0 或已修
