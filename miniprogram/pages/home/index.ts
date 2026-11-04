Page({
  data: { today: "", recent: [{ id: "IC-20261104-001", vehicle: "2021 款 丰田 凯美瑞", status: "待审核", time: "今天 09:42" }, { id: "IC-20261103-008", vehicle: "2019 款 本田 雅阁", status: "已完成", time: "昨天 16:20" }] },
  onLoad() {
    const d = new Date();
    this.setData({ today: `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日` });
  },
  goBusiness(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: `/pages/business/index?type=${e.currentTarget.dataset.type}` });
  },
  goInspection() { wx.navigateTo({ url: "/pages/inspection/index" }); },
  goProfile() { wx.switchTab({ url: "/pages/profile/index" }); }
});