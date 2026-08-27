# 云函数 API（初稿，F00b）

**调用链：** 小程序封装的 `api.xxx()` → `wx.cloud.callFunction` → **普通云函数**。无自建服务器。

**禁止：** 页面直写 `wx.cloud.database`；客户端持模型 Key。

统一云函数返回：`{ ok: true, ... }` 或 `{ ok: false, error: "<code>" }`。

波次 A：各卡实现普通云函数，**云端测试**验收。波次 B：前端只经 `api` 封装调用，不把函数名写进各个页面。

## 已实现

| 云函数 | 说明 |
| --- | --- |
| `ping` | 健康检查。云端测试验收。 |
| `recognizeHomework` | F07 识图。默认模型中台 `glm-5v-turbo`（环境变量 `AI_GATEWAY_API_KEY`）。`textSmoke` 仍测云开发 `hy3`。`mock:true` 走样例。 |
| `catalogImport` | F00g 目录导入。`action`: `ping` / `importEdition` / `importTree`；分批 upsert `catalog_edition`、`catalog_lesson`，写 `catalog_sync_log`。见 `cloudfunctions/catalogImport/README.md`。 |
| `childProfile` | F01A/F02A 孩子档案。`action`: `create` / `list` / `update` / `setTextbook` / `setProgress` / `getTextbooks`。集合 `child` 按 `familyId` 多条。无 `familyId` 时用 `tmp:<OPENID>` 占位（F03A 替换）。见 `cloudfunctions/childProfile/README.md`。 |
| `catalogRead` | F02A 目录只读。`action`: `listEditions` / `listLessons`。读 `catalog_edition`、`catalog_lesson`。见 `cloudfunctions/catalogRead/README.md`。 |
| `familyBind` | F03A 家庭。`action`: `createFamily` / `createInvite` / `joinFamily` / `me`。集合 `family`。见 `cloudfunctions/familyBind/README.md`。 |
| `timer` | F04A 纸质计时。`action`: `start` / `pause` / `resume` / `end`。集合 `timer_session`。见 `cloudfunctions/timer/README.md`。 |
| `homeworkBatch` | F06A 作业批次。`action`: `create`。集合 `homework_batch`，`status` 待核对。见 `cloudfunctions/homeworkBatch/README.md`。 |
| `wrongItem` | F09A/F11/F12A/F13A。`action`: `create` / `list` / `updateLesson`。`create` 写 `wrong_item` 并对 `mastery` 调 `applyMasteryEvent({type:'wrong'})`。 |
| `practiceCompose` | F14/F14b。`childId`，错题课时 mock 3–8 题；`includeGaps:true` 可并入 1–3 道进度章探测题，总数≤10。 |
| `gapDetect` | F17。`childId` + `subjectKey`，只选 `progressChapter[subjectKey]` 对应章内无 mastery/wrong 的课时。 |
| `practiceSubmit` | F16A/F20A。`answers` + `durationSec`；对错打星；错回流；写 `practice_record`。 |
| `masteryOverview` | F18A/F24A。默认分科弱星/满星；`action: fullStarCount` 计非人工 5 星（`countsTowardFullStar`）。 |
| `examCompose` | F25。`fullStarCount<1` → `cannot_exam`；冷却中 → `exam_cooldown`；否则 15–25 题覆盖满星课时。 |
| `examSubmit` | F27A。`score≥80` `pass:true` 不写 wish；否则降星+回流并写 `child.examCooldownUntil` +3 天。 |

## 鉴权

云函数内 `cloud.getWXContext().OPENID`。`auth/me` 类能力做在家庭/档案云函数的 action 上，无需自建登录服。

## children（F01A / F02A `childProfile`）

`wx.cloud.callFunction({ name: "childProfile", data })`。`data.action`：`create` | `list` | `update` | `setTextbook` | `setProgress` | `getTextbooks`。

- **create：** `displayName`、`grade`（`七年级`/`八年级`/`九年级`）；可选 `familyId`。未传则 `familyId = "tmp:" + OPENID`（F03A 换成正式家庭，本期无邀请码）。
- **list：** 按解析后的 `familyId` 返回该家庭全部孩子（可多名）。`child` 含 `textbookBySubject`、`progressChapter`。
- **update：** `childId` + 要改的 `displayName`/`grade`；文档 `familyId` 必须与解析结果一致。
- **setTextbook：** `childId`、`subjectKey`（`math`/`chinese`/`english`/`morality`/`history`/`physics`/`chemistry`/`geography`/`biology`）、`editionId`。`editionId` 必须在 `catalog_edition` 查到，且学科标签与 `subjectKey` 一致。写入 `child.textbookBySubject[subjectKey]`（含 `editionId` 与册展示字段快照）。
- **setProgress：** `childId`、`subjectKey`、`chapterId`、`chapterLabel`。写入 `child.progressChapter[subjectKey] = { chapterId, chapterLabel }`。
- **getTextbooks：** `childId`。返回该孩的 `textbookBySubject` 与 `progressChapter`。

示例 JSON 见 `cloudfunctions/childProfile/README.md`。

## catalog 查询（F02A `catalogRead`）

`wx.cloud.callFunction({ name: "catalogRead", data })`。只读，不写目录集合。

- **listEditions：** 可选 `gradeLabel`、`subjectLabel`；可选 `skip`/`limit`（默认 0/100，上限 100）。只返回 `online: true`。
- **listLessons：** 必填 `editionId`；可选 `skip`/`limit`。按 `sortKey` 升序。

示例 JSON 见 `cloudfunctions/catalogRead/README.md`。

## family（F03A `familyBind`）

`wx.cloud.callFunction({ name: "familyBind", data })`。`data.action`：`createFamily` | `createInvite` | `joinFamily` | `me`。

- **createFamily：** 创建者 `role=parent`。一号一家庭。随后把该 OPENID 下 `tmp:<OPENID>` 的 `child.familyId` 改成 `family._id`。
- **createInvite：** 仅家长。写 `inviteCode`、`inviteExpireAt`（72h）、可选 `inviteChildId`（有则加入方为 `student` 且必须挂该孩子）。
- **joinFamily：** `inviteCode`。已在别的家庭则 `already_in_family`。学生必须有 `childId`（来自邀请上的 `inviteChildId`）。
- **me：** 返回当前家庭与本人 `role`。未加入则 `family: null`。

示例 JSON 见 `cloudfunctions/familyBind/README.md`。

## timer（F04A `timer`）

`wx.cloud.callFunction({ name: "timer", data })`。`data.action`：`start` | `pause` | `resume` | `end`。

- 按 `childId` 同时仅一段 `running`/`paused`。须选 `subject`。
- 结束（含超时自动结束）时墙钟 >4h → `forgotten: true`。
- 禁止监考：不读其它 App、不截屏、不用摄像头。

示例 JSON 见 `cloudfunctions/timer/README.md`。

## homework（F06A `homeworkBatch`）

`wx.cloud.callFunction({ name: "homeworkBatch", data })`。`data.action`：`create`。

- 入参：`fileIDs[]`、`subject`；可选 `date`、`source`、`childId`。
- `childId` 可省：该家庭仅 1 条 `child` 则默认；0 条或多条必须带 `childId`。
- 写入 `homework_batch`，`status` 为 `待核对`。

示例 JSON 见 `cloudfunctions/homeworkBatch/README.md`。

## wrongItem / 补练 / 综合卷

`wx.cloud.callFunction` 名称即函数名。集合不存在时函数内 `createCollection`。

- **wrongItem.create：** `childId, lessonId, stem, confidence`；可选 `errorType, fileID`。写 `wrong_item` 后对该课时 `applyMasteryEvent(..., {type:'wrong'})`。
- **wrongItem.list：** `childId`；可选 `subject`/`subjectKey`、`lessonId`。
- **wrongItem.updateLesson：** `wrongItemId`（或 `id`）+ `lessonId`。
- **practiceCompose：** `childId`；可选 `includeGaps:true`。
- **gapDetect：** `childId, subjectKey`。无进度章 → `no_progress_chapter`。
- **practiceSubmit：** `childId, answers[{questionId, lessonId, correct}], durationSec`。
- **masteryOverview：** `childId`；`action` 默认 `overview`，或 `fullStarCount`。
- **examCompose / examSubmit：** 见各函数 README 一行 JSON。及格不写 `wish`。

## 规划路径（未实现，名称锁定给后续卡）

| 方法 | 路径 | 卡 |
| --- | --- | --- |
| * | `/catalog/import` | F00g `catalogImport`：`importEdition` / `importTree` |
| GET | `/catalog/editions` `/catalog/lessons` | F02A 已实现为云函数 `catalogRead`（`listEditions`/`listLessons`） |
| * | `/children` | F01A 已实现为云函数 `childProfile`（`create`/`list`/`update`），小程序 `callFunction`，无独立 HTTP 路径 |
| PATCH | `/children/:id/textbooks` | F02A 已实现为 `childProfile`：`setTextbook` / `setProgress` / `getTextbooks` |
| POST | `/family/invite` `/family/join` | F03A 已实现为云函数 `familyBind` |
| POST | `/timer/start` `/pause` `/resume` `/end` | F04A 已实现为云函数 `timer` |
| POST | `/homework/batches` | F06A 已实现为云函数 `homeworkBatch` |
| POST | `/homework/recognize` | F07 |
| POST | `/wrong-items` GET `/wrong-items` PATCH `/wrong-items/:id/lesson` | F09A F12A F13A 已实现为云函数 `wrongItem` |
| POST | `/practice/compose` `/practice/submit` | F14 F16A 已实现 `practiceCompose` / `practiceSubmit` |
| POST | `/practice/gap-detect` | F17 已实现 `gapDetect` |
| GET | `/mastery/overview` | F18A/F24A 已实现 `masteryOverview` |
| POST | `/exam/compose` `/exam/submit` | F25 F27A 已实现 `examCompose` / `examSubmit` |

心愿相关路径（`/wish` `/wish/propose` `/wish/progress` `/wish/redeem`）**二期**，一期不实现。

上传：先调后端拿许可，禁止页面 `wx.cloud.uploadFile` 写业务目录。

## 集合名（云数据库，仅后端访问）

| 集合 | 说明 |
| --- | --- |
| family | members[{openid, role, childId?}]、inviteCode、inviteExpireAt、inviteChildId |
| child | familyId、显示名（displayName）、年级（grade）；`textbookBySubject[subjectKey]` 存册快照（含 editionId）；`progressChapter[subjectKey]` 存 `{ chapterId, chapterLabel }`。同一 familyId 多条 |
| catalog_edition | 版本+册、platformTag、syncAt |
| catalog_lesson | 一课时一条 |
| catalog_sync_log | 导入日志 |
| homework_batch | childId、images、status |
| wrong_item | childId、lessonId、confidence |
| mastery | childId、lessonId、stars |
| practice_record | childId、补练/综合卷 |
| timer_session | childId、计时 |
| wish | **二期** childId、主心愿 |

权限原则：小程序安全规则不开放业务集合给客户端 SDK。写入只在 `cloudfunctions/`。目录经云函数查询。

`catalog_edition`、`catalog_lesson`、`catalog_sync_log`：**客户端拒绝写**；仅 `catalogImport` 云函数写入。读目录走 `catalogRead`。
