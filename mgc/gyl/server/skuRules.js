const SKU_RULE_FORMAT_TEXT = 'SKU-品类码-工艺码-规格码-包装码-属性码-流水号';
const SKU_RULE_EXAMPLE = {
  sku_code: 'SKU-UHT-UHT-250ML-12BX-PLN-001',
  sku_name: '常温纯牛奶250ml×12盒',
  bar_code: '6900000000001',
  category_code: 'CAT-L3-UHT',
  lifecycle_status: 'ACTIVE',
  shelf_life_days: 180,
  unit_ratio: 12,
  volume_m3: 0.014
};

const SKU_RULE_REGEX_SOURCE = '^SKU-[A-Z]{3}-[A-Z]{3}-(?:\\d+ML|\\d+L|\\d+G|\\d+KG)-\\d{2}[A-Z]{2}-[A-Z0-9]{3}-\\d{3}$';
const SKU_RULE_REGEX = new RegExp(SKU_RULE_REGEX_SOURCE);
const SKU_SPEC_REGEX = /^(?:\d+ML|\d+L|\d+G|\d+KG)$/;
const SKU_PACK_REGEX = /^\d{2}[A-Z]{2}$/;
const SKU_ATTR_REGEX = /^[A-Z0-9]{3}$/;
const SKU_SERIAL_REGEX = /^\d{3}$/;

const SKU_DICT_TYPE_CODE = {
  category: 'sku_category_code',
  process: 'sku_process_code',
  pack: 'sku_pack_code',
  attr: 'sku_attr_code'
};

const SKU_RULE_DICT_TYPES = [
  {
    id: 101,
    dict_type_code: SKU_DICT_TYPE_CODE.category,
    dict_type_name: 'SKU品类码',
    status: 1,
    sort_order: 101,
    remark: 'SKU第2段，表示商品大类',
    system_flag: 1
  },
  {
    id: 102,
    dict_type_code: SKU_DICT_TYPE_CODE.process,
    dict_type_name: 'SKU工艺码',
    status: 1,
    sort_order: 102,
    remark: 'SKU第3段，表示工艺或产品形态',
    system_flag: 1
  },
  {
    id: 103,
    dict_type_code: SKU_DICT_TYPE_CODE.pack,
    dict_type_name: 'SKU包装码',
    status: 1,
    sort_order: 103,
    remark: 'SKU第5段，表示包装数量和包装类型',
    system_flag: 1
  },
  {
    id: 104,
    dict_type_code: SKU_DICT_TYPE_CODE.attr,
    dict_type_name: 'SKU属性码',
    status: 1,
    sort_order: 104,
    remark: 'SKU第6段，表示主差异属性',
    system_flag: 1
  }
];

const SKU_RULE_DICT_ITEMS = [
  { id: 1001, dict_type_code: SKU_DICT_TYPE_CODE.category, item_code: 'UHT', item_name: '常温液奶', item_value: 'UHT', item_color: 'primary', sort_order: 1, status: 1, system_flag: 1, remark: '常温液奶' },
  { id: 1002, dict_type_code: SKU_DICT_TYPE_CODE.category, item_code: 'FRM', item_name: '巴氏鲜奶', item_value: 'FRM', item_color: 'success', sort_order: 2, status: 1, system_flag: 1, remark: '鲜奶/低温鲜奶' },
  { id: 1003, dict_type_code: SKU_DICT_TYPE_CODE.category, item_code: 'YOG', item_name: '酸奶', item_value: 'YOG', item_color: 'warning', sort_order: 3, status: 1, system_flag: 1, remark: '发酵乳/酸奶' },
  { id: 1004, dict_type_code: SKU_DICT_TYPE_CODE.category, item_code: 'DRK', item_name: '乳饮品', item_value: 'DRK', item_color: 'warning', sort_order: 4, status: 1, system_flag: 1, remark: '乳饮料/即饮型饮品' },
  { id: 1005, dict_type_code: SKU_DICT_TYPE_CODE.category, item_code: 'PWD', item_name: '奶粉', item_value: 'PWD', item_color: 'danger', sort_order: 5, status: 1, system_flag: 1, remark: '粉状奶粉' },
  { id: 1006, dict_type_code: SKU_DICT_TYPE_CODE.category, item_code: 'CHS', item_name: '芝士', item_value: 'CHS', item_color: 'info', sort_order: 6, status: 1, system_flag: 1, remark: '芝士/奶酪制品' },

  { id: 1101, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'UHT', item_name: '超高温灭菌', item_value: 'UHT', item_color: 'primary', sort_order: 1, status: 1, system_flag: 1, remark: '常温灭菌工艺' },
  { id: 1102, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'PAS', item_name: '巴氏杀菌', item_value: 'PAS', item_color: 'success', sort_order: 2, status: 1, system_flag: 1, remark: '巴氏杀菌工艺' },
  { id: 1103, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'CHL', item_name: '冷藏低温', item_value: 'CHL', item_color: 'warning', sort_order: 3, status: 1, system_flag: 1, remark: '低温冷藏型' },
  { id: 1104, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'RTD', item_name: '即饮型', item_value: 'RTD', item_color: 'warning', sort_order: 4, status: 1, system_flag: 1, remark: '开盖即饮' },
  { id: 1105, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'GRK', item_name: '希腊型', item_value: 'GRK', item_color: 'warning', sort_order: 5, status: 1, system_flag: 1, remark: '希腊酸奶型' },
  { id: 1106, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'PWD', item_name: '粉状', item_value: 'PWD', item_color: 'danger', sort_order: 6, status: 1, system_flag: 1, remark: '粉状形态' },
  { id: 1107, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'CRM', item_name: '奶油型', item_value: 'CRM', item_color: 'info', sort_order: 7, status: 1, system_flag: 1, remark: '奶油芝士型' },
  { id: 1108, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'MOZ', item_name: '马苏里拉型', item_value: 'MOZ', item_color: 'info', sort_order: 8, status: 1, system_flag: 1, remark: '马苏里拉' },
  { id: 1109, dict_type_code: SKU_DICT_TYPE_CODE.process, item_code: 'SLC', item_name: '切片型', item_value: 'SLC', item_color: 'info', sort_order: 9, status: 1, system_flag: 1, remark: '切片奶酪' },

  { id: 1201, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '01BT', item_name: '单瓶', item_value: '01BT', item_color: 'primary', sort_order: 1, status: 1, system_flag: 1, remark: '1瓶装' },
  { id: 1202, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '01BX', item_name: '单盒', item_value: '01BX', item_color: 'primary', sort_order: 2, status: 1, system_flag: 1, remark: '1盒装' },
  { id: 1203, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '01BG', item_name: '单袋', item_value: '01BG', item_color: 'primary', sort_order: 3, status: 1, system_flag: 1, remark: '1袋装' },
  { id: 1204, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '01CN', item_name: '单罐', item_value: '01CN', item_color: 'primary', sort_order: 4, status: 1, system_flag: 1, remark: '1罐装' },
  { id: 1205, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '10CP', item_name: '10杯装', item_value: '10CP', item_color: 'success', sort_order: 5, status: 1, system_flag: 1, remark: '10杯装' },
  { id: 1206, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '12BX', item_name: '12盒装', item_value: '12BX', item_color: 'success', sort_order: 6, status: 1, system_flag: 1, remark: '12盒装' },
  { id: 1207, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '24BX', item_name: '24盒装', item_value: '24BX', item_color: 'success', sort_order: 7, status: 1, system_flag: 1, remark: '24盒装' },
  { id: 1208, dict_type_code: SKU_DICT_TYPE_CODE.pack, item_code: '30BT', item_name: '30瓶装', item_value: '30BT', item_color: 'success', sort_order: 8, status: 1, system_flag: 1, remark: '30瓶装' },

  { id: 1301, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'PLN', item_name: '基础款/原味', item_value: 'PLN', item_color: 'primary', sort_order: 1, status: 1, system_flag: 1, remark: '基础款或原味' },
  { id: 1302, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'HCL', item_name: '高钙', item_value: 'HCL', item_color: 'success', sort_order: 2, status: 1, system_flag: 1, remark: '高钙' },
  { id: 1303, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'A2N', item_name: 'A2', item_value: 'A2N', item_color: 'success', sort_order: 3, status: 1, system_flag: 1, remark: 'A2配方' },
  { id: 1304, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'ORG', item_name: '有机', item_value: 'ORG', item_color: 'success', sort_order: 4, status: 1, system_flag: 1, remark: '有机认证' },
  { id: 1305, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'ADT', item_name: '成人', item_value: 'ADT', item_color: 'warning', sort_order: 5, status: 1, system_flag: 1, remark: '成人向' },
  { id: 1306, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'CHD', item_name: '儿童', item_value: 'CHD', item_color: 'warning', sort_order: 6, status: 1, system_flag: 1, remark: '儿童向' },
  { id: 1307, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'MID', item_name: '中老年', item_value: 'MID', item_color: 'warning', sort_order: 7, status: 1, system_flag: 1, remark: '中老年向' },
  { id: 1308, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'STR', item_name: '草莓味', item_value: 'STR', item_color: 'danger', sort_order: 8, status: 1, system_flag: 1, remark: '草莓味' },
  { id: 1309, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'BLU', item_name: '蓝莓味', item_value: 'BLU', item_color: 'danger', sort_order: 9, status: 1, system_flag: 1, remark: '蓝莓味' },
  { id: 1310, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'MNG', item_name: '芒果味', item_value: 'MNG', item_color: 'danger', sort_order: 10, status: 1, system_flag: 1, remark: '芒果味' },
  { id: 1311, dict_type_code: SKU_DICT_TYPE_CODE.attr, item_code: 'ZSG', item_name: '零蔗糖', item_value: 'ZSG', item_color: 'danger', sort_order: 11, status: 1, system_flag: 1, remark: '零蔗糖' }
];

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const sortItems = (rows) => [...rows].sort((a, b) => {
  const aSort = Number(a.sort_order || 0);
  const bSort = Number(b.sort_order || 0);
  if (aSort !== bSort) return aSort - bSort;
  return String(a.item_code || '').localeCompare(String(b.item_code || ''));
});

const getDefaultItemsByType = (dictTypeCode) => sortItems(
  SKU_RULE_DICT_ITEMS.filter((item) => String(item.dict_type_code) === String(dictTypeCode) && Number(item.status ?? 1) !== 0)
);

const getRuleItemsByType = (dictItems = [], dictTypeCode) => {
  const active = sortItems(
    (Array.isArray(dictItems) ? dictItems : []).filter(
      (item) => String(item.dict_type_code) === String(dictTypeCode) && Number(item.status ?? 1) !== 0
    )
  );
  return active.length ? active : getDefaultItemsByType(dictTypeCode);
};

const buildSkuRuleLookup = (dictItems = []) => {
  const categoryItems = getRuleItemsByType(dictItems, SKU_DICT_TYPE_CODE.category);
  const processItems = getRuleItemsByType(dictItems, SKU_DICT_TYPE_CODE.process);
  const packItems = getRuleItemsByType(dictItems, SKU_DICT_TYPE_CODE.pack);
  const attrItems = getRuleItemsByType(dictItems, SKU_DICT_TYPE_CODE.attr);

  return {
    categoryItems,
    processItems,
    packItems,
    attrItems,
    categorySet: new Set(categoryItems.map((item) => normalizeCode(item.item_code))),
    processSet: new Set(processItems.map((item) => normalizeCode(item.item_code))),
    packSet: new Set(packItems.map((item) => normalizeCode(item.item_code))),
    attrSet: new Set(attrItems.map((item) => normalizeCode(item.item_code)))
  };
};

const buildSkuRuleConfig = (dictItems = []) => {
  const lookup = buildSkuRuleLookup(dictItems);
  return {
    format: SKU_RULE_FORMAT_TEXT,
    regex: SKU_RULE_REGEX_SOURCE,
    example: { ...SKU_RULE_EXAMPLE },
    rules: [
      '固定7段：SKU-品类码-工艺码-规格码-包装码-属性码-流水号',
      '规格码必须带单位，只允许 ML、L、G、KG，例如 250ML、1L、200G、800G',
      '包装码固定为两位数量加两位包装类型，例如 12BX、10CP、01CN',
      '属性码固定3位，只保留一个主属性码',
      '流水号固定3位数字，例如 001'
    ],
    dictSections: [
      {
        key: 'category',
        dictTypeCode: SKU_DICT_TYPE_CODE.category,
        dictTypeName: 'SKU品类码',
        segment: '第2段',
        items: lookup.categoryItems.map((item) => ({ code: item.item_code, name: item.item_name, remark: item.remark || '' }))
      },
      {
        key: 'process',
        dictTypeCode: SKU_DICT_TYPE_CODE.process,
        dictTypeName: 'SKU工艺码',
        segment: '第3段',
        items: lookup.processItems.map((item) => ({ code: item.item_code, name: item.item_name, remark: item.remark || '' }))
      },
      {
        key: 'pack',
        dictTypeCode: SKU_DICT_TYPE_CODE.pack,
        dictTypeName: 'SKU包装码',
        segment: '第5段',
        items: lookup.packItems.map((item) => ({ code: item.item_code, name: item.item_name, remark: item.remark || '' }))
      },
      {
        key: 'attr',
        dictTypeCode: SKU_DICT_TYPE_CODE.attr,
        dictTypeName: 'SKU属性码',
        segment: '第6段',
        items: lookup.attrItems.map((item) => ({ code: item.item_code, name: item.item_name, remark: item.remark || '' }))
      }
    ]
  };
};

const validateSkuCode = (skuCode, dictItems = []) => {
  const normalizedCode = normalizeCode(skuCode);
  const errors = [];
  const lookup = buildSkuRuleLookup(dictItems);

  if (!normalizedCode) {
    errors.push('SKU编码不能为空');
    return { ok: false, normalizedCode, errors };
  }

  if (/[^A-Z0-9-]/.test(normalizedCode)) {
    errors.push('SKU编码仅支持大写字母、数字和短横线');
  }

  const segments = normalizedCode.split('-');
  if (segments.length !== 7) {
    errors.push(`SKU编码必须是7段式，格式为 ${SKU_RULE_FORMAT_TEXT}`);
    return { ok: false, normalizedCode, errors };
  }

  const [prefix, categoryCode, processCode, specCode, packCode, attrCode, serialCode] = segments;
  if (prefix !== 'SKU') errors.push('SKU编码必须以 SKU 开头');
  if (!lookup.categorySet.has(categoryCode)) errors.push(`品类码 ${categoryCode} 不在SKU编码字典中`);
  if (!lookup.processSet.has(processCode)) errors.push(`工艺码 ${processCode} 不在SKU编码字典中`);
  if (!SKU_SPEC_REGEX.test(specCode)) errors.push('规格码必须带单位，例如 250ML、1L、200G、800G');
  if (!SKU_PACK_REGEX.test(packCode)) errors.push('包装码格式错误，应为两位数量加两位包装类型，例如 12BX、10CP、01CN');
  if (!lookup.packSet.has(packCode)) errors.push(`包装码 ${packCode} 不在SKU编码字典中`);
  if (!SKU_ATTR_REGEX.test(attrCode)) errors.push('属性码格式错误，应为3位大写字母或数字');
  if (!lookup.attrSet.has(attrCode)) errors.push(`属性码 ${attrCode} 不在SKU编码字典中`);
  if (!SKU_SERIAL_REGEX.test(serialCode)) errors.push('流水号必须为3位数字，例如 001');

  return {
    ok: errors.length === 0,
    normalizedCode,
    errors,
    segments: { prefix, categoryCode, processCode, specCode, packCode, attrCode, serialCode }
  };
};

module.exports = {
  SKU_RULE_DICT_TYPES,
  SKU_RULE_DICT_ITEMS,
  SKU_RULE_EXAMPLE,
  SKU_RULE_FORMAT_TEXT,
  SKU_RULE_REGEX_SOURCE,
  SKU_RULE_REGEX,
  buildSkuRuleConfig,
  buildSkuRuleLookup,
  normalizeCode,
  validateSkuCode
};
