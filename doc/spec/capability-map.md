# Capability Map: 开心补漏

| Module id | Responsibility | Depends on |
| --- | --- | --- |
| identity-child | 多名孩子档案；微信号加入家庭；openid 角色；当前孩子解析 | — |
| catalog | 采集目录元数据并 **写入云数据库**；按平台层级展示 | identity-child |
| timer | 纸质作业计时 | identity-child |
| homework-capture | 拍照上传、批次、识图、核对入库 | catalog |
| mastery | 打星纯函数、mastery 读写 | homework-capture |
| practice | 待练组卷、答题、交卷、遗漏探测、在线时长 | mastery, catalog |
| exam | 满星后综合卷检验（一期无兑现） | mastery, practice |
| wish-redeem | **二期** 心愿单、许愿、家长兑现 | exam |
| shell | Tab 空壳、今日待办聚合、体验版交付 | identity-child |

Build order: 波次 A：F00 云侧 → identity（含 **F03 家庭角色，必做**）→ catalog → timer / homework → mastery → practice → exam。波次 B 再挂页面。兑心愿二期。

索引：总规格 [`SPEC.md`](SPEC.md)；实现卡 [`../plan/功能任务清单.md`](../plan/功能任务清单.md)。
