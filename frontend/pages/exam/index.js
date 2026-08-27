const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { questions: [], msg: "" },
  async compose() {
    const r = await api.exam.compose({ childId: app.globalData.childId });
    this.setData({ questions: (r && r.questions) || [], msg: r.ok ? "" : JSON.stringify(r) });
  },
  async submit() {
    const answers = this.data.questions.map((q) => ({
      questionId: q.questionId,
      lessonId: q.lessonId,
      correct: true,
    }));
    const r = await api.exam.submit({
      childId: app.globalData.childId,
      answers,
      durationSec: 60,
    });
    this.setData({ msg: JSON.stringify(r) });
  },
});
