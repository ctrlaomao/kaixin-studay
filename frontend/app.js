App({
  globalData: {
    env: "cloudbase-d7ggaqrps717e5be9",
    childId: "",
  },
  onLaunch() {
    if (!wx.cloud) return;
    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true,
      timeout: 60000,
    });
  },
});
