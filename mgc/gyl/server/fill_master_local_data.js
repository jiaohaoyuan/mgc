const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'local-data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const now = new Date().toISOString();

const stamp = (row) => ({
  status: row.status === undefined ? 1 : row.status,
  remark: row.remark ?? '',
  created_time: row.created_time || now,
  updated_time: now,
  ...row
});

const category = [
  ['CAT-L1-DAIRY', '乳制品', 1, null, 1],
  ['CAT-L1-NUTRITION', '营养品', 1, null, 2],
  ['CAT-L2-LIQUID', '液态奶', 2, 'CAT-L1-DAIRY', 1],
  ['CAT-L2-YOGURT', '酸奶', 2, 'CAT-L1-DAIRY', 2],
  ['CAT-L2-CHEESE', '奶酪', 2, 'CAT-L1-DAIRY', 3],
  ['CAT-L2-MILKPOWDER', '奶粉', 2, 'CAT-L1-NUTRITION', 1],
  ['CAT-L3-UHT', '常温纯奶', 3, 'CAT-L2-LIQUID', 1],
  ['CAT-L3-PASTEUR', '巴氏鲜奶', 3, 'CAT-L2-LIQUID', 2],
  ['CAT-L3-RTD-YOG', '常温酸奶饮品', 3, 'CAT-L2-YOGURT', 1],
  ['CAT-L3-CHILLED-YOG', '冷藏酸奶', 3, 'CAT-L2-YOGURT', 2],
  ['CAT-L3-CREAM-CHEESE', '奶油芝士', 3, 'CAT-L2-CHEESE', 1],
  ['CAT-L3-MOZZARELLA', '马苏里拉', 3, 'CAT-L2-CHEESE', 2],
  ['CAT-L3-ADULT-POWDER', '成人奶粉', 3, 'CAT-L2-MILKPOWDER', 1],
  ['CAT-L3-CHILD-POWDER', '儿童奶粉', 3, 'CAT-L2-MILKPOWDER', 2]
].map((x, i) => stamp({ id: i + 1, category_code: x[0], category_name: x[1], level: x[2], parent_code: x[3], sort_order: x[4] }));

const factory = [
  ['FAC-ANJI', '安吉液态奶工厂', '认养一头牛乳业', '液态奶工厂', 1, '浙江省', '湖州市', '安吉县', '递铺街道乳业路1号'],
  ['FAC-HEFEI', '合肥常温奶工厂', '认养一头牛乳业', '常温奶工厂', 1, '安徽省', '合肥市', '肥西县', '经开区奶源大道88号'],
  ['FAC-CHANGSHA', '长沙低温乳品工厂', '认养一头牛乳业', '低温乳品工厂', 1, '湖南省', '长沙市', '望城区', '食品产业园冷链路16号'],
  ['FAC-CHANGSHAN', '常山奶粉工厂', '认养一头牛乳业', '奶粉工厂', 1, '浙江省', '衢州市', '常山县', '工业园乳品大道18号'],
  ['FAC-HARBIN-ODM', '哈尔滨北乳协同工厂', '北乳食品制造有限公司', '协同代工厂', 0, '黑龙江省', '哈尔滨市', '松北区', '松北新区食品加工园12号'],
  ['FAC-CHENGDU-ODM', '成都西南协同工厂', '西南乳业供应链有限公司', '协同代工厂', 0, '四川省', '成都市', '新津区', '天府智能制造园66号']
].map((x, i) => stamp({ id: i + 1, factory_code: x[0], factory_name: x[1], company_name: x[2], type_name: x[3], is_own: x[4], province_name: x[5], city_name: x[6], district_name: x[7], address: x[8] }));

const fMap = new Map(factory.map((f) => [f.factory_code, f.factory_name]));

const loc = {
  HZ: ['浙江省', '杭州市', '萧山区', '经济开发区仓储路18号', 30.184, 120.264],
  SH: ['上海市', '上海市', '青浦区', '徐泾镇仓储大道56号', 31.206, 121.231],
  GZ: ['广东省', '广州市', '花都区', '空港物流园冷链路28号', 23.391, 113.217],
  TJ: ['天津市', '天津市', '武清区', '京津物流园乳业仓66号', 39.385, 117.042],
  WH: ['湖北省', '武汉市', '东西湖区', '吴家山冷链港18号', 30.679, 114.131],
  CD: ['四川省', '成都市', '双流区', '临空经济区保税仓29号', 30.575, 103.956],
  SUZHOU: ['江苏省', '苏州市', '相城区', '阳澄湖大道68号', 31.417, 120.642],
  NANJING: ['江苏省', '南京市', '江宁区', '空港物流园66号', 31.953, 118.806],
  SHENZHEN: ['广东省', '深圳市', '龙岗区', '平湖冷链产业园15号', 22.719, 114.114],
  FOSHAN: ['广东省', '佛山市', '南海区', '狮山冷链物流园12号', 23.047, 113.116],
  BEIJING: ['北京市', '北京市', '顺义区', '后沙峪冷链基地5号', 40.111, 116.655],
  QINGDAO: ['山东省', '青岛市', '胶州市', '临空物流园8号', 36.286, 120.003],
  ZHENGZHOU: ['河南省', '郑州市', '新郑市', '航空港冷链中心11号', 34.545, 113.84],
  CHANGSHA: ['湖南省', '长沙市', '长沙县', '黄花冷链园7号', 28.257, 113.095],
  CHENGDU: ['四川省', '成都市', '新都区', '新都物流大道99号', 30.817, 104.159],
  XIAN: ['陕西省', '西安市', '高陵区', '渭阳冷链园23号', 34.535, 109.076],
  ANJI: ['浙江省', '湖州市', '安吉县', '孝丰镇生态牧场园区', 30.639, 119.681],
  QQHE: ['黑龙江省', '齐齐哈尔市', '龙江县', '龙江牧业示范园A区', 47.338, 123.931],
  ULCB: ['内蒙古自治区', '乌兰察布市', '察哈尔右翼前旗', '草原生态牧业带6号', 40.994, 113.133],
  TIANSHAN: ['新疆维吾尔自治区', '石河子市', '开发区', '天山北坡现代牧业基地', 44.305, 86.033],
  ZHANGYE: ['甘肃省', '张掖市', '甘州区', '河西走廊畜牧示范区', 38.931, 100.455]
};

const wDef = [
  ['WH-HQ-HZ', '杭州总部中央仓', 'BIZ-HZ-HQ', '杭州总部仓', 'BDC', 'BDC', '总部中心仓', 'FAC-ANJI', 'HQ', 1, '总部调拨中心', 1, 'HZ'],
  ['WH-RDC-EAST-SH', '上海华东RDC', 'BIZ-SH-RDC', '华东RDC', 'RDC', 'RDC', '区域配送中心', 'FAC-ANJI', 'RDC', 2, '华东配送中心', 1, 'SH'],
  ['WH-RDC-SOUTH-GZ', '广州华南RDC', 'BIZ-GZ-RDC', '华南RDC', 'RDC', 'RDC', '区域配送中心', 'FAC-CHANGSHA', 'RDC', 2, '华南配送中心', 1, 'GZ'],
  ['WH-RDC-NORTH-TJ', '天津华北RDC', 'BIZ-TJ-RDC', '华北RDC', 'RDC', 'RDC', '区域配送中心', 'FAC-HEFEI', 'RDC', 2, '华北配送中心', 1, 'TJ'],
  ['WH-RDC-CENTRAL-WH', '武汉华中RDC', 'BIZ-WH-RDC', '华中RDC', 'RDC', 'RDC', '区域配送中心', 'FAC-HEFEI', 'RDC', 2, '华中配送中心', 1, 'WH'],
  ['WH-RDC-WEST-CD', '成都西南RDC', 'BIZ-CD-RDC', '西南RDC', 'RDC', 'RDC', '区域配送中心', 'FAC-CHENGDU-ODM', 'RDC', 2, '西南配送中心', 1, 'CD'],
  ['WH-DC-SUZHOU', '苏州渠道分拨仓', 'BIZ-SZ-DC', '苏州分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-ANJI', 'DISTRIBUTOR', 4, '苏州渠道运营', 0, 'SUZHOU'],
  ['WH-DC-NANJING', '南京渠道分拨仓', 'BIZ-NJ-DC', '南京分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-HEFEI', 'DISTRIBUTOR', 4, '南京渠道运营', 0, 'NANJING'],
  ['WH-DC-SHENZHEN', '深圳城市分拨仓', 'BIZ-SZ-SOUTH-DC', '深圳分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-CHANGSHA', 'DISTRIBUTOR', 4, '深圳渠道运营', 0, 'SHENZHEN'],
  ['WH-DC-FOSHAN', '佛山城市分拨仓', 'BIZ-FS-DC', '佛山分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-CHANGSHA', 'DISTRIBUTOR', 4, '佛山渠道运营', 0, 'FOSHAN'],
  ['WH-DC-BEIJING', '北京城市分拨仓', 'BIZ-BJ-DC', '北京分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-HEFEI', 'DISTRIBUTOR', 4, '北京渠道运营', 0, 'BEIJING'],
  ['WH-DC-QINGDAO', '青岛城市分拨仓', 'BIZ-QD-DC', '青岛分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-HEFEI', 'DISTRIBUTOR', 4, '青岛渠道运营', 0, 'QINGDAO'],
  ['WH-DC-ZHENGZHOU', '郑州城市分拨仓', 'BIZ-ZZ-DC', '郑州分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-HEFEI', 'DISTRIBUTOR', 4, '郑州渠道运营', 0, 'ZHENGZHOU'],
  ['WH-DC-CHANGSHA', '长沙城市分拨仓', 'BIZ-CS-DC', '长沙分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-CHANGSHA', 'DISTRIBUTOR', 4, '长沙渠道运营', 0, 'CHANGSHA'],
  ['WH-DC-CHENGDU', '成都城市分拨仓', 'BIZ-CD-DC', '成都分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-CHENGDU-ODM', 'DISTRIBUTOR', 4, '成都渠道运营', 0, 'CHENGDU'],
  ['WH-DC-XIAN', '西安城市分拨仓', 'BIZ-XA-DC', '西安分拨仓', 'DC', 'DC', '城市分拨仓', 'FAC-CHENGDU-ODM', 'DISTRIBUTOR', 4, '西安渠道运营', 0, 'XIAN'],
  ['WH-PASTURE-ANJI', '安吉生态牧场前置仓', 'BIZ-AJ-FARM', '安吉牧场仓', 'FARM', '牧场前置仓', '奶源前置仓', 'FAC-ANJI', 'PASTURE', 3, '安吉牧场调度', 1, 'ANJI'],
  ['WH-PASTURE-QIQIHAR', '齐齐哈尔牧场前置仓', 'BIZ-QQHE-FARM', '齐齐哈尔牧场仓', 'FARM', '牧场前置仓', '奶源前置仓', 'FAC-HARBIN-ODM', 'PASTURE', 3, '齐齐哈尔牧场调度', 1, 'QQHE'],
  ['WH-PASTURE-ULANQAB', '乌兰察布牧场前置仓', 'BIZ-ULCB-FARM', '乌兰察布牧场仓', 'FARM', '牧场前置仓', '奶源前置仓', 'FAC-HARBIN-ODM', 'PASTURE', 3, '乌兰察布牧场调度', 1, 'ULCB'],
  ['WH-PASTURE-TIANSHAN', '天山牧场前置仓', 'BIZ-XJ-FARM', '天山牧场仓', 'FARM', '牧场前置仓', '奶源前置仓', 'FAC-CHENGDU-ODM', 'PASTURE', 3, '天山牧场调度', 1, 'TIANSHAN'],
  ['WH-PASTURE-ZHANGYE', '张掖牧场前置仓', 'BIZ-ZY-FARM', '张掖牧场仓', 'FARM', '牧场前置仓', '奶源前置仓', 'FAC-CHENGDU-ODM', 'PASTURE', 3, '张掖牧场调度', 1, 'ZHANGYE']
];

const warehouse = wDef.map((x, i) => {
  const p = loc[x[12]];
  return stamp({
    id: i + 1,
    warehouse_code: x[0], warehouse_name: x[1], biz_warehouse_code: x[2], biz_warehouse_name: x[3],
    lv1_type_code: x[4], lv1_type_name: x[5], lv2_type_name: x[6],
    factory_code: x[7], factory_name: fMap.get(x[7]) || '', warehouse_type_code: x[8], warehouse_type: x[9],
    contact_person: x[10], is_own: x[11],
    province_name: p[0], city_name: p[1], district_name: p[2], address: p[3], latitude: p[4], longitude: p[5]
  });
});

const whMap = new Map(warehouse.map((w) => [w.warehouse_code, w]));
const channel = [
  ['CH-L1-OFFLINE', '线下渠道', 1, null, 1],
  ['CH-L1-ONLINE', '线上渠道', 1, null, 2],
  ['CH-L2-DIST', '经销渠道', 2, 'CH-L1-OFFLINE', 1],
  ['CH-L2-KA', '现代商超', 2, 'CH-L1-OFFLINE', 2],
  ['CH-L2-NEWRETAIL', '新零售', 2, 'CH-L1-OFFLINE', 3],
  ['CH-L2-ECOM', '电商平台', 2, 'CH-L1-ONLINE', 1],
  ['CH-L2-PRIVATE', '私域直销', 2, 'CH-L1-ONLINE', 2],
  ['CH-L3-DIST-CITY', '城市经销', 3, 'CH-L2-DIST', 1],
  ['CH-L3-DIST-COUNTY', '区县分销', 3, 'CH-L2-DIST', 2],
  ['CH-L3-KA-HYPER', '大卖场', 3, 'CH-L2-KA', 1],
  ['CH-L3-KA-CVS', '便利连锁', 3, 'CH-L2-KA', 2],
  ['CH-L3-NEWRETAIL-HM', '盒马鲜生', 3, 'CH-L2-NEWRETAIL', 1],
  ['CH-L3-NEWRETAIL-DDMC', '叮咚买菜', 3, 'CH-L2-NEWRETAIL', 2],
  ['CH-L3-ECOM-TM', '天猫旗舰', 3, 'CH-L2-ECOM', 1],
  ['CH-L3-ECOM-JD', '京东自营', 3, 'CH-L2-ECOM', 2],
  ['CH-L3-ECOM-DY', '抖音电商', 3, 'CH-L2-ECOM', 3],
  ['CH-L3-PRIVATE-WX', '微信小程序商城', 3, 'CH-L2-PRIVATE', 1],
  ['CH-L3-PRIVATE-LIVE', '私域直播间', 3, 'CH-L2-PRIVATE', 2]
].map((x, i) => stamp({ id: i + 1, channel_code: x[0], channel_name: x[1], level: x[2], parent_code: x[3], sort_order: x[4] }));

const cMap = new Map(channel.map((c) => [c.channel_code, c.channel_name]));

const org = [
  ['ORG-HQ', '集团总部', 1, null, '总部', '认养一头牛集团', 1],
  ['ORG-SCM', '供应链中心', 2, 'ORG-HQ', '职能中心', '认养一头牛集团', 1],
  ['ORG-SALES', '全国销售中心', 2, 'ORG-HQ', '职能中心', '认养一头牛集团', 2],
  ['ORG-EAST', '华东大区', 3, 'ORG-SALES', '大区', '认养一头牛集团', 1],
  ['ORG-SOUTH', '华南大区', 3, 'ORG-SALES', '大区', '认养一头牛集团', 2],
  ['ORG-NORTH', '华北大区', 3, 'ORG-SALES', '大区', '认养一头牛集团', 3],
  ['ORG-CENTRAL', '华中大区', 3, 'ORG-SALES', '大区', '认养一头牛集团', 4],
  ['ORG-WEST', '西南大区', 3, 'ORG-SALES', '大区', '认养一头牛集团', 5],
  ['ORG-ECOM', '电商事业部', 3, 'ORG-SALES', '事业部', '认养一头牛集团', 6],
  ['ORG-EAST-SZ', '苏皖业务单元', 4, 'ORG-EAST', '业务单元', '认养一头牛华东公司', 1],
  ['ORG-SOUTH-GD', '两广业务单元', 4, 'ORG-SOUTH', '业务单元', '认养一头牛华南公司', 1],
  ['ORG-NORTH-BJ', '京津冀业务单元', 4, 'ORG-NORTH', '业务单元', '认养一头牛华北公司', 1],
  ['ORG-CENTRAL-HN', '豫湘业务单元', 4, 'ORG-CENTRAL', '业务单元', '认养一头牛华中公司', 1],
  ['ORG-WEST-SC', '川渝业务单元', 4, 'ORG-WEST', '业务单元', '认养一头牛西南公司', 1]
].map((x, i) => stamp({ id: i + 1, org_code: x[0], org_name: x[1], level: x[2], parent_code: x[3], org_type: x[4], company_name: x[5], sort_order: x[6] }));

const oMap = new Map(org.map((o) => [o.org_code, o.org_name]));

const sku = [
  ['SKU-UHT-250-12', '常温纯牛奶250ml*12', '6901000001001', 'CAT-L3-UHT', 'ACTIVE', 180, 12, 0.014],
  ['SKU-UHT-250-24', '常温纯牛奶250ml*24', '6901000001002', 'CAT-L3-UHT', 'ACTIVE', 180, 24, 0.028],
  ['SKU-UHT-200-10', '全脂纯牛奶200ml*10', '6901000001003', 'CAT-L3-UHT', 'ACTIVE', 180, 10, 0.011],
  ['SKU-UHT-1L-12', '常温纯牛奶1L*12', '6901000001004', 'CAT-L3-UHT', 'ACTIVE', 180, 12, 0.043],
  ['SKU-UHT-HIGHCAL-250-12', '高钙纯牛奶250ml*12', '6901000001005', 'CAT-L3-UHT', 'ACTIVE', 180, 12, 0.014],
  ['SKU-UHT-A2-250-12', 'A2β-酪蛋白纯牛奶250ml*12', '6901000001006', 'CAT-L3-UHT', 'ACTIVE', 180, 12, 0.014],
  ['SKU-UHT-ORGANIC-250-12', '有机纯牛奶250ml*12', '6901000001007', 'CAT-L3-UHT', 'ACTIVE', 180, 12, 0.014],
  ['SKU-PASTEUR-950', '巴氏鲜奶950ml', '6901000002001', 'CAT-L3-PASTEUR', 'ACTIVE', 7, 1, 0.0015],
  ['SKU-PASTEUR-450', '巴氏鲜奶450ml', '6901000002002', 'CAT-L3-PASTEUR', 'ACTIVE', 7, 1, 0.0008],
  ['SKU-PASTEUR-HIGHCAL-950', '高钙鲜奶950ml', '6901000002003', 'CAT-L3-PASTEUR', 'ACTIVE', 10, 1, 0.0015],
  ['SKU-PASTEUR-CHILD-750', '儿童鲜奶750ml', '6901000002004', 'CAT-L3-PASTEUR', 'ACTIVE', 7, 1, 0.0012],
  ['SKU-YOG-CHILLED-ORIGIN-200-10', '低温原味酸奶200g*10', '6901000003001', 'CAT-L3-CHILLED-YOG', 'ACTIVE', 21, 10, 0.0075],
  ['SKU-YOG-CHILLED-STRAW-200-10', '低温草莓酸奶200g*10', '6901000003002', 'CAT-L3-CHILLED-YOG', 'ACTIVE', 21, 10, 0.0075],
  ['SKU-YOG-CHILLED-BLUEB-200-10', '低温蓝莓酸奶200g*10', '6901000003003', 'CAT-L3-CHILLED-YOG', 'ACTIVE', 21, 10, 0.0075],
  ['SKU-YOG-CHILLED-0SUGAR-200-10', '低温0蔗糖酸奶200g*10', '6901000003004', 'CAT-L3-CHILLED-YOG', 'ACTIVE', 21, 10, 0.0075],
  ['SKU-YOG-DRINK-ORIGIN-330', '常温风味酸奶330ml*12', '6901000003005', 'CAT-L3-RTD-YOG', 'ACTIVE', 120, 12, 0.016],
  ['SKU-YOG-DRINK-MANGO-330', '芒果风味酸奶330ml*12', '6901000003006', 'CAT-L3-RTD-YOG', 'ACTIVE', 120, 12, 0.016],
  ['SKU-YOG-GREEK-135-12', '希腊酸奶135g*12', '6901000003007', 'CAT-L3-CHILLED-YOG', 'ACTIVE', 28, 12, 0.0045],
  ['SKU-PROBIOTIC-100-30', '益生菌饮品100ml*30', '6901000003008', 'CAT-L3-RTD-YOG', 'ACTIVE', 60, 30, 0.012],
  ['SKU-POWDER-ADULT-800', '成人高钙奶粉800g', '6901000004001', 'CAT-L3-ADULT-POWDER', 'ACTIVE', 540, 1, 0.0022],
  ['SKU-POWDER-ADULT-HIGHPRO-800', '成人高蛋白奶粉800g', '6901000004002', 'CAT-L3-ADULT-POWDER', 'ACTIVE', 540, 1, 0.0022],
  ['SKU-POWDER-CHILD-700', '儿童成长奶粉700g', '6901000004003', 'CAT-L3-CHILD-POWDER', 'ACTIVE', 540, 1, 0.002],
  ['SKU-POWDER-MIDDLE-750', '中老年益生菌奶粉750g', '6901000004004', 'CAT-L3-ADULT-POWDER', 'ACTIVE', 540, 1, 0.0021],
  ['SKU-CHEESE-MOZ-200', '马苏里拉芝士200g', '6901000005001', 'CAT-L3-MOZZARELLA', 'ACTIVE', 180, 1, 0.0007],
  ['SKU-CHEESE-CREAM-180', '奶油芝士180g', '6901000005002', 'CAT-L3-CREAM-CHEESE', 'ACTIVE', 120, 1, 0.0006],
  ['SKU-CHEESE-SLICE-144', '奶酪片144g*12', '6901000005003', 'CAT-L3-CREAM-CHEESE', 'INACTIVE', 120, 12, 0.005]
].map((x, i) => stamp({ id: i + 1, sku_code: x[0], sku_name: x[1], bar_code: x[2], category_code: x[3], lifecycle_status: x[4], shelf_life_days: x[5], unit_ratio: x[6], volume_m3: x[7] }));

const skuMap = new Map(sku.map((s) => [s.sku_code, s]));
const activeSku = sku.filter((s) => s.lifecycle_status === 'ACTIVE' && Number(s.status) === 1);

const rDef = [
  ['RS-EAST-LIANHUA', '苏州联华冷链贸易有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-CITY', '华东', 'WH-DC-SUZHOU', '年度框架', '2026-01-01', '2026-12-31', 'SUZHOU'],
  ['RS-EAST-RUNTAI', '南京润泰商贸有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-COUNTY', '华东', 'WH-DC-NANJING', '年度框架', '2026-01-01', '2026-12-31', 'NANJING'],
  ['RS-EAST-HYPER-SH', '上海万禾商超渠道有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-KA', 'CH-L3-KA-HYPER', '华东', 'WH-RDC-EAST-SH', '联营合同', '2026-01-01', '2026-12-31', 'SH'],
  ['RS-SOUTH-GDT', '广州广德通食品有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-CITY', '华南', 'WH-DC-SHENZHEN', '年度框架', '2026-01-01', '2026-12-31', 'GZ'],
  ['RS-SOUTH-FS', '佛山华润冷链配送有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-KA', 'CH-L3-KA-CVS', '华南', 'WH-DC-FOSHAN', '联营合同', '2026-01-01', '2026-12-31', 'FOSHAN'],
  ['RS-NORTH-HY', '北京华优乳品供应链有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-CITY', '华北', 'WH-DC-BEIJING', '年度框架', '2026-01-01', '2026-12-31', 'BEIJING'],
  ['RS-NORTH-JM', '天津津牧商贸有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-COUNTY', '华北', 'WH-RDC-NORTH-TJ', '年度框架', '2026-01-01', '2026-12-31', 'TJ'],
  ['RS-NORTH-QD', '青岛海盛冷链商贸有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-KA', 'CH-L3-KA-HYPER', '华北', 'WH-DC-QINGDAO', '联营合同', '2026-01-01', '2026-12-31', 'QINGDAO'],
  ['RS-CENTRAL-ZM', '郑州中牧食品有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-CITY', '华中', 'WH-DC-ZHENGZHOU', '年度框架', '2026-01-01', '2026-12-31', 'ZHENGZHOU'],
  ['RS-CENTRAL-XY', '长沙湘益冷链有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-COUNTY', '华中', 'WH-DC-CHANGSHA', '年度框架', '2026-01-01', '2026-12-31', 'CHANGSHA'],
  ['RS-WEST-YM', '成都益牧供应链有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-CITY', '西南', 'WH-DC-CHENGDU', '年度框架', '2026-01-01', '2026-12-31', 'CHENGDU'],
  ['RS-WEST-QR', '西安秦乳商贸有限公司', 0, 'CH-L1-OFFLINE', 'CH-L2-DIST', 'CH-L3-DIST-COUNTY', '西南', 'WH-DC-XIAN', '年度框架', '2026-01-01', '2026-12-31', 'XIAN'],
  ['RS-NEWRETAIL-HM', '盒马鲜生华东采购中心', 0, 'CH-L1-OFFLINE', 'CH-L2-NEWRETAIL', 'CH-L3-NEWRETAIL-HM', '华东', 'WH-RDC-EAST-SH', '联营合同', '2026-01-01', '2026-12-31', 'SH'],
  ['RS-NEWRETAIL-DDMC', '叮咚买菜华东供应链', 0, 'CH-L1-OFFLINE', 'CH-L2-NEWRETAIL', 'CH-L3-NEWRETAIL-DDMC', '华东', 'WH-RDC-EAST-SH', '联营合同', '2026-01-01', '2026-12-31', 'SH'],
  ['RS-OWN-TM', '认养一头牛天猫旗舰店', 1, 'CH-L1-ONLINE', 'CH-L2-ECOM', 'CH-L3-ECOM-TM', '全国', 'WH-HQ-HZ', '自营', '2026-01-01', '2030-12-31', 'HZ'],
  ['RS-OWN-JD', '认养一头牛京东自营旗舰店', 1, 'CH-L1-ONLINE', 'CH-L2-ECOM', 'CH-L3-ECOM-JD', '全国', 'WH-HQ-HZ', '自营', '2026-01-01', '2030-12-31', 'HZ'],
  ['RS-OWN-DY', '认养一头牛抖音旗舰店', 1, 'CH-L1-ONLINE', 'CH-L2-ECOM', 'CH-L3-ECOM-DY', '全国', 'WH-HQ-HZ', '自营', '2026-01-01', '2030-12-31', 'HZ'],
  ['RS-OWN-WX', '认养一头牛微信小程序商城', 1, 'CH-L1-ONLINE', 'CH-L2-PRIVATE', 'CH-L3-PRIVATE-WX', '全国', 'WH-HQ-HZ', '自营', '2026-01-01', '2030-12-31', 'HZ'],
  ['RS-OWN-LIVE', '认养一头牛私域直播间', 1, 'CH-L1-ONLINE', 'CH-L2-PRIVATE', 'CH-L3-PRIVATE-LIVE', '全国', 'WH-HQ-HZ', '自营', '2026-01-01', '2030-12-31', 'HZ']
];

const reseller = rDef.map((x, i) => {
  const l = loc[x[11]];
  const wh = whMap.get(x[7]);
  return stamp({
    id: i + 1,
    reseller_code: x[0], reseller_name: x[1], is_own: x[2],
    lv1_channel_code: x[3], lv1_channel_name: cMap.get(x[3]) || '',
    lv2_channel_code: x[4], lv2_channel_name: cMap.get(x[4]) || '',
    lv3_channel_code: x[5], lv3_channel_name: cMap.get(x[5]) || '',
    sale_region_name: x[6],
    default_warehouse_code: x[7], default_warehouse_name: wh ? wh.warehouse_name : '',
    contract_type: x[8], contract_begin_date: x[9], contract_end_date: x[10],
    province_name: l[0], city_name: l[1], district_name: l[2]
  });
});
const codes = activeSku.map((s) => s.sku_code);
const coreUht = codes.filter((c) => c.startsWith('SKU-UHT-'));
const fresh = codes.filter((c) => c.startsWith('SKU-PASTEUR-'));
const yogurt = codes.filter((c) => c.startsWith('SKU-YOG-') || c.startsWith('SKU-PROBIOTIC-'));
const powder = codes.filter((c) => c.startsWith('SKU-POWDER-'));
const cheese = codes.filter((c) => c.startsWith('SKU-CHEESE-'));

const pickSku = (r) => {
  if (r.lv2_channel_code === 'CH-L2-ECOM') return [...coreUht.slice(0, 6), ...fresh.slice(0, 3), ...yogurt.slice(0, 4), ...powder.slice(0, 3), ...cheese.slice(0, 1)];
  if (r.lv2_channel_code === 'CH-L2-PRIVATE') return [...coreUht.slice(0, 5), ...fresh.slice(0, 2), ...yogurt.slice(0, 5), ...powder.slice(0, 2)];
  if (r.lv2_channel_code === 'CH-L2-NEWRETAIL') return [...coreUht.slice(0, 4), ...fresh.slice(0, 2), ...yogurt.slice(0, 4)];
  if (r.lv2_channel_code === 'CH-L2-KA') return [...coreUht.slice(0, 4), ...yogurt.slice(0, 3), ...cheese.slice(0, 2)];
  return [...coreUht.slice(0, 5), ...fresh.slice(0, 2), ...powder.slice(0, 2)];
};

const reseller_relation = [];
const rrSet = new Set();
let rrId = 1;
for (const r of reseller) {
  for (const skuCode of [...new Set(pickSku(r))]) {
    const key = `${skuCode}::${r.reseller_code}`;
    if (rrSet.has(key)) continue;
    rrSet.add(key);

    let begin_date = '2026-01-01';
    let end_date = r.is_own ? '2030-12-31' : '2026-12-31';
    if (rrId % 17 === 0) { begin_date = '2025-01-01'; end_date = '2025-12-31'; }
    else if (rrId % 19 === 0) { begin_date = '2026-07-01'; end_date = '2027-06-30'; }

    const channel_type = r.lv1_channel_code === 'CH-L1-ONLINE'
      ? 'ONLINE'
      : (r.lv2_channel_code === 'CH-L2-KA' || r.lv2_channel_code === 'CH-L2-NEWRETAIL' ? 'STORE' : 'DIST');

    const base = r.is_own ? 6200 : (channel_type === 'STORE' ? 3600 : 2400);
    reseller_relation.push(stamp({
      id: rrId,
      sku_code: skuCode,
      reseller_code: r.reseller_code,
      reseller_name: r.reseller_name,
      region: r.sale_region_name,
      channel_type,
      begin_date,
      end_date,
      price_grade: r.is_own ? 'S' : (channel_type === 'STORE' ? 'A' : 'B'),
      quota_cases: base + (rrId % 7) * 280
    }));
    rrId += 1;
  }
}

const rltn_warehouse_sku = [];
const wsSet = new Set();
let wsId = 1;
for (const w of warehouse.filter((x) => [1, 2, 4].includes(Number(x.warehouse_type)))) {
  let pool = [];
  if (Number(w.warehouse_type) === 1) pool = activeSku.map((s) => s.sku_code);
  else if (Number(w.warehouse_type) === 2) pool = [...coreUht.slice(0, 6), ...fresh.slice(0, 3), ...yogurt.slice(0, 4), ...powder.slice(0, 3)];
  else pool = [...coreUht.slice(0, 4), ...fresh.slice(0, 2), ...yogurt.slice(0, 3), ...powder.slice(0, 1)];

  for (const skuCode of [...new Set(pool)]) {
    const key = `${w.warehouse_code}::${skuCode}`;
    if (wsSet.has(key)) continue;
    wsSet.add(key);

    let begin_date = '2026-01-01';
    let end_date = '2026-12-31';
    if (wsId % 23 === 0) { begin_date = '2025-01-01'; end_date = '2025-12-31'; }

    rltn_warehouse_sku.push(stamp({
      id: wsId,
      warehouse_code: w.warehouse_code,
      warehouse_name: w.warehouse_name,
      sku_code: skuCode,
      sku_name: skuMap.get(skuCode)?.sku_name || '',
      begin_date,
      end_date
    }));
    wsId += 1;
  }
}

const orgRegion = { '华东': 'ORG-EAST-SZ', '华南': 'ORG-SOUTH-GD', '华北': 'ORG-NORTH-BJ', '华中': 'ORG-CENTRAL-HN', '西南': 'ORG-WEST-SC', '全国': 'ORG-ECOM' };
const rltn_org_reseller = reseller.map((r, i) => {
  const org_code = orgRegion[r.sale_region_name] || 'ORG-SALES';
  return stamp({
    id: i + 1,
    org_code,
    org_name: oMap.get(org_code) || '',
    reseller_code: r.reseller_code,
    reseller_name: r.reseller_name,
    lv1_channel_name: r.lv1_channel_name,
    begin_date: '2026-01-01',
    end_date: r.is_own ? '2030-12-31' : '2026-12-31'
  });
});

const rltn_product_sku = activeSku.map((s, i) => {
  let ratio = 1;
  if (s.sku_code.includes('POWDER')) ratio = 0.985;
  if (s.sku_code.includes('YOG')) ratio = 1.02;
  if (s.sku_code.includes('CHEESE')) ratio = 0.96;
  return stamp({
    id: i + 1,
    product_code: `PRD-${s.sku_code.replace(/^SKU-/, '')}`,
    product_name: `${s.sku_name.split('*')[0]}生产转换项`,
    sku_code: s.sku_code,
    sku_name: s.sku_name,
    convert_ratio: Number(ratio.toFixed(4)),
    begin_date: '2026-01-01',
    end_date: '2028-12-31'
  });
});

const products = activeSku.map((s, i) => ({
  id: i + 1,
  product_code: s.sku_code,
  product_name: s.sku_name,
  material_type: Number(s.shelf_life_days) <= 30 ? 'LowTemp' : 'Normal',
  shelf_life: Number(s.shelf_life_days),
  category_code: s.category_code
}));

const regionByW = (w) => {
  const c = String(w.warehouse_code || '');
  const city = String(w.city_name || '');
  if (Number(w.warehouse_type) === 1 || c.includes('-HQ-')) return '全国';
  if (c.includes('EAST') || ['上海市', '苏州市', '南京市'].includes(city)) return '华东';
  if (c.includes('SOUTH') || ['广州市', '深圳市', '佛山市'].includes(city)) return '华南';
  if (c.includes('NORTH') || ['北京市', '天津市', '青岛市'].includes(city)) return '华北';
  if (c.includes('CENTRAL') || ['武汉市', '郑州市', '长沙市'].includes(city)) return '华中';
  return '西南';
};

const distWs = warehouse.filter((w) => [1, 2, 4].includes(Number(w.warehouse_type)));
const pastureWs = warehouse.filter((w) => Number(w.warehouse_type) === 3);
const orders = [];
for (let i = 0; i < 260; i += 1) {
  const d = distWs[i % distWs.length];
  const s = activeSku[(i * 7) % activeSku.length];
  const p = pastureWs[(i + d.id) % pastureWs.length];
  const matched = i % 4 !== 0;

  const tm = new Date();
  tm.setDate(tm.getDate() - (i % 35));
  tm.setHours(6 + (i % 14), (i * 11) % 60, 0, 0);

  const yy = tm.getFullYear();
  const mm = String(tm.getMonth() + 1).padStart(2, '0');
  const dd = String(tm.getDate()).padStart(2, '0');
  const base = Number(s.shelf_life_days) <= 30 ? 900 : 1800;

  orders.push({
    id: i + 1,
    order_id: `ORD${yy}${mm}${dd}${String(i + 1).padStart(5, '0')}`,
    distributor_id: d.id,
    distributor_name: d.warehouse_name,
    region: regionByW(d),
    sku_id: s.sku_code,
    sku_name: s.sku_name,
    request_liters: base + (i % 9) * 120 + (i % 3) * 45,
    source_pasture_id: matched ? p.id : null,
    source_pasture_name: matched ? p.warehouse_name : '',
    status: matched ? 'Matched' : 'Pending',
    match_score: matched ? Number((0.82 + (i % 12) * 0.01).toFixed(2)) : 0,
    create_time: tm.toISOString()
  });
}

const pasture_stats = pastureWs.map((w, i) => {
  const d1 = 26800 + i * 1750;
  const d2 = d1 - 820 + i * 110;
  const d3 = d2 - 760 + i * 95;
  return {
    id: w.id,
    name: w.warehouse_name,
    lat: Number(w.latitude),
    lng: Number(w.longitude),
    airQuality: i <= 1 ? '优' : (i <= 3 ? '良' : '中'),
    aqi: 26 + i * 5,
    yields: [d1, d2, d3],
    totalYield: d1 + d2 + d3
  };
});
const calendar = Array.isArray(db.master?.calendar) ? db.master.calendar : [];

db.master = {
  ...(db.master || {}),
  category,
  warehouse,
  factory,
  channel,
  reseller,
  org,
  sku,
  reseller_relation,
  rltn_warehouse_sku,
  rltn_org_reseller,
  rltn_product_sku,
  calendar
};

db.biz = { products, orders, pasture_stats };
db.meta = { ...(db.meta || {}), updated_at: now, storage_mode: 'local-json' };

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

console.log('Master data local fill done.');
console.log(JSON.stringify({
  category: category.length,
  factory: factory.length,
  warehouse: warehouse.length,
  channel: channel.length,
  reseller: reseller.length,
  org: org.length,
  sku: sku.length,
  reseller_relation: reseller_relation.length,
  rltn_warehouse_sku: rltn_warehouse_sku.length,
  rltn_org_reseller: rltn_org_reseller.length,
  rltn_product_sku: rltn_product_sku.length,
  products: products.length,
  orders: orders.length,
  pasture_stats: pasture_stats.length,
  calendar: calendar.length
}, null, 2));
