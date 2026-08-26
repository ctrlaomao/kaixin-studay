# 云函数 API（初稿，F00b）

**调用链：** 小程序封装的 `api.xxx()` → `wx.cloud.callFunction` → **普通云函数**。无自建服务器。

**禁止：** 页面直写 `wx.cloud.database`；客户端持模型 Key。

统一云函数返回：`{ ok: true, ... }` 或 `{ ok: false, error: "<code>" }`。

波次 A：各卡实现普通云函数，**云端测试**验收。波次 B：前端只经 `api` 封装调用，不把函数名写进各个页面。

## 已实现

| 云函数 | 说明 |
| --- | --- |
| `ping` | 健康检查。云端测试验收。 |
| `recognizeHomework` | F07 识图。默认外部 DeepSeek `deepseek-v4-flash-vision-exp`（环境变量 `DEEPSEEK_API_KEY`）。`textSmoke` 仍测云开发 `hy3`。`mock:true` 走样例。 |

## 鉴权

云函数内 `cloud.getWXContext().OPENID`。`auth/me` 类能力做在家庭/档案云函数的 action 上，无需自建登录服。

## 规划路径（未实现，名称锁定给后续卡）

| 方法 | 路径 | 卡 |
| --- | --- | --- |
| * | `/catalog/import` | F00g 导入，非小程序日常调用 |
| GET | `/catalog/editions` `/catalog/lessons` | F00g/F00f |
| * | `/children` | F01A |
| PATCH | `/children/:id/textbooks` | F02A |
| POST | `/family/invite` `/family/join` | F03A |
| POST | `/timer/start` `/pause` `/resume` `/end` | F04A |
| POST | `/homework/batches` | F06A |
| POST | `/homework/recognize` | F07 |
| POST | `/wrong-items` GET `/wrong-items` PATCH `/wrong-items/:id/lesson` | F09A F12A F13A |
| POST | `/practice/compose` `/practice/submit` | F14 F16A |
| POST | `/practice/gap-detect` | F17 |
| GET | `/mastery/overview` | F18A |
| POST | `/wish` `/wish/propose` GET `/wish/progress` POST `/wish/redeem` | F22–F28 |
| POST | `/exam/compose` `/exam/submit` | F25 F27A |

上传：先调后端拿许可，禁止页面 `wx.cloud.uploadFile` 写业务目录。

## 集合名（云数据库，仅后端访问）

| 集合 | 说明 |
| --- | --- |
| family | members[{openid, role, childId?}]、inviteCode、inviteExpireAt、inviteChildId |
| child | familyId、显示名、年级、textbookBySubject、progressChapter |
| catalog_edition | 版本+册、platformTag、syncAt |
| catalog_lesson | 一课时一条 |
| catalog_sync_log | 导入日志 |
| homework_batch | childId、images、status |
| wrong_item | childId、lessonId、confidence |
| mastery | childId、lessonId、stars |
| practice_record | childId、补练/综合卷 |
| timer_session | childId、计时 |
| wish | childId、主心愿 |

权限原则：小程序安全规则不开放业务集合给客户端 SDK。写入只在 `cloudfunctions/`。目录经云函数查询。
