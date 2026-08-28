# recognizeHomework（F07 识图）

识图走 **模型中台** OpenAI 兼容接口（不走云开发托管多模态、不走 DeepSeek 官方）。  
默认模型：智谱 **`glm-5v-turbo`**。  
默认地址：`http://119.45.25.177:3000/v1/chat/completions`。

**Key 只放云函数环境变量，禁止进 git、禁止前端持 Key。**  
文本探测仍可用已开通的云开发 `hy3`。

本卡调用方可直接传 `fileID` / `fileIDs`，或公网 `imageUrl` / `imageBase64`。  
`fileID` 由云函数下载后压成约 60KB JPEG，再以 `data:` base64 发给中台。中台 JSON 默认大约 100KB（超出会 413）；微信临时链中台往往拉不到（会一直等到 50 秒超时）。部署时需 **云端安装依赖**（含 `jimp`）。

## 密钥与地址

1. 开发者工具 → 云函数 `recognizeHomework` → 配置 / 环境变量：
   - **必填** `AI_GATEWAY_API_KEY`（中台 Bearer Token，如 `sk-chat-…`）
   - 兼容：若未设 `AI_GATEWAY_API_KEY`，会读旧变量 `DEEPSEEK_API_KEY`
   - 可选 `AI_GATEWAY_BASE_URL`（默认 `http://119.45.25.177:3000/v1`，不要带末尾 `/chat/completions`）
   - 可选 `VISION_MODEL`（默认 `glm-5v-turbo`）。**不要设 `glm-4v-turbo`**：TokenHub 常跑满 120 秒，云函数 60 秒会先断开，中台记 `chat_failed` 客户端断开/上游超时。
2. 保存后重新上传并部署。不要把 Key 写进代码或 `config.json`。

识图不能由小程序同步等待（客户端默认 3 秒会掐死云函数）。拍照只调用 `action=start` 建任务；**定时触发器每分钟** `drain` 在云端跑 `run`。

**必须把线上超时改成 60 秒。** 平台默认是 3 秒；只改本地 `config.json` 或只上传代码，控制台仍可能是 3 秒。定时器也会被掐，日志会出现 `Invoking task timed out after 3 seconds`，且停在 `[kx-ds] http_begin` 之后、没有 `http_end`。

改法（任选其一，改完再部署一次核对）：

1. 微信开发者工具 → 云开发 → 云函数 → `recognizeHomework` → 版本与配置 / 配置 → **超时时间 60 秒** → 保存。
2. 对函数右键「上传并部署：云端安装依赖」，确认 `config.json` 的 `"timeout": 60` 一并上传（不要只上传文件）。

部署后看 `[kx-drain] invoke` 的 `remainMs`：应接近 60000，而不是 3000。

部署后若无触发器：云函数 → 触发器 → 定时触发，Cron `0 * * * * * *`（每分钟），指向本函数。

云开发出网需能访问该中台 IP:3000。无 Key 且非 mock 时返回 `error: "missing_ai_key"`。

## 契约（补充；不改 api.md）

### 入参

| 字段 | 说明 |
| --- | --- |
| `action` | `start` 建任务立刻返回 `jobId`；`poll` 查状态；`run` 后台跑模型（由 start/客户端触发，不必等返回） |
| `mock` | `true` 返回样例，不调模型、不需 Key |
| `textSmoke` | `true` 走云开发 hy3 文本探测 |
| `smoke` | `true` 只描述图片（便宜），不抽题 |
| `fileID` | 单个云存储 fileID |
| `fileIDs` | 云存储 fileID 数组（可与 `fileID` 同时给） |
| `imageUrl` | 公网图片 URL |
| `imageBase64` | 内联图 |
| `model` | 可选，默认 `glm-5v-turbo` |

### 成功（作业 JSON，非 smoke）

```json
{
  "ok": true,
  "mocked": false,
  "provider": "glm",
  "model": "glm-5v-turbo",
  "questions": [
    {
      "stem": "题干",
      "lessonHint": "建议课时名，可为空字符串",
      "lessonCandidates": ["建议课时名"],
      "confidence": 0.0,
      "isWrong": true
    }
  ],
  "parseOk": true
}
```

`mock: true` 同样返回上述 `questions[]` 结构，且 `mocked: true`。

解析失败（模型返回散文或非法 JSON）：

```json
{
  "ok": false,
  "error": "parse_failed",
  "message": "模型未返回合法 JSON（需含 questions 数组）",
  "preview": "截断原文"
}
```

不把整段散文当作题目返回。

其它错误：`need_image`、`missing_ai_key`、`image_too_large`、`ai_failed`。

## 云端测试

mock（不消耗 Token、不需图）：

```json
{ "mock": true }
```

期望：`ok: true`，`mocked: true`，`questions[0]` 含 `stem`、`lessonHint`、`confidence`。

文本探测：

```json
{ "textSmoke": true }
```

识图 smoke：

```json
{ "imageUrl": "https://公网可访问的作业图.jpg", "smoke": true }
```

或：

```json
{ "fileID": "cloud://你的环境/homework/xxx.jpg", "smoke": true }
```

```json
{ "fileIDs": ["cloud://你的环境/homework/xxx.jpg"] }
```

去掉 `smoke` 则抽作业 JSON；解析失败为 `parse_failed`，不是散文当题目。
