type CheckItem = { id: string; name: string; state: string; note: string };
const groups = [
  { id: "major", title: "重大事故检测", count: 59, items: ["右前纵梁（上）","左前纵梁（上）","右前纵梁（下）","左前纵梁（下）","右 A 柱内侧","右 A 柱外侧","右 B 柱内侧","右 B 柱外侧","右 C 柱内侧","右 C 柱外侧","左 A 柱内侧","左 A 柱外侧","左 B 柱内侧","左 C 柱内侧","左 C 柱外侧","右底边梁外侧","右底边梁内侧","左底边梁外侧","左底边梁内侧","车身底板","前围板","后围板","车顶框架","右前轮旋","左前轮旋","右后轮旋","左后轮旋","右前减振器座","左前减振器座","右后减振器座","左后减振器座","前面板","水箱框架","后备箱底板","主驾驶气囊","副驾驶气囊"] },
  { id: "water", title: "泡水检测", count: 29, items: ["副驾驶线束及插头","副驾驶座椅线束","主驾驶座椅线束","主驾驶线束及插头","左侧门槛线束","右侧门槛线束","机舱保险丝盒","行李箱保险丝盒及线束","驾驶室内保险丝盒","右前地毯","左前地毯","行李箱底板","车内棚顶","点烟器底座","仪表台骨架","副驾驶座椅骨架及滑轨","主驾驶座椅骨架及滑轨","后排座椅骨架及海绵","右 B 柱安全带及锁止机构","左 B 柱安全带及锁止机构","转向柱及踏板支架","右 A 柱夹层及周边","左 A 柱夹层及周边","右 B 柱夹层及周边","左 B 柱夹层及周边","右 C 柱夹层及周边","左 C 柱夹层及周边","底板横梁空腔内部"] },
  { id: "fire", title: "火烧检测", count: 8, items: ["车身底板涂层","行李箱底板涂层","仪表台及附件","机舱盖隔音棉","机舱内线束","机舱内管路","防火墙隔音棉","后备箱线束及保险盒"] }
];
Page({
  data: { business: "passenger", kind: "used", active: "major", groups: [] as Array<{id:string;title:string;count:number;items:CheckItem[]}>, total: 0, done: 0, progressPercent: 0, states: ["待检测","正常","喷漆","变形","拆装","锈蚀","水痕","霉斑","尘土泥沙","未配备","无法检测"] },
  onLoad(query: Record<string, string | undefined>) {
    const business = query.business || "passenger";
    const built = groups.map(g => ({ ...g, items: g.items.map((name, i) => ({ id: g.id + "-" + i, name, state: "待检测", note: "" })) }));
    this.setData({ business, kind: query.kind || "used", groups: built, total: built.reduce((n,g)=>n+g.items.length,0) });
  },
  switchGroup(e: WechatMiniprogram.TouchEvent) { this.setData({ active: e.currentTarget.dataset.id }); },
  selectState(e: WechatMiniprogram.TouchEvent) {
    const groupId = e.currentTarget.dataset.group;
    const itemId = e.currentTarget.dataset.item;
    const state = e.currentTarget.dataset.state;
    const groups = this.data.groups.map(g => g.id === groupId ? { ...g, items: g.items.map(i => i.id === itemId ? { ...i, state } : i) } : g);
    const done = groups.reduce((n,g)=>n+g.items.filter(i=>i.state!=="待检测").length,0);
    this.setData({ groups, done, progressPercent: this.data.total ? Math.round(done / this.data.total * 100) : 0 });
  },
  addNote(e: WechatMiniprogram.TouchEvent) {
    const groupId=e.currentTarget.dataset.group, itemId=e.currentTarget.dataset.item;
    wx.showModal({ title:"补充检测说明", editable:true, placeholderText:"记录缺陷位置、程度及现场情况", success:res=>{
      if (!res.confirm) return;
      const groups=this.data.groups.map(g=>g.id===groupId?{...g,items:g.items.map(i=>i.id===itemId?{...i,note:res.content||""}:i)}:g);
      this.setData({groups});
    }});
  },
  submit() { wx.showModal({ title:"提交审核", content:`已记录 ${this.data.done} 项检测结果。当前为本地交互原型，提交后暂不生成正式报告。`, confirmText:"知道了", showCancel:false }); }
});