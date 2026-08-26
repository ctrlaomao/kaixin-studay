# catalogImport（F00g）

将 F00e 缓冲 JSON **分批 upsert** 到云数据库：

- `catalog_edition` — 一版本+册一条
- `catalog_lesson` — 一课时一条（打星绑定 `lessonId`）
- `catalog_sync_log` — 导入日志

**权限：** 目录集合对小程序 SDK 只读；写入仅通过本云函数（控制台配置安全规则拒绝客户端写）。

## 部署

开发者工具 → `cloudfunctions/catalogImport` → 上传并部署：云端安装依赖。

## 云端测试

健康检查：

```json
{ "action": "ping" }
```

导入单册（从 `data/catalog/tree-math-*.json` 复制 **一个** `editions[0]` 对象到 `edition`）：

```json
{
  "action": "importEdition",
  "edition": { "...": "见缓冲 JSON 中单条 edition，含 chapters" },
  "sourceFile": "tree-math-sample"
}
```

若课时较多，分批：

```json
{
  "action": "importEdition",
  "edition": { "...": "同上" },
  "lessonOffset": 25,
  "lessonBatchSize": 25
}
```

整文件分批（每次 1 册）：

```json
{
  "action": "importTree",
  "tree": { "editions": [ "..."] },
  "editionStart": 0,
  "editionLimit": 1,
  "sourceFile": "tree-math-..."
}
```

`editionStart` 递增直至 `treeDone: true`。每批完成后在控制台查 `catalog_lesson` 应有课时文档。

## 本地辅助（Node ≥ 18）

从缓冲 JSON 生成云端测试用单册 payload（输出到 stdout，手动粘贴控制台）：

```bash
export PATH="/path/to/node22/bin:$PATH"
node scripts/catalog-sync/export-edition.mjs data/catalog/tree-math-*.json 0
```
