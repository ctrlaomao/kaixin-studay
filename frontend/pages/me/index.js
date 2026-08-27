const api = require("../../utils/api.js");
const app = getApp();

Page({
  data: {
    displayName: "孩子",
    grade: "七年级",
    children: [],
    childId: "",
    inviteCode: "",
    meText: "",
  },
  onShow() {
    this.setData({ childId: app.globalData.childId || "" });
    this.refreshMe();
    this.loadChildren();
  },
  onName(e) {
    this.setData({ displayName: e.detail.value });
  },
  onGrade(e) {
    this.setData({ grade: e.detail.value });
  },
  onCode(e) {
    this.setData({ inviteCode: e.detail.value });
  },
  async refreshMe() {
    const r = await api.family.me();
    this.setData({ meText: JSON.stringify(r) });
  },
  async addChild() {
    const r = await api.child.create({
      displayName: this.data.displayName,
      grade: this.data.grade,
    });
    if (r.ok && r.child) {
      app.globalData.childId = r.child.id;
      this.setData({ childId: r.child.id });
    }
    wx.showToast({ title: r.ok ? "已添加" : r.error || "失败", icon: "none" });
    this.loadChildren();
  },
  async loadChildren() {
    const r = await api.child.list({});
    const children = (r && r.children) || [];
    this.setData({ children });
    if (!app.globalData.childId && children[0]) {
      app.globalData.childId = children[0].id;
      this.setData({ childId: children[0].id });
    }
  },
  pick(e) {
    const id = e.currentTarget.dataset.id;
    app.globalData.childId = id;
    this.setData({ childId: id });
  },
  async createFamily() {
    const r = await api.family.create({});
    wx.showToast({ title: r.ok ? "家庭已建" : r.error || "失败", icon: "none" });
    this.refreshMe();
  },
  async joinFamily() {
    const r = await api.family.join({
      inviteCode: this.data.inviteCode,
      childId: this.data.childId,
      role: "parent",
    });
    wx.showToast({ title: r.ok ? "已加入" : r.error || "失败", icon: "none" });
    this.refreshMe();
  },
  goTextbooks() {
    wx.navigateTo({ url: "/pages/textbooks/index" });
  },
});
