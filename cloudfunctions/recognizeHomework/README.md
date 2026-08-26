# recognizeHomework（F07 识图）

识图走 **外部 DeepSeek 官方 API**（不走云开发托管多模态，避免 Token 包价格）。  
文本探测仍可用已开通的云开发 `hy3`。

官方识图：https://api-docs.deepseek.com/guides/vision  
型号：`deepseek-v4-flash-vision-exp`  
接口：`https://api.deepseek.com/chat/completions`

## 密钥（禁止进 git）

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com) 创建 API Key。
2. 开发者工具 → 云函数 `recognizeHomework` → **配置 / 环境变量**，增加：
   - `DEEPSEEK_API_KEY` = 你的 Key  
   可选：`DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）
3. 保存后 **重新上传并部署**（改环境变量通常要再部署一次才生效）。

无 Key 时识图返回 `missing_deepseek_key`。`mock: true` 仍可用。

## 云端测试

文本（云开发 hy3，确认云函数本身正常）：

```json
{ "textSmoke": true }
```

识图（DeepSeek 视觉实验档）：

```json
{ "imageUrl": "https://公网可访问的作业图.jpg", "smoke": true }
```

或云存储 `fileID`（函数转 Base64 再发给 DeepSeek）：

```json
{ "fileID": "cloud://你的环境/homework/xxx.jpg", "smoke": true }
```

`smoke: true` 只描述图片，并关掉思考、图片 `detail: low`，便宜且快。去掉 `smoke` 则抽作业 JSON。

成功：`ok: true`，`provider: "deepseek"`，`mocked: false`。
