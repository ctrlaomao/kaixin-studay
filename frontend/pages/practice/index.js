const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { questions: [], marks: {}, msg: "", t0: 0 },
  async compose() {
    const r = await api.practice.compose({
      childId: app.globalData.childId,
      includeGaps: true,
    });
    this.setData({
      questions: (r && r.questions) || [],
      marks: {},
      t0: Date.now(),
      msg: r.ok ? "" : JSON.stringify(r),
    });
  },
  mark(e) {
    const marks = { ...this.data.marks, [e.currentTarget.dataset.id]: e.detail.value };
    this.setData({ marks });
  },
  async submit() {
    const answers = this.data.questions.map((q) => ({
      questionId: q.questionId,
      lessonId: q.lessonId,
      correct: !!this.data.marks[q.questionId],
    }));
    const r = await api.practice.submit({
      childId: app.globalData.childId,
      answers,
      durationSec: Math.round((Date.now() - this.data.t0) / 1000),
    });
    this.setData({ msg: JSON.stringify(r) });
  },
});
