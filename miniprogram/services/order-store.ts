export type OrderStatus = "draft" | "in_progress" | "pending_review" | "needs_revision" | "approved";
export type VehicleInfo = {
  plate: string; vin: string; brandModel: string; firstRegister: string;
  mileage: string; color: string; seller: string; remark: string;
};
export type InspectionOrder = {
  id: string; createdAt: string; updatedAt: string; business: string; kind: string;
  status: OrderStatus; vehicle: VehicleInfo; inspector: string; reviewerNote: string;
  inspection?: { groups: unknown[]; total: number; done: number };
};
const KEY = "inspect-car-orders-v1";
export function listOrders(): InspectionOrder[] {
  const rows = wx.getStorageSync(KEY);
  return Array.isArray(rows) ? rows as InspectionOrder[] : [];
}
export function getOrder(id: string): InspectionOrder | undefined {
  return listOrders().find(row => row.id === id);
}
export function createOrder(vehicle: VehicleInfo, business = "passenger"): InspectionOrder {
  const now = new Date().toISOString();
  const id = "IC-" + now.slice(0,10).replace(/-/g,"") + "-" + String(Date.now()).slice(-6);
  const order: InspectionOrder = { id, createdAt: now, updatedAt: now, business, kind: business === "motorcycle" ? "moto" : "used", status: "draft", vehicle, inspector: "当前评估师", reviewerNote: "" };
  wx.setStorageSync(KEY, [order, ...listOrders()]);
  return order;
}
export function updateOrder(id: string, patch: Partial<InspectionOrder>): InspectionOrder | undefined {
  let updated: InspectionOrder | undefined;
  const rows = listOrders().map(row => {
    if (row.id !== id) return row;
    updated = { ...row, ...patch, id, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (updated) wx.setStorageSync(KEY, rows);
  return updated;
}
export function statusLabel(status: OrderStatus): string {
  return ({ draft:"待开始", in_progress:"检测中", pending_review:"待审核", needs_revision:"待修改", approved:"已审核" })[status];
}
