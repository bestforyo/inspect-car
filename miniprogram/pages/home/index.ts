import { listOrders, statusLabel } from "../../services/order-store";
Page({
  data: { today: "", recent: [] as Array<{id:string;vehicle:string;status:string;time:string}> },
  onLoad() {
    const d = new Date();
    this.setData({ today: `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日` });
  },
  onShow() { this.setData({ recent: listOrders().slice(0,3).map(x=>({id:x.id,vehicle:x.vehicle.brandModel||"未填写车型",status:statusLabel(x.status),time:x.updatedAt.slice(0,16).replace("T"," ")})) }); },
  goOrders() { wx.navigateTo({url:"/pages/orders/index"}); },
  goCreate() { wx.navigateTo({url:"/pages/vehicle/index"}); },
  goReview() { wx.navigateTo({url:"/pages/review/index"}); },
  goBusiness(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: `/pages/vehicle/index?business=${e.currentTarget.dataset.type}` });
  },
  goInspection() { wx.navigateTo({ url: "/pages/inspection/index" }); },
  goProfile() { wx.switchTab({ url: "/pages/profile/index" }); }
});