const api = require("../../utils/api.js");
const app = getApp();

function statusText(jobStatus) {
  if (jobStatus === "done") return "已完成";
  if (jobStatus === "error") return "失败";
  if (jobStatus === "running") return "识别中";
  if (jobStatus === "pending" || jobStatus === "queued") return "排队中";
  return "处理中";
}

function mapRecord(b) {
  const n = b.fileCount || 0;
  const q = b.questionCount || 0;
  const t = (b.createdAt || "").replace("T", " ").slice(0, 16);
  return {
    ...b,
    title: t || "检查记录",
    sub: n + " 张图" + (q ? " · " + q + " 题" : "") + (b.jobError ? " · " + b.jobError : ""),
    statusText: statusText(b.jobStatus),
  };
}

Page({
  data: { busy: false, msg: "", records: [] },
  refreshTimers: [],
  onShow() {
    this.boot();
  },
  onHide() {
    this.clearRefreshTimers();
  },
  onUnload() {
    this.clearRefreshTimers();
  },
  onPullDownRefresh() {
    this.loadRecords().then(() => wx.stopPullDownRefresh());
  },
  clearRefreshTimers() {
    (this.refreshTimers || []).forEach((id) => clearTimeout(id));
    this.refreshTimers = [];
  },
  scheduleStatusRefresh() {
    this.clearRefreshTimers();
    [8000, 20000, 40000].forEach((ms) => {
      this.refreshTimers.push(setTimeout(() => this.loadRecords(), ms));
    });
  },
  async boot() {
    const r = await api.child.ensureSolo();
    if (r && r.ok && r.child && r.child.id) {
      app.globalData.childId = r.child.id;
    }
    if (!app.globalData.childId) {
      this.setData({ msg: r && r.error ? String(r.error) : "无法创建默认孩子" });
      return;
    }
    await this.loadRecords();
  },
  async loadRecords() {
    const childId = app.globalData.childId;
    if (!childId) return;
    const r = await api.homework.listBatches({ childId });
    const records = ((r && r.batches) || []).map(mapRecord);
    this.setData({ records });
  },
  openRecord(e) {
    const id = e.currentTarget.dataset.id;
    const rec = (this.data.records || []).find((x) => x.id === id);
    if (!rec) return;
    if (rec.jobStatus === "error") {
      wx.showToast({ title: rec.jobError || "识别失败，不会重试", icon: "none" });
      return;
    }
    if (rec.jobStatus !== "done") {
      wx.showToast({ title: "还在识别，可下拉刷新", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/recognize/index?batchId=" + id });
  },
  async shoot() {
    if (this.data.busy) return;
    if (!app.globalData.childId) {
      await this.boot();
    }
    const childId = app.globalData.childId;
    if (!childId) return;
    wx.chooseMedia({
      count: 6,
      mediaType: ["image"],
      success: async (res) => {
        this.setData({ busy: true, msg: "上传中…" });
        try {
          const fileIDs = [];
          for (const f of res.tempFiles || []) {
            const up = await wx.cloud.uploadFile({
              cloudPath: `homework/${childId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`,
              filePath: f.tempFilePath,
            });
            fileIDs.push(up.fileID);
          }
          const batch = await api.homework.createBatch({ childId, fileIDs });
          if (!batch || !batch.ok || !batch.batch) {
            this.setData({ busy: false, msg: "建记录失败 " + ((batch && batch.error) || "") });
            return;
          }
          const batchId = batch.batch.id;
          this.setData({ msg: "正在识别，请稍候（可能要一分钟）…" });
          const started = await api.homework.recognizeStart({ fileIDs, childId, batchId });
          if (!started || !started.ok || !started.jobId) {
            this.setData({ busy: false, msg: "无法创建识别任务 " + ((started && started.error) || "") });
            return;
          }
          this.setData({ busy: false, msg: "已提交，完成后可点开。也可下拉刷新状态。" });
          await this.loadRecords();
          this.scheduleStatusRefresh();
        } catch (e) {
          this.setData({ busy: false, msg: String((e && e.errMsg) || e) });
        }
      },
    });
  },
});
