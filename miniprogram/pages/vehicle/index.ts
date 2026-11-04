import { createOrder, VehicleInfo } from "../../services/order-store";
Page({
 data:{vehicle:{plate:"",vin:"",brandModel:"",firstRegister:"",mileage:"",color:"",seller:"",remark:""} as VehicleInfo,business:"passenger"},
 onLoad(q:Record<string,string|undefined>){this.setData({business:q.business||"passenger"});},
 onInput(e:WechatMiniprogram.Input){const field=e.currentTarget.dataset.field;this.setData({[`vehicle.${field}`]:e.detail.value});},
 create(){const v=this.data.vehicle;if(!v.brandModel.trim()){wx.showToast({title:"请填写品牌车型",icon:"none"});return;}const order=createOrder(v,this.data.business);wx.navigateTo({url:`/pages/business/index?type=${this.data.business}&orderId=${order.id}`});}
});