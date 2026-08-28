const api = require("../../utils/api.js");
const { formatQuestionDisplay } = require("../../utils/mathDisplay");
const app = getApp();

function withDisplay(item, idx) {
  const d = formatQuestionDisplay(item);
  return { ...item, idx, answerText: d.answerText };
}

Page({
    data: { questions: [], mocked: false, msg: "", loading: true, batchId: "", photos: [] },
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
      const questions = (app.globalData.lastQuestions || []).map(withDisplay);
      this.setData({ questions, mocked: !!app.globalData.lastMocked, loading: false, photos: [] });
      return;
    }
    const r = await api.homework.getBatch({ batchId });
    if (!r || !r.ok) {
      this.setData({ loading: false, msg: (r && r.error) || "记录不存在" });
      return;
    }
    const status = r.batch && r.batch.jobStatus;
    const questions = (r.questions || []).map(withDisplay);
    const photos = (r.batch && r.batch.fileIDs) || [];
    let msg = "";
    if (status === "error") msg = r.jobError || "识别失败";
    else if (status !== "done") msg = "识别中，可下拉刷新";
    else if (!questions.length) msg = "识别完成但没有题目，请下拉刷新；仍没有则看云库 recognize_job.questions";
    this.setData({
      questions,
      photos,
      mocked: !!r.mocked,
      loading: false,
      msg,
    });
  },
  async save() {
    const childId = app.globalData.childId;
    if (!childId) {
      wx.showToast({ title: "无孩子档案", icon: "none" });
      return;
    }
    const wrongs = this.data.questions.filter((q) => q.isWrong === true);
    if (!wrongs.length) {
      this.setData({ msg: "没有判错的题" });
      return;
    }
    let added = 0;
    let skipped = 0;
    for (const q of wrongs) {
      const pending = !!q.needConfirm || !q.lessonId;
      const r = await api.wrong.create({
        childId,
        lessonId: q.lessonId || "",
        stem: q.stem,
        no: q.no || 0,
        confidence: q.confidence,
        subject: q.subject,
        subjectKey: q.subjectKey,
        lessonLabel: q.lessonLabel || q.lessonHint,
        grade: q.grade,
        volume: q.volume,
        pending,
        errorType: pending ? "pending" : "auto",
        fileID: (this.data.photos || [])[0] || "",
        fileIDs: this.data.photos || [],
      });
      if (r && r.skipped) skipped += 1;
      else if (r && r.ok) added += 1;
    }
    const msg =
      skipped && added
        ? "已记入 " + added + " 道，" + skipped + " 道已在错题本"
        : skipped
          ? skipped + " 道已在错题本，未重复添加"
          : "已记入 " + added + " 道错题";
    this.setData({ msg });
    wx.showToast({ title: skipped && !added ? "未重复添加" : "已记入错题本", icon: "none" });
    setTimeout(() => wx.switchTab({ url: "/pages/wrongbook/index" }), 400);
  },
  previewPhoto(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const photos = this.data.photos || [];
    if (!photos.length) return;
    wx.previewImage({ current: photos[idx] || photos[0], urls: photos });
  },
});
