export type CatalogItem = { id: string; name: string; section: string };
export type CatalogGroup = { id: "major" | "water" | "fire"; title: string; items: CatalogItem[]; sourceCount: number };

const makeItems = (prefix: string, section: string, names: string[]): CatalogItem[] =>
  names.map((name, index) => ({ id: `${prefix}-${String(index + 1).padStart(2, "0")}`, name, section }));

// 项目名称与排列依据用户提供的竞品截图转录；不等同于已核验的国家/行业标准条款。
export const inspectionCatalog: CatalogGroup[] = [
  {
    id: "major",
    title: "重大事故检测",
    sourceCount: 59,
    items: [
      ...makeItems("major-a", "车身纵梁与基础结构", [
        "右后纵梁", "左后纵梁", "更换车身（车架）", "右前纵梁（下）", "左前纵梁（下）",
        "车体外缘左右对称", "副驾驶气囊", "右底边梁外侧", "右底边梁内侧", "车顶框架"
      ]),
      ...makeItems("major-b", "侧围、柱体及后部结构", [
        "右前侧气帘", "右A柱内侧", "右A柱外侧", "右B柱内侧", "右后侧气帘",
        "右C柱内侧", "右C柱外侧", "右D柱外侧", "右后轮旋", "右D柱内侧",
        "右后减振器座", "右后灯框架", "右侧背箱流水槽", "后备箱底板", "后围板",
        "左侧背箱流水槽", "左后减振器座", "左后灯框架", "左D柱内侧", "左后轮旋",
        "左D柱外侧", "左后侧气帘", "左C柱内侧", "左C柱外侧", "左底边梁外侧",
        "左底边梁内侧", "左B柱内侧", "主驾驶气囊"
      ]),
      ...makeItems("major-c", "前部结构及翼子板内骨架", [
        "左前侧气帘", "左A柱内侧", "左A柱外侧", "左前轮旋", "左前减振器座",
        "左前纵梁（上）", "左前车灯框架", "前围板", "不可拆水箱框架", "可拆水箱框架",
        "右前纵梁（上）", "右前车灯框架", "右前轮旋", "右前减振器座",
        "右底边梁内侧（下）", "左底边梁内侧（下）", "车身底板（底盘）",
        "右后翼子板内骨架", "左后翼子板内骨架", "左前翼子板内骨架", "右前翼子板内骨架"
      ])
    ]
  },
  {
    id: "water",
    title: "泡水检测",
    sourceCount: 29,
    items: [
      ...makeItems("water-a", "线束、地毯及内饰", [
        "副驾驶线束及插头", "右前地毯", "副驾驶座椅线束", "行李箱底板", "车内棚顶", "点烟器底座",
        "室内中央扶手区", "仪表台骨架", "左侧门槛线束", "主驾驶座椅线束", "主驾驶线束及插头",
        "左前地毯", "机舱保险丝盒"
      ]),
      ...makeItems("water-b", "车身夹层及底板空腔", [
        "右A柱夹层及周边", "底板横梁空腔内部", "右侧门槛线束", "副驾驶座椅骨架及滑轨",
        "右B柱安全带及锁止机构", "右B柱夹层及周边", "右C柱夹层及周边",
        "行李箱保险丝盒及线束", "左C柱夹层及周边"
      ]),
      ...makeItems("water-c", "座椅、安全带及驾驶室电气", [
        "后排座椅骨架及海绵", "左B柱安全带及锁止机构", "左B柱夹层及周边",
        "转向柱及踏板支架", "主驾驶座椅骨架及滑轨", "驾驶室内保险丝盒",
        "左A柱夹层及周边"
      ])
    ]
  },
  {
    id: "fire",
    title: "火烧检测",
    sourceCount: 8,
    items: makeItems("fire", "火烧专项检查", [
      "车身底板涂层", "行李箱底板涂层", "仪表台及附件", "机舱盖隔音棉",
      "机舱内线束", "机舱内管路", "防火墙隔音棉", "后备箱线束/保险盒"
    ])
  }
];

export const inspectionStates = [
  "待检测", "正常", "喷漆", "变形", "拆装", "锈蚀", "水痕", "霉斑", "尘土泥沙", "未配备", "受限不可检"
];

export const catalogItemCount = inspectionCatalog.reduce((sum, group) => sum + group.items.length, 0);
