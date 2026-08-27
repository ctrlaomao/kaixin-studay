const api = require("../../utils/api.js");

Page({
  data: { editions: [], lessons: [] },
  async loadEd() {
    const r = await api.catalog.editions({});
    this.setData({ editions: (r && r.editions) || [] });
  },
  async loadLs(e) {
    const r = await api.catalog.lessons({ editionId: e.currentTarget.dataset.id });
    this.setData({ lessons: (r && r.lessons) || [] });
  },
});
