Page({
  data: { orderId: "", type: "passenger", title: "乘用车检测", options: [{ key: "new", name: "新车检测", desc: "新车交付前技术状况检查" }, { key: "used", name: "二手车检测", desc: "常规检测及重大事故、泡水、火烧专项" }] },
  onLoad(query: Record<string, string | undefined>) {
    const type = query.type || "passenger";
    const orderId = query.orderId || "";
    this.setData({ orderId, type, title: type === "motorcycle" ? "摩托车检测" : "乘用车检测",
      options: type === "motorcycle" ? [{ key: "moto", name: "摩托车检测", desc: "摩托车独立检测模板，规则待配置" }] : this.data.options });
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    const kind = e.currentTarget.dataset.kind;
    wx.navigateTo({ url: `/pages/inspection/index?business=${this.data.type}&kind=${kind}&orderId=${this.data.orderId}` });
  }
});