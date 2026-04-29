const nowIso = () => new Date().toISOString();

const DAIRY_CATEGORY_DEFINITIONS = [
  ['CAT-L1-LIQUID-DAIRY', '\u6db2\u6001\u5976\u5236\u54c1', 1, null, 1],
  ['CAT-L1-SOLID-DAIRY', '\u56fa\u6001\u5976\u5236\u54c1', 1, null, 2],
  ['CAT-L1-SEMI-DAIRY', '\u534a\u56fa\u6001\u5976\u5236\u54c1', 1, null, 3],
  ['CAT-L2-UHT-MILK', '\u5e38\u6e29\u6db2\u6001\u5976', 2, 'CAT-L1-LIQUID-DAIRY', 1],
  ['CAT-L2-FRESH-MILK', '\u4f4e\u6e29\u6db2\u6001\u5976', 2, 'CAT-L1-LIQUID-DAIRY', 2],
  ['CAT-L2-MILK-DRINK', '\u4e73\u996e\u54c1', 2, 'CAT-L1-LIQUID-DAIRY', 3],
  ['CAT-L2-SPECIAL-MILK', '\u7279\u8272\u5976\u6e90', 2, 'CAT-L1-LIQUID-DAIRY', 4],
  ['CAT-L2-MILKPOWDER', '\u5976\u7c89', 2, 'CAT-L1-SOLID-DAIRY', 1],
  ['CAT-L2-CHEESE', '\u5976\u916a', 2, 'CAT-L1-SOLID-DAIRY', 2],
  ['CAT-L2-YOGURT', '\u9178\u5976', 2, 'CAT-L1-SEMI-DAIRY', 1],
  ['CAT-L2-CREAM-CHEESE', '\u829d\u58eb/\u4e73\u8102', 2, 'CAT-L1-SEMI-DAIRY', 2],
  ['CAT-L2-SPECIAL-FERMENT', '\u7279\u8272\u53d1\u9175\u4e73', 2, 'CAT-L1-SEMI-DAIRY', 3],
  ['CAT-L3-UHT', '\u5e38\u6e29\u7eaf\u5976', 3, 'CAT-L2-UHT-MILK', 1],
  ['CAT-L3-PASTEUR', '\u5df4\u6c0f\u9c9c\u5976', 3, 'CAT-L2-FRESH-MILK', 1],
  ['CAT-L3-RTD-YOG', '\u5e38\u6e29\u9178\u5976\u996e\u54c1', 3, 'CAT-L2-MILK-DRINK', 1],
  ['CAT-L3-PROBIOTIC-DRK', '\u76ca\u751f\u83cc\u4e73\u996e\u54c1', 3, 'CAT-L2-MILK-DRINK', 2],
  ['CAT-L3-CAMEL-MILK', '\u9a86\u9a7c\u5976\u5236\u54c1', 3, 'CAT-L2-SPECIAL-MILK', 1],
  ['CAT-L3-MARE-MILK', '\u9a6c\u5976\u5236\u54c1', 3, 'CAT-L2-SPECIAL-MILK', 2],
  ['CAT-L3-DONKEY-MILK', '\u9a74\u5976\u5236\u54c1', 3, 'CAT-L2-SPECIAL-MILK', 3],
  ['CAT-L3-ADULT-POWDER', '\u6210\u4eba\u5976\u7c89', 3, 'CAT-L2-MILKPOWDER', 1],
  ['CAT-L3-CHILD-POWDER', '\u513f\u7ae5\u5976\u7c89', 3, 'CAT-L2-MILKPOWDER', 2],
  ['CAT-L3-MIDDLE-POWDER', '\u4e2d\u8001\u5e74\u5976\u7c89', 3, 'CAT-L2-MILKPOWDER', 3],
  ['CAT-L3-MOZZARELLA', '\u9a6c\u82cf\u91cc\u62c9', 3, 'CAT-L2-CHEESE', 1],
  ['CAT-L3-CHEESE-SLICE', '\u5976\u916a\u7247/\u518d\u5236\u5976\u916a', 3, 'CAT-L2-CHEESE', 2],
  ['CAT-L3-CHILLED-YOG', '\u51b7\u85cf\u9178\u5976', 3, 'CAT-L2-YOGURT', 1],
  ['CAT-L3-GREEK-YOG', '\u5e0c\u814a\u9178\u5976', 3, 'CAT-L2-YOGURT', 2],
  ['CAT-L3-CREAM-CHEESE', '\u5976\u6cb9\u829d\u58eb', 3, 'CAT-L2-CREAM-CHEESE', 1],
  ['CAT-L3-SOUR-CREAM', '\u9178\u5976\u6cb9', 3, 'CAT-L2-CREAM-CHEESE', 2],
  ['CAT-L3-GHEE', '\u9165\u6cb9/\u6f84\u6e05\u9ec4\u6cb9', 3, 'CAT-L2-CREAM-CHEESE', 3],
  ['CAT-L3-KEFIR', '\u514b\u83f2\u5c14\u53d1\u9175\u4e73', 3, 'CAT-L2-SPECIAL-FERMENT', 1]
];

const LEGACY_CATEGORY_CODES = new Set([
  'CAT-L1-DAIRY',
  'CAT-L1-NUTRITION',
  'CAT-L2-LIQUID',
  'CAT-L2-REGIONAL-DAIRY'
]);

const SKU_CODE_MIGRATIONS = {
  'SKU-UHT-250-12': 'SKU-UHT-UHT-250ML-12BX-PLN-001',
  'SKU-UHT-250-24': 'SKU-UHT-UHT-250ML-24BX-PLN-001',
  'SKU-UHT-200-10': 'SKU-UHT-UHT-200ML-10BX-PLN-001',
  'SKU-UHT-1L-12': 'SKU-UHT-UHT-1L-12BX-PLN-001',
  'SKU-UHT-HIGHCAL-250-12': 'SKU-UHT-UHT-250ML-12BX-HCL-001',
  'SKU-UHT-A2-250-12': 'SKU-UHT-UHT-250ML-12BX-A2N-001',
  'SKU-UHT-ORGANIC-250-12': 'SKU-UHT-UHT-250ML-12BX-ORG-001',
  'SKU-PASTEUR-950': 'SKU-FRM-PAS-950ML-01BT-PLN-001',
  'SKU-PASTEUR-450': 'SKU-FRM-PAS-450ML-01BT-PLN-001',
  'SKU-PASTEUR-HIGHCAL-950': 'SKU-FRM-PAS-950ML-01BT-HCL-001',
  'SKU-PASTEUR-CHILD-750': 'SKU-FRM-PAS-750ML-01BT-CHD-001',
  'SKU-YOG-CHILLED-ORIGIN-200-10': 'SKU-YOG-CHL-200G-10CP-PLN-001',
  'SKU-YOG-CHILLED-STRAW-200-10': 'SKU-YOG-CHL-200G-10CP-STR-001',
  'SKU-YOG-CHILLED-BLUEB-200-10': 'SKU-YOG-CHL-200G-10CP-BLU-001',
  'SKU-YOG-CHILLED-0SUGAR-200-10': 'SKU-YOG-CHL-200G-10CP-ZSG-001',
  'SKU-YOG-DRINK-ORIGIN-330': 'SKU-YOG-RTD-330ML-12BX-PLN-001',
  'SKU-YOG-DRINK-MANGO-330': 'SKU-YOG-RTD-330ML-12BX-MNG-001',
  'SKU-YOG-GREEK-135-12': 'SKU-YOG-GRK-135G-12CP-PLN-001',
  'SKU-PROBIOTIC-100-30': 'SKU-DRK-RTD-100ML-30BT-PRB-001',
  'SKU-POWDER-ADULT-800': 'SKU-PWD-PWD-800G-01CN-HCL-001',
  'SKU-POWDER-ADULT-HIGHPRO-800': 'SKU-PWD-PWD-800G-01CN-HPR-001',
  'SKU-POWDER-CHILD-700': 'SKU-PWD-PWD-700G-01CN-CHD-001',
  'SKU-POWDER-MIDDLE-750': 'SKU-PWD-PWD-750G-01CN-MID-001',
  'SKU-CHEESE-MOZ-200': 'SKU-CHS-MOZ-200G-01BG-PLN-001',
  'SKU-CHEESE-CREAM-180': 'SKU-CHS-CRM-180G-01BX-PLN-001',
  'SKU-CHEESE-SLICE-144': 'SKU-CHS-SLC-144G-12BX-PLN-001'
};

const SKU_CATEGORY_OVERRIDES = {
  'SKU-DRK-RTD-100ML-30BT-PRB-001': 'CAT-L3-PROBIOTIC-DRK',
  'SKU-PWD-PWD-750G-01CN-MID-001': 'CAT-L3-MIDDLE-POWDER',
  'SKU-CHS-SLC-144G-12BX-PLN-001': 'CAT-L3-CHEESE-SLICE',
  'SKU-YOG-GRK-135G-12CP-PLN-001': 'CAT-L3-GREEK-YOG'
};

const SPU_CATEGORY_OVERRIDES = {
  'SPU-YOG-GREEK': 'CAT-L3-GREEK-YOG',
  'SPU-PROBIOTIC-DRINK': 'CAT-L3-PROBIOTIC-DRK',
  'SPU-POWDER-MIDDLE': 'CAT-L3-MIDDLE-POWDER',
  'SPU-CHEESE-SLICE': 'CAT-L3-CHEESE-SLICE'
};

const normalizeCode = (value) => String(value || '').trim();

const buildDairyCategoryRows = (timeIso = nowIso(), existingRows = []) => {
  const existingByCode = new Map((Array.isArray(existingRows) ? existingRows : []).map((row) => [row.category_code, row]));
  return DAIRY_CATEGORY_DEFINITIONS.map((item, index) => {
    const existing = existingByCode.get(item[0]);
    const unchanged = existing
      && existing.category_name === item[1]
      && Number(existing.level) === item[2]
      && (existing.parent_code || null) === item[3]
      && Number(existing.sort_order) === item[4]
      && Number(existing.status ?? 1) === 1;

    return {
      id: index + 1,
      category_code: item[0],
      category_name: item[1],
      level: item[2],
      parent_code: item[3],
      sort_order: item[4],
      status: 1,
      remark: existing?.remark || '',
      created_time: existing?.created_time || timeIso,
      updated_time: unchanged ? (existing.updated_time || timeIso) : timeIso
    };
  });
};

const replaceSkuCodes = (value) => {
  if (typeof value === 'string') {
    return Object.entries(SKU_CODE_MIGRATIONS).reduce((text, [oldCode, newCode]) => text.split(oldCode).join(newCode), value);
  }
  if (Array.isArray(value)) return value.map(replaceSkuCodes);
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      value[key] = replaceSkuCodes(value[key]);
    });
  }
  return value;
};

const migrateDairyCategoryData = (db, options = {}) => {
  if (!db || typeof db !== 'object') return false;
  const timeIso = options.timeIso || nowIso();
  const before = JSON.stringify({
    master: db.master || {},
    biz: {
      products: db.biz?.products || [],
      warehouse_capabilities: db.biz?.warehouse_capabilities || [],
      inventory_stock: db.biz?.inventory_stock || []
    }
  });

  const existingCategories = Array.isArray(db.master?.category) ? db.master.category : [];

  replaceSkuCodes(db);

  db.master = db.master && typeof db.master === 'object' ? db.master : {};
  db.biz = db.biz && typeof db.biz === 'object' ? db.biz : {};
  db.master.category = buildDairyCategoryRows(timeIso, existingCategories);

  const categoryNameByCode = new Map(db.master.category.map((row) => [row.category_code, row.category_name]));

  if (Array.isArray(db.master.sku)) {
    db.master.sku.forEach((sku) => {
      const nextCategoryCode = SKU_CATEGORY_OVERRIDES[normalizeCode(sku.sku_code)];
      if (nextCategoryCode) sku.category_code = nextCategoryCode;
    });
  }

  if (Array.isArray(db.master.spu)) {
    db.master.spu.forEach((spu) => {
      const nextCategoryCode = SPU_CATEGORY_OVERRIDES[normalizeCode(spu.spu_code)];
      if (nextCategoryCode) spu.category_code = nextCategoryCode;
      if (spu.category_code && categoryNameByCode.has(spu.category_code)) {
        spu.category_name = categoryNameByCode.get(spu.category_code);
      }
    });
  }

  const skuByCode = new Map((db.master.sku || []).map((sku) => [normalizeCode(sku.sku_code), sku]));

  if (Array.isArray(db.biz.products)) {
    db.biz.products.forEach((product) => {
      const sku = skuByCode.get(normalizeCode(product.product_code));
      if (sku) categoryNameByCode.has(sku.category_code) && (product.category_code = sku.category_code);
    });
  }

  if (Array.isArray(db.biz.warehouse_capabilities)) {
    db.biz.warehouse_capabilities.forEach((capability) => {
      const supportedCategories = new Set();
      (Array.isArray(capability.supported_skus) ? capability.supported_skus : []).forEach((skuCode) => {
        const sku = skuByCode.get(normalizeCode(skuCode));
        if (sku?.category_code) supportedCategories.add(sku.category_code);
      });
      capability.supported_categories = [...supportedCategories];
    });
  }

  return before !== JSON.stringify({
    master: db.master || {},
    biz: {
      products: db.biz?.products || [],
      warehouse_capabilities: db.biz?.warehouse_capabilities || [],
      inventory_stock: db.biz?.inventory_stock || []
    }
  });
};

module.exports = {
  DAIRY_CATEGORY_DEFINITIONS,
  LEGACY_CATEGORY_CODES,
  SKU_CODE_MIGRATIONS,
  SKU_CATEGORY_OVERRIDES,
  SPU_CATEGORY_OVERRIDES,
  buildDairyCategoryRows,
  migrateDairyCategoryData
};

