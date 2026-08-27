# catalog-sync（F00e）

从国家中小学智慧教育平台「同步课堂」采集 **目录元数据**。  
默认按 **赤峰家庭教材对照**：七八九年级、每科仅指定版本（见 `lib/policy.mjs`）。  
**不下载** 课件、视频、PDF。

同一册分 **新教材 / 旧教材** Tab，以及 **上册 / 下册**，均分别采集。  
新教材走 `national_lesson/.../part_100.json`；旧教材走 `course_relative_infos` → `fulls.json`。

英语：只要「科普版 / 仁爱」，**排除外研社版**。数/理/化/地/生：人教版（排除人教澳门版）。语/史/道法：统编或人教部编。

## 运行

```bash
cd scripts/catalog-sync

# 只列出将采集的册次（含新旧）
node sync.mjs --list-versions

node sync.mjs --delay 250

node validate.mjs ../../data/catalog/tree-math-*.json
```
