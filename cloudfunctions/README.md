# 云函数（即后端）

微信云开发：小程序 `callFunction` 调这里的普通云函数。**不自建服务器。** 见 `doc/spec/ADR-005-前端只走HTTP后端.md`。

`project.config.json` 的 `cloudfunctionRoot` 为本目录（官方约定与开发者工具一致）。

禁止提交审核。密钥只放云函数环境变量。

## ping

对 `cloudfunctions/ping` 右键 → **上传并部署：云端安装依赖** → **云端测试**，应返回 `"ok": true`。

## recognizeHomework

识图。部署与云端测试见 `cloudfunctions/recognizeHomework/README.md`。识图用 DeepSeek，Key 只放云函数环境变量。
