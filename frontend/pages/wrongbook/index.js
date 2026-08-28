const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { list: [] },
  onShow() {
    this.load();
  },
  async load() {
    if (!app.globalData.childId) {
      const r = await api.child.ensureSolo();
      if (r && r.ok && r.child) app.globalData.childId = r.child.id;
    }
    const childId = app.globalData.childId;
    if (!childId) return;
    const r = await api.wrong.list({ childId });
    this.setData({ list: (r && r.items) || [] });
  },
  open(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const rec = (this.data.list || [])[idx];
    if (!rec) return;
    wx.navigateTo({ url: "/pages/wrong-detail/index?id=" + rec.id });
  },
  previewPhoto(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const rec = (this.data.list || [])[idx];
    if (!rec) return;
    const urls = rec.fileIDs && rec.fileIDs.length ? rec.fileIDs : rec.fileID ? [rec.fileID] : [];
    if (!urls.length) return;
    wx.previewImage({ current: urls[0], urls });
  },
});
