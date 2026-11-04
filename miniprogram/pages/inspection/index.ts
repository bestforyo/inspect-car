import { inspectionCatalog, inspectionStates, CatalogItem } from "../../data/inspection-catalog";
import { getOrder, updateOrder } from "../../services/order-store";

type CheckItem = CatalogItem & { state: string; note: string; photos: string[] };
type CheckGroup = { id: string; title: string; sourceCount: number; items: CheckItem[] };
const DRAFT_KEY = "inspect-car-current-draft-v1";

Page({
  data: {
    orderId: "",
    templateUnavailable: false,
    business: "passenger",
    kind: "used",
    active: "major",
    keyword: "",
    groups: [] as CheckGroup[],
    visibleGroups: [] as CheckGroup[],
    counts: [{id:"major",title:"重大事故",done:0,total:59},{id:"water",title:"泡水",done:0,total:29},{id:"fire",title:"火烧",done:0,total:8}] as Array<{id:string;title:string;done:number;total:number}>,
    total: 0,
    done: 0,
    progressPercent: 0,
    states: inspectionStates
  },

  onLoad(query: Record<string, string | undefined>) {
    const business = query.business || "passenger";
    const orderId = query.orderId || "";
    const kind = query.kind || "used";
    const saved = wx.getStorageSync(orderId ? "inspect-car-draft-" + orderId : DRAFT_KEY) as { business?: string; kind?: string; groups?: CheckGroup[] } | undefined;
    const fresh = business === "motorcycle" ? [] : inspectionCatalog.map(group => ({
      ...group,
      items: group.items.map(item => ({ ...item, state: "待检测", note: "", photos: [] as string[] }))
    }));
    const groups = saved?.groups?.length ? saved.groups : fresh;
    const total = groups.reduce((sum, group) => sum + group.items.length, 0);
    this.setData({ orderId, templateUnavailable: business === "motorcycle", business: saved?.business || business, kind: saved?.kind || kind, groups, total }, () => this.refreshView());
  },

  onHide() { this.saveDraft(); },
  onUnload() { this.saveDraft(); },

  saveDraft() {
    if (!this.data.groups.length) return;
    wx.setStorageSync(this.data.orderId ? "inspect-car-draft-" + this.data.orderId : DRAFT_KEY, {
      business: this.data.business,
      kind: this.data.kind,
      groups: this.data.groups,
      savedAt: new Date().toISOString()
    });
    if (this.data.orderId) { const current = getOrder(this.data.orderId); updateOrder(this.data.orderId, { ...(current && (current.status === "draft" || current.status === "in_progress" || current.status === "needs_revision") ? { status: "in_progress" as const } : {}), inspection: { groups: this.data.groups, total: this.data.total, done: this.data.done } }); }
  },

  refreshView() {
    const keyword = this.data.keyword.trim().toLowerCase();
    const visibleGroups = this.data.groups.filter(group => group.id === this.data.active).map(group => ({
      ...group,
      items: group.items.filter(item => !keyword || item.name.toLowerCase().includes(keyword) || item.section.toLowerCase().includes(keyword))
    })).filter(group => group.items.length > 0);
    const counts = this.data.groups.map(group => ({
      id: group.id,
      title: group.title,
      done: group.items.filter(item => item.state !== "待检测").length,
      total: group.items.length
    }));
    const done = counts.reduce((sum, group) => sum + group.done, 0);
    this.setData({
      visibleGroups,
      counts,
      done,
      progressPercent: this.data.total ? Math.round(done / this.data.total * 100) : 0
    });
  },

  onSearch(e: { detail: { value: string } }) {
    this.setData({ keyword: e.detail.value }, () => this.refreshView());
  },

  clearSearch() {
    this.setData({ keyword: "" }, () => this.refreshView());
  },

  switchGroup(e: WechatMiniprogram.TouchEvent) {
    this.setData({ active: e.currentTarget.dataset.id, keyword: "" }, () => this.refreshView());
  },

  selectState(e: WechatMiniprogram.TouchEvent) {
    const groupId = e.currentTarget.dataset.group;
    const itemId = e.currentTarget.dataset.item;
    const state = e.currentTarget.dataset.state;
    const groups = this.data.groups.map(group => group.id === groupId
      ? { ...group, items: group.items.map(item => item.id === itemId ? { ...item, state } : item) }
      : group);
    this.setData({ groups }, () => { this.refreshView(); this.saveDraft(); });
  },

  addNote(e: WechatMiniprogram.TouchEvent) {
    const groupId = e.currentTarget.dataset.group;
    const itemId = e.currentTarget.dataset.item;
    const group = this.data.groups.find(item => item.id === groupId);
    const item = group?.items.find(value => value.id === itemId);
    wx.showModal({
      title: "补充检测说明",
      editable: true,
      placeholderText: "记录缺陷位置、程度及现场情况",
      content: item?.note || "",
      success: result => {
        if (!result.confirm) return;
        const groups = this.data.groups.map(value => value.id === groupId
          ? { ...value, items: value.items.map(check => check.id === itemId ? { ...check, note: result.content || "" } : check) }
          : value);
        this.setData({ groups }, () => this.saveDraft());
      }
    });
  },

  addPhoto(e: WechatMiniprogram.TouchEvent) {
    const groupId = e.currentTarget.dataset.group;
    const itemId = e.currentTarget.dataset.item;
    const existing = this.data.groups.find(group => group.id === groupId)?.items.find(item => item.id === itemId)?.photos.length || 0;
    if (existing >= 9) {
      wx.showToast({ title: "每项最多保存 9 张照片", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: Math.min(9 - existing, 6),
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: result => {
        const tempPaths = result.tempFiles.map(file => file.tempFilePath);
        const persistOne = (path: string) => new Promise<string>(resolve => {
          wx.saveFile({ tempFilePath: path, success: saved => resolve(saved.savedFilePath), fail: () => resolve(path) });
        });
        Promise.all(tempPaths.map(persistOne)).then(paths => {
          const groups = this.data.groups.map(group => group.id === groupId
            ? { ...group, items: group.items.map(item => item.id === itemId ? { ...item, photos: [...item.photos, ...paths].slice(0, 9) } : item) }
            : group);
          this.setData({ groups }, () => this.saveDraft());
        });
      }
    });
  },

  previewPhoto(e: WechatMiniprogram.TouchEvent) {
    const groupId = e.currentTarget.dataset.group;
    const itemId = e.currentTarget.dataset.item;
    const current = e.currentTarget.dataset.src;
    const photos = this.data.groups.find(group => group.id === groupId)?.items.find(item => item.id === itemId)?.photos || [];
    if (photos.length) wx.previewImage({ current, urls: photos });
  },

  removePhoto(e: WechatMiniprogram.TouchEvent) {
    const groupId = e.currentTarget.dataset.group;
    const itemId = e.currentTarget.dataset.item;
    const photo = e.currentTarget.dataset.src;
    wx.showModal({
      title: "删除照片",
      content: "确定移除这张本地照片吗？",
      success: result => {
        if (!result.confirm) return;
        const groups = this.data.groups.map(group => group.id === groupId
          ? { ...group, items: group.items.map(item => item.id === itemId ? { ...item, photos: item.photos.filter(path => path !== photo) } : item) }
          : group);
        this.setData({ groups }, () => this.saveDraft());
      }
    });
  },

  submit() {
    if (this.data.templateUnavailable) { wx.showToast({ title: "摩托车模板尚未配置", icon: "none" }); return; }
    const pending = this.data.total - this.data.done;
    wx.showModal({
      title: "检测草稿检查",
      content: pending ? `还有 ${pending} 项未记录。仍可提交演示审核，审核员可查看当前记录。` : "所有项目均已记录。将进入本机演示审核队列。",
      confirmText: "提交审核",
      cancelText: "继续检查",
      success: result => {
        if (result.confirm) {
          this.saveDraft();
          if (this.data.orderId) updateOrder(this.data.orderId, { status: "pending_review", inspection: { groups: this.data.groups, total: this.data.total, done: this.data.done } });
          wx.showToast({ title: this.data.orderId ? "已提交到本机审核队列" : "草稿已保存在本机", icon: "success" });
          if (this.data.orderId) setTimeout(() => wx.navigateTo({ url: "/pages/orders/index" }), 500);
        }
      }
    });
  }
});
