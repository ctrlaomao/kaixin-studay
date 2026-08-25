# Capability Map: 开心补漏

| Module id | Responsibility | Depends on |
| --- | --- | --- |
| identity-child | 孩子档案、家庭 openid 绑定 | — |
| catalog | 采集目录元数据并 **写入云数据库**；按平台层级展示 | identity-child |
| timer | 纸质作业计时 | identity-child |
| homework-capture | 拍照上传、批次、识图、核对入库 | catalog |
| mastery | 打星纯函数、mastery 读写 | homework-capture |
| practice | 待练组卷、答题、交卷、遗漏探测、在线时长 | mastery, catalog |
| wish-exam | 心愿、综合卷、兑现 | mastery, practice |
| shell | Tab 空壳、今日待办聚合、体验版交付 | identity-child |

Build order: shell(F00) 与 identity-child 并行于骨架之后 → catalog → timer 可与 homework-capture 分文件并行但禁止同文件 → mastery(F10 可提前) → practice → wish-exam。

索引：总规格 [`SPEC.md`](SPEC.md)；实现卡 [`../plan/功能任务清单.md`](../plan/功能任务清单.md)。
