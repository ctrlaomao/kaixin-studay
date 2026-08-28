const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { id: "", lessonId: "", msg: "", item: null },
  onLoad(q) {
    this.setData({ id: q.id || "" });
  },
  async onShow() {
    if (!app.globalData.childId) {
      const r = await api.child.ensureSolo();
      if (r && r.ok && r.child) app.globalData.childId = r.child.id;
    }
    const r = await api.wrong.list({ childId: app.globalData.childId });
    const item = ((r && r.items) || []).find((x) => x.id === this.data.id) || null;
    this.setData({ item, lessonId: (item && item.lessonId) || "" });
  },
  onL(e) {
    this.setData({ lessonId: e.detail.value });
  },
  previewPhoto() {
    const item = this.data.item;
    if (!item) return;
    const urls = item.fileIDs && item.fileIDs.length ? item.fileIDs : item.fileID ? [item.fileID] : [];
    if (!urls.length) return;
    wx.previewImage({ current: urls[0], urls });
  },
  async save() {
    const r = await api.wrong.updateLesson({
      id: this.data.id,
      lessonId: this.data.lessonId,
    });
    this.setData({ msg: r && r.ok ? "已改绑" : JSON.stringify(r), item: (r && r.item) || this.data.item });
  },
});
