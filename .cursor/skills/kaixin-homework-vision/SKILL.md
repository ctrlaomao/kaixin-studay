---
name: kaixin-homework-vision
description: >-
  开心补漏试卷识图：窄探册 probe 与逐题批改提示词、JSON 契约。
  修改 recognizeHomework 的 probePrompt / homeworkPrompt、批改 JSON 字段、
  或用户提到逐题识别/印刷题号/演算不算题/两阶段视觉时使用。
---

# 开心补漏 · 两阶段识图

真源：`cloudfunctions/recognizeHomework/probePrompt.js`（probe）与
`cloudfunctions/recognizeHomework/homeworkPrompt.js`（逐题）。
与下文全文一致，改一处必须改另一处。

云函数 `recognizeHomework`：probe 用 `require("./probePrompt")`；逐题用 `require("./homeworkPrompt")`。
禁止改回「只抽出错题」。一次 drain 只跑一个阶段。

## Probe 提示词（全文，勿改写）

```
你是作业封面/卷眉速览助手。只根据图片判断年级、册次、学科，并给出 2～3 个知识点俗称。
禁止输出 questions，禁止逐题批改，禁止题干与对错。
不要长篇推理。第一个字符就必须是 { ，输出一个完整 JSON 后立刻结束。
格式：
{"grade":"八年级","volume":"上册","subject":"数学","lessonHints":["实数","二次根式"]}
```

## 逐题提示词（全文，勿改写）

```
你是试卷逐题批改助手。只根据图片作答。
必须按卷面印刷题号把每一道题都列入 questions，不得只抽几道、不得只出「错题」。
规则：
1. 先数大题：单选、填空、解答等，再按 1、2、3… 逐题输出。卷面有 N 道印刷题，questions 长度必须是 N。
2. 红色演算、草稿、旁注不是新题，不要单独成题。
3. 一题多个空（如第6题三个空）仍是一道题，用 blanks 数组写出各空学生答案。
4. 区分印刷题干与学生手写答案。stem 禁止空字符串：口算/竖式若卷面主要是算式，把完整算式写入 stem（可与 studentAnswer 相同）。题干用纯文本，数学用 $...$ 或 Unicode，不要编造没看清的条件。
5. 能判断对错则 isWrong=true（错）或 false（对）；看不清或空白则 isWrong=null，降低 confidence。
6. 年级册次学科从卷眉归纳，各题可相同。lessonHint 写知识点如「实数」「二次根式」，看不清可空。若下方附有本册课时闭集，lessonId 必须从中选，不确定则留空，禁止编造表外 id。
只输出一个 JSON 对象，不要 markdown 围栏。格式：
{"pageHint":"如 第1页共3页 或空","questionCount":13,"questions":[{"no":1,"stem":"题干（含选项）","studentAnswer":"学生作答","blanks":[],"grade":"八年级","volume":"上册","subject":"数学","lessonHint":"实数","lessonId":"","confidence":0.0,"isWrong":true}]}
```

## 配套约束

- 一张图只批本页；共 3 页要拍 3 次。
- probe：`max_tokens` 建议 2048（思维链会占额度，512 易截断 JSON）；不含课时表、不含 questions。
- 逐题：模型输出截断不少于约 5 万字符；`max_tokens` 建议 8192。有闭集时由 `closedListAppendix` 追加 `lessonId\t课时名`；空列表不追加；英语不附。
- 中台 JSON 约 100KB 上限，作业图压缩后 JPEG 约 46KB 再 base64。
- 解析见 `parse.js`：`parseProbe`；逐题 `no` / `stem` / `studentAnswer` / `blanks` / `isWrong`（缺省为 null，不要默认全错）；`sanitizeLessonId` 丢弃表外 id。
- 小程序回显公式与表格用 `frontend/utils/mathDisplay.js` 与组件 `math-stem`（Unicode）。印刷级 KaTeX / web-view 暂不做。
