const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { summary: "" },
  onShow() {
    this.load();
  },
  async load() {
    const childId = app.globalData.childId;
    if (!childId) {
      this.setData({ summary: "请先在「我的」选择孩子" });
      return;
    }
    const r = await api.mastery.overview({ childId });
    this.setData({ summary: JSON.stringify(r, null, 2) });
  },
  goCatalog() {
    wx.navigateTo({ url: "/pages/catalog/index" });
  },
});
