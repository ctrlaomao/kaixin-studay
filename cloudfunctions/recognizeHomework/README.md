# recognizeHomework（F07 识图）

识图走 **外部 DeepSeek 官方 API**（不走云开发托管多模态）。Key 只放云函数环境变量 `DEEPSEEK_API_KEY`，禁止进 git、禁止前端持 Key。  
文本探测仍可用已开通的云开发 `hy3`。

官方识图：https://api-docs.deepseek.com/guides/vision  
型号：`deepseek-v4-flash-vision-exp`  
接口：`https://api.deepseek.com/chat/completions`

本卡 **未接线 F06A `homeworkBatch`**。调用方可直接传 `fileID` / `fileIDs`，或公网 `imageUrl` / `imageBase64`。

## 密钥

1. [DeepSeek 开放平台](https://platform.deepseek.com) 创建 API Key。
2. 开发者工具 → 云函数 `recognizeHomework` → 配置 / 环境变量：`DEEPSEEK_API_KEY`  
   可选：`DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）
3. 保存后重新上传并部署。

无 Key 且非 mock 时识图返回 `error: "missing_deepseek_key"`。

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
| `model` | 可选，默认 `deepseek-v4-flash-vision-exp` |

### 成功（作业 JSON，非 smoke）

```json
{
  "ok": true,
  "mocked": false,
  "provider": "deepseek",
  "model": "deepseek-v4-flash-vision-exp",
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

其它错误：`need_image`、`missing_deepseek_key`、`image_too_large`、`ai_failed`。

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
