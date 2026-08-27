# catalogImport（F00g）

将 F00e 缓冲 JSON **分批 upsert** 到云数据库：

- `catalog_edition` — 一版本+册+新旧教材一条
- `catalog_lesson` — 一课时一条
- `catalog_sync_log` — 导入日志

**权限：** 目录集合对小程序 SDK 只读；写入仅通过本云函数。

## 部署并导入（推荐）

1. 把最新缓冲拷进函数目录（已 gitignore，不会进仓库）：

```bash
mkdir cloudfunctions\catalogImport\trees
copy data\catalog\tree-*-2026-08-27T02-33-33-640Z.json cloudfunctions\catalogImport\trees\
```

2. 微信开发者工具对 `catalogImport` → **上传并部署：云端安装依赖**（须带上 `trees/`）。函数会尝试 `createCollection` 建 `catalog_edition` / `catalog_lesson` / `catalog_sync_log`；若仍报集合不存在，在云开发控制台手动新建这三个集合后再测。
3. 云端测试，每次 1 册，改 `fileIndex` / `editionStart` 直到 `allFilesDone: true`：

```json
{ "action": "importBundled", "fileIndex": 0 }
```

一次导入该学科全部册。`fileIndex` 从 0 加到 8（共 9 个学科文件）。全部完成后：

```json
{ "action": "stats" }
```

应看到约 **75** 条 `catalog_edition`（英语旧教材七年级下册未采到，少 1 条）。

## 本机 CLI（需 `tcb login`）

```bash
npx --yes --package @cloudbase/cli tcb login
npx --yes --package @cloudbase/cli tcb env use cloudbase-d7ggaqrps717e5be9
npx --yes --package @cloudbase/cli tcb fn deploy catalogImport -e cloudbase-d7ggaqrps717e5be9
node scripts/catalog-sync/import-cloud.mjs --stamp 2026-08-27T02-33-33-640Z
```
