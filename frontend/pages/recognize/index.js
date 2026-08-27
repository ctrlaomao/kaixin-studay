const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { questions: [], mocked: false, msg: "", loading: true, batchId: "" },
  timer: null,
  onLoad(q) {
    this.setData({ batchId: (q && q.batchId) || "" });
  },
  onShow() {
    this.load();
  },
  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },
  async load() {
    const batchId = this.data.batchId;
    if (!batchId) {
      const questions = (app.globalData.lastQuestions || []).map((item, idx) => ({ ...item, idx }));
      this.setData({ questions, mocked: !!app.globalData.lastMocked, loading: false });
      return;
    }
    const r = await api.homework.getBatch({ batchId });
    if (!r || !r.ok) {
      this.setData({ loading: false, msg: (r && r.error) || "记录不存在" });
      return;
    }
    const status = r.batch && r.batch.jobStatus;
    const questions = (r.questions || []).map((item, idx) => ({ ...item, idx }));
    this.setData({
      questions,
      mocked: !!r.mocked,
      loading: false,
      msg: status === "error" ? r.jobError || "识别失败" : status === "done" ? "" : "识别中，可下拉刷新",
    });
  },
  async save() {
    const childId = app.globalData.childId;
    if (!childId) {
      wx.showToast({ title: "无孩子档案", icon: "none" });
      return;
    }
    const wrongs = this.data.questions.filter((q) => q.isWrong !== false);
    if (!wrongs.length) {
      this.setData({ msg: "没有判错的题" });
      return;
    }
    for (const q of wrongs) {
      const pending = !!q.needConfirm || !q.lessonId;
      await api.wrong.create({
        childId,
        lessonId: q.lessonId || "",
        stem: q.stem,
        confidence: q.confidence,
        subject: q.subject,
        subjectKey: q.subjectKey,
        lessonLabel: q.lessonLabel || q.lessonHint,
        grade: q.grade,
        volume: q.volume,
        pending,
        errorType: pending ? "pending" : "auto",
      });
    }
    this.setData({ msg: "已记入 " + wrongs.length + " 道错题" });
    wx.showToast({ title: "已记入错题本" });
    setTimeout(() => wx.switchTab({ url: "/pages/wrongbook/index" }), 400);
  },
});
