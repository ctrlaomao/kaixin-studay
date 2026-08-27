const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { subjectKey: "math", editionId: "", chapterId: "", msg: "" },
  onS(e) {
    this.setData({ subjectKey: e.detail.value });
  },
  onE(e) {
    this.setData({ editionId: e.detail.value });
  },
  onC(e) {
    this.setData({ chapterId: e.detail.value });
  },
  async save() {
    const childId = app.globalData.childId;
    const a = await api.child.setTextbook({
      childId,
      subjectKey: this.data.subjectKey,
      editionId: this.data.editionId,
    });
    const b = await api.child.setProgress({
      childId,
      subjectKey: this.data.subjectKey,
      chapterId: this.data.chapterId,
      chapterLabel: this.data.chapterId,
    });
    this.setData({ msg: JSON.stringify({ a, b }) });
  },
});
