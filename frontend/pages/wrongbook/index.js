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
    wx.navigateTo({ url: "/pages/wrong-detail/index?id=" + e.currentTarget.dataset.id });
  },
});
