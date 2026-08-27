# 云函数（即后端）

微信云开发：小程序 `callFunction` 调这里的普通云函数。**不自建服务器。** 见 `doc/spec/ADR-005-前端只走HTTP后端.md`。

`project.config.json` 的 `cloudfunctionRoot` 为本目录（官方约定与开发者工具一致）。

禁止提交审核。密钥只放云函数环境变量。

## ping

对 `cloudfunctions/ping` 右键 → **上传并部署：云端安装依赖** → **云端测试**，应返回 `"ok": true`。

## recognizeHomework

识图。部署与云端测试见 `cloudfunctions/recognizeHomework/README.md`。识图用 DeepSeek，Key 只放云函数环境变量。

## catalogImport

目录分批导入。部署与云端测试见 `cloudfunctions/catalogImport/README.md`。导入前把最新 `data/catalog/tree-*.json` 拷到 `cloudfunctions/catalogImport/trees/`，部署后云端测试 `importBundled`。

## childProfile

孩子档案（F01A / F02A）。`action`: `create` / `list` / `update` / `setTextbook` / `setProgress` / `getTextbooks`。集合 `child`，同一 `familyId` 可多条。无 `familyId` 时写入 `tmp:<OPENID>`，F03A 再换成正式家庭。云端测试 JSON 见 `cloudfunctions/childProfile/README.md`。

## catalogRead

目录只读查询（F02A）。`action`: `listEditions` / `listLessons`。读 `catalog_edition`、`catalog_lesson`。见 `cloudfunctions/catalogRead/README.md`。

## familyBind

家庭成员（F03A）。`action`: `createFamily` / `createInvite` / `joinFamily` / `me`。集合 `family`。云端测试 JSON 见 `cloudfunctions/familyBind/README.md`。

## timer

纸质作业计时（F04A）。`action`: `start` / `pause` / `resume` / `end`。集合 `timer_session`。禁止监考。云端测试 JSON 见 `cloudfunctions/timer/README.md`。

## homeworkBatch

作业批次（F06A）。`action`: `create`。`fileIDs` + 学科；单孩子可省 `childId`。`status` 待核对。云端测试 JSON 见 `cloudfunctions/homeworkBatch/README.md`。

## 错题 / 补练 / 综合卷

打星源文件：`_common/masteryStars.js`。微信部署不带上级目录，已复制到 `wrongItem`、`practiceSubmit`、`examSubmit`，函数内 `require("./masteryStars")`。

各函数 README 含一行云端测试 JSON：`wrongItem`、`practiceCompose`、`gapDetect`、`practiceSubmit`、`masteryOverview`、`examCompose`、`examSubmit`。
