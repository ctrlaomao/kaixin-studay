# AGENTS.md

## 这是什么

家庭自用微信小程序「开心补漏」：拍照错题 → 同步课堂课时打星 → 补练 → 心愿综合卷。体验版不发布。

## 必读

- `doc/spec/SPEC.md`
- `doc/spec/宪法摘要.md`
- `doc/plan/功能任务清单.md`
- `doc/spec/ADR-004-同步课堂目录采集.md`

## 目录

| 路径 | 用途 |
| --- | --- |
| `doc/plan/` | 产品计划、编排、任务卡 |
| `doc/design/` | 设计文档与 H5 原型 |
| `doc/spec/` | SPEC、ADR、api.md |
| `tasks/` | plan.md / todo.md |
| `cloudfunctions/` | 云函数（实现期） |
| `data/catalog/` | 可选采集缓冲，非线上真源 |
| 云数据库 catalog_* | 知识点目录真源 |

## 实现纪律

一次只做 `tasks/todo.md` 下一张未完成 **Fxx**。今日页只插槽。密钥不进 git。禁止微信提交审核。

## 官方文档（S4+）

- 云开发：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html
- 云函数：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/functions/getting-started.html
- 数据库权限：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/database/permission.html
- 计费：https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/billing/price.html
