const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: { fileIDs: [], msg: "" },
  choose() {
    const childId = app.globalData.childId;
    if (!childId) {
      wx.showToast({ title: "请先选孩子", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: 6,
      mediaType: ["image"],
      success: async (res) => {
        const fileIDs = [];
        for (const f of res.tempFiles || []) {
          const up = await wx.cloud.uploadFile({
            cloudPath: `homework/${childId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`,
            filePath: f.tempFilePath,
          });
          fileIDs.push(up.fileID);
        }
        this.setData({ fileIDs, msg: "已上传 " + fileIDs.length });
        getApp().globalData.lastFileIDs = fileIDs;
      },
    });
  },
  async submit() {
    const r = await api.homework.createBatch({
      childId: app.globalData.childId,
      fileIDs: this.data.fileIDs,
      subject: "数学",
    });
    this.setData({ msg: JSON.stringify(r) });
  },
  goRec() {
    wx.navigateTo({ url: "/pages/recognize/index" });
  },
});
