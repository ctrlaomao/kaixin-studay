const api = require("../../utils/api.js");
const app = getApp();

function statusText(jobStatus) {
  if (jobStatus === "done") return "已完成";
  if (jobStatus === "error") return "失败";
  if (jobStatus === "running") return "识别中";
  if (jobStatus === "pending" || jobStatus === "queued") return "排队中";
  return "处理中";
}

function canOpenDetail(rec) {
  if (!rec) return false;
  if (rec.jobStatus === "error") return false;
  if (rec.jobStatus === "done") return true;
  if (Number(rec.questionCount) > 0) return true;
  return false;
}

function isExhausted(b) {
  if (b && b.canRetry) return false;
  if (!b) return false;
  if (b.jobStatus === "error") return true;
  if (b.jobStatus === "done" && !(Number(b.questionCount) > 0)) return true;
  return false;
}

function mapRecord(b) {
  const n = b.fileCount || 0;
  const q = b.questionCount || 0;
  const t = (b.createdAt || "").replace("T", " ").slice(0, 16);
  let sub = n + " 张图" + (q ? " · " + q + " 题" : "") + (b.jobError ? " · " + b.jobError : "");
  if (isExhausted(b)) sub += " · 请重拍";
  return {
    ...b,
    title: t || "检查记录",
    sub,
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
    const idx = Number(e.currentTarget.dataset.index);
    const rec = (this.data.records || [])[idx];
    if (!rec) return;
    if (rec.jobStatus === "error") {
      wx.showToast({
        title: rec.canRetry ? rec.jobError || "识别失败" : "请重拍",
        icon: "none",
      });
      return;
    }
    if (!canOpenDetail(rec)) {
      wx.showToast({ title: "还在识别，可下拉刷新", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/recognize/index?batchId=" + rec.id });
  },
  onRetry(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const rec = (this.data.records || [])[idx];
    const jobId = (e.currentTarget.dataset.jobId || (rec && rec.jobId) || "").trim();
    if (!jobId) {
      wx.showToast({ title: "缺少任务", icon: "none" });
      return;
    }
    wx.showModal({
      title: "确认重试",
      content: "将再识别一次。点完约一分钟后下拉刷新。",
      success: async (res) => {
        if (!res.confirm) return;
        const r = await api.homework.recognizeRetry({ jobId });
        if (r && r.ok) {
          await this.loadRecords();
          this.scheduleStatusRefresh();
        } else {
          wx.showToast({ title: String((r && r.error) || "重试失败"), icon: "none" });
        }
      },
    });
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
          const started = await api.homework.recognizeStart({ fileIDs, childId, batchId });
          if (!started || !started.ok || !started.jobId) {
            this.setData({ busy: false, msg: "无法创建识别任务 " + ((started && started.error) || "") });
            return;
          }
          this.setData({ busy: false, msg: "已提交。识别在云端进行，约一分钟内下拉刷新查看。" });
          await this.loadRecords();
          this.scheduleStatusRefresh();
        } catch (e) {
          const raw = String((e && e.errMsg) || e);
          let msg = raw;
          if (/STORAGE_EXCEED_AUTHORITY|Have no access right to the storage/i.test(raw)) {
            msg =
              "云存储无写权限。请到云开发控制台 → 存储 → 权限，允许登录用户上传（不要设成仅管理员/仅云函数可写）。";
          }
          this.setData({ busy: false, msg });
        }
      },
    });
  },
});
