const normalizeText = (value) => String(value ?? '').trim();
const normalizeCode = (value) => normalizeText(value).toUpperCase();
const toNum = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
};

const DEFAULT_BRAND_NAME = '认养一头牛';

const DEFAULT_SPU_DEFINITIONS = [
    {
        spu_code: 'SPU-UHT-PURE',
        spu_name: '常温纯牛奶',
        category_code: 'CAT-L3-UHT',
        product_line: '液态奶',
        milk_source: '牛奶',
        process_type: 'UHT灭菌',
        origin_region: '全国奶源',
        storage_type: '常温',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-UHT', nameIncludes: ['常温纯牛奶'], nameExcludes: ['高钙', 'A2', '有机', '全脂'] }
    },
    {
        spu_code: 'SPU-UHT-WHOLE',
        spu_name: '全脂纯牛奶',
        category_code: 'CAT-L3-UHT',
        product_line: '液态奶',
        milk_source: '牛奶',
        process_type: 'UHT灭菌',
        origin_region: '全国奶源',
        storage_type: '常温',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-UHT', nameIncludes: ['全脂纯牛奶'] }
    },
    {
        spu_code: 'SPU-UHT-HIGHCAL',
        spu_name: '高钙纯牛奶',
        category_code: 'CAT-L3-UHT',
        product_line: '液态奶',
        milk_source: '牛奶',
        process_type: 'UHT灭菌',
        origin_region: '全国奶源',
        storage_type: '常温',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-UHT', nameIncludes: ['高钙纯牛奶'] }
    },
    {
        spu_code: 'SPU-UHT-A2',
        spu_name: 'A2β-酪蛋白纯牛奶',
        category_code: 'CAT-L3-UHT',
        product_line: '液态奶',
        milk_source: '牛奶',
        process_type: 'UHT灭菌',
        origin_region: '全国奶源',
        storage_type: '常温',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-UHT', nameIncludes: ['A2'] }
    },
    {
        spu_code: 'SPU-UHT-ORGANIC',
        spu_name: '有机纯牛奶',
        category_code: 'CAT-L3-UHT',
        product_line: '液态奶',
        milk_source: '有机牛奶',
        process_type: 'UHT灭菌',
        origin_region: '有机牧场',
        storage_type: '常温',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-UHT', nameIncludes: ['有机纯牛奶'] }
    },
    {
        spu_code: 'SPU-PASTEUR-FRESH',
        spu_name: '巴氏鲜奶',
        category_code: 'CAT-L3-PASTEUR',
        product_line: '低温鲜奶',
        milk_source: '鲜牛奶',
        process_type: '巴氏杀菌',
        origin_region: '华东奶源',
        storage_type: '冷藏',
        shelf_life_days: 7,
        match: { categoryCode: 'CAT-L3-PASTEUR', nameIncludes: ['巴氏鲜奶'], nameExcludes: ['高钙', '儿童'] }
    },
    {
        spu_code: 'SPU-PASTEUR-HIGHCAL',
        spu_name: '高钙鲜奶',
        category_code: 'CAT-L3-PASTEUR',
        product_line: '低温鲜奶',
        milk_source: '鲜牛奶',
        process_type: '巴氏杀菌',
        origin_region: '华东奶源',
        storage_type: '冷藏',
        shelf_life_days: 10,
        match: { categoryCode: 'CAT-L3-PASTEUR', nameIncludes: ['高钙鲜奶'] }
    },
    {
        spu_code: 'SPU-PASTEUR-CHILD',
        spu_name: '儿童鲜奶',
        category_code: 'CAT-L3-PASTEUR',
        product_line: '低温鲜奶',
        milk_source: '鲜牛奶',
        process_type: '巴氏杀菌',
        origin_region: '华东奶源',
        storage_type: '冷藏',
        shelf_life_days: 7,
        match: { categoryCode: 'CAT-L3-PASTEUR', nameIncludes: ['儿童鲜奶'] }
    },
    {
        spu_code: 'SPU-YOG-CHILLED',
        spu_name: '低温风味酸奶',
        category_code: 'CAT-L3-CHILLED-YOG',
        product_line: '酸奶',
        milk_source: '发酵乳',
        process_type: '低温发酵',
        origin_region: '全国奶源',
        storage_type: '冷藏',
        shelf_life_days: 21,
        match: { categoryCode: 'CAT-L3-CHILLED-YOG', nameIncludes: ['低温'], nameExcludes: ['希腊'] }
    },
    {
        spu_code: 'SPU-YOG-DRINK',
        spu_name: '常温风味酸奶饮品',
        category_code: 'CAT-L3-RTD-YOG',
        product_line: '乳饮品',
        milk_source: '发酵乳',
        process_type: '常温发酵乳饮料',
        origin_region: '全国奶源',
        storage_type: '常温',
        shelf_life_days: 120,
        match: { codeStartsWith: ['SKU-YOG-RTD-'] }
    },
    {
        spu_code: 'SPU-YOG-GREEK',
        spu_name: '希腊酸奶',
        category_code: 'CAT-L3-CHILLED-YOG',
        product_line: '酸奶',
        milk_source: '发酵乳',
        process_type: '希腊式发酵',
        origin_region: '全国奶源',
        storage_type: '冷藏',
        shelf_life_days: 28,
        match: { categoryCode: 'CAT-L3-CHILLED-YOG', nameIncludes: ['希腊酸奶'] }
    },
    {
        spu_code: 'SPU-PROBIOTIC-DRINK',
        spu_name: '益生菌饮品',
        category_code: 'CAT-L3-RTD-YOG',
        product_line: '乳饮品',
        milk_source: '益生菌发酵乳',
        process_type: '益生菌发酵',
        origin_region: '全国奶源',
        storage_type: '常温',
        shelf_life_days: 60,
        match: { codeStartsWith: ['SKU-DRK-RTD-'] }
    },
    {
        spu_code: 'SPU-POWDER-ADULT-CAL',
        spu_name: '成人高钙奶粉',
        category_code: 'CAT-L3-ADULT-POWDER',
        product_line: '奶粉',
        milk_source: '奶粉基粉',
        process_type: '喷雾干燥',
        origin_region: '成人营养线',
        storage_type: '常温干燥',
        shelf_life_days: 540,
        match: { categoryCode: 'CAT-L3-ADULT-POWDER', nameIncludes: ['成人高钙奶粉'] }
    },
    {
        spu_code: 'SPU-POWDER-ADULT-PRO',
        spu_name: '成人高蛋白奶粉',
        category_code: 'CAT-L3-ADULT-POWDER',
        product_line: '奶粉',
        milk_source: '奶粉基粉',
        process_type: '喷雾干燥',
        origin_region: '成人营养线',
        storage_type: '常温干燥',
        shelf_life_days: 540,
        match: { categoryCode: 'CAT-L3-ADULT-POWDER', nameIncludes: ['成人高蛋白奶粉'] }
    },
    {
        spu_code: 'SPU-POWDER-CHILD',
        spu_name: '儿童成长奶粉',
        category_code: 'CAT-L3-CHILD-POWDER',
        product_line: '奶粉',
        milk_source: '奶粉基粉',
        process_type: '喷雾干燥',
        origin_region: '儿童营养线',
        storage_type: '常温干燥',
        shelf_life_days: 540,
        match: { categoryCode: 'CAT-L3-CHILD-POWDER', nameIncludes: ['儿童成长奶粉'] }
    },
    {
        spu_code: 'SPU-POWDER-MIDDLE',
        spu_name: '中老年益生菌奶粉',
        category_code: 'CAT-L3-ADULT-POWDER',
        product_line: '奶粉',
        milk_source: '奶粉基粉',
        process_type: '喷雾干燥',
        origin_region: '成人营养线',
        storage_type: '常温干燥',
        shelf_life_days: 540,
        match: { categoryCode: 'CAT-L3-ADULT-POWDER', nameIncludes: ['中老年'] }
    },
    {
        spu_code: 'SPU-CHEESE-MOZ',
        spu_name: '马苏里拉芝士',
        category_code: 'CAT-L3-MOZZARELLA',
        product_line: '奶酪',
        milk_source: '牛奶',
        process_type: '凝乳发酵',
        origin_region: '奶酪工艺线',
        storage_type: '冷藏',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-MOZZARELLA', nameIncludes: ['马苏里拉'] }
    },
    {
        spu_code: 'SPU-CHEESE-CREAM',
        spu_name: '奶油芝士',
        category_code: 'CAT-L3-CREAM-CHEESE',
        product_line: '奶酪',
        milk_source: '牛奶',
        process_type: '乳脂发酵',
        origin_region: '奶酪工艺线',
        storage_type: '冷藏',
        shelf_life_days: 120,
        match: { categoryCode: 'CAT-L3-CREAM-CHEESE', nameIncludes: ['奶油芝士'] }
    },
    {
        spu_code: 'SPU-CHEESE-SLICE',
        spu_name: '奶酪片',
        category_code: 'CAT-L3-CREAM-CHEESE',
        product_line: '奶酪',
        milk_source: '牛奶',
        process_type: '再制奶酪',
        origin_region: '奶酪工艺线',
        storage_type: '冷藏',
        shelf_life_days: 120,
        match: { categoryCode: 'CAT-L3-CREAM-CHEESE', nameIncludes: ['奶酪片'] }
    },
    {
        spu_code: 'SPU-RGD-GHEE-YAK',
        spu_name: '藏区牦牛酥油',
        category_code: 'CAT-L3-GHEE',
        product_line: '特殊地域乳制品',
        milk_source: '牦牛奶',
        process_type: '澄清黄油',
        origin_region: '藏区',
        storage_type: '常温',
        shelf_life_days: 365,
        match: { categoryCode: 'CAT-L3-GHEE', nameIncludes: ['牦牛酥油'] }
    },
    {
        spu_code: 'SPU-RGD-GHEE-SAS',
        spu_name: '南亚牛乳澄清黄油',
        category_code: 'CAT-L3-GHEE',
        product_line: '特殊地域乳制品',
        milk_source: '牛奶',
        process_type: '澄清黄油',
        origin_region: '南亚',
        storage_type: '常温',
        shelf_life_days: 365,
        match: { categoryCode: 'CAT-L3-GHEE', nameIncludes: ['澄清黄油'] }
    },
    {
        spu_code: 'SPU-RGD-KEFIR',
        spu_name: '高加索克菲尔发酵乳',
        category_code: 'CAT-L3-KEFIR',
        product_line: '特殊地域乳制品',
        milk_source: '发酵乳',
        process_type: '克菲尔菌群发酵',
        origin_region: '高加索',
        storage_type: '冷藏',
        shelf_life_days: 28,
        match: { categoryCode: 'CAT-L3-KEFIR', nameIncludes: ['克菲尔'] }
    },
    {
        spu_code: 'SPU-RGD-SOUR-CREAM',
        spu_name: '欧美酸奶油',
        category_code: 'CAT-L3-SOUR-CREAM',
        product_line: '特殊地域乳制品',
        milk_source: '稀奶油',
        process_type: '乳酸菌发酵',
        origin_region: '欧美',
        storage_type: '冷藏',
        shelf_life_days: 45,
        match: { categoryCode: 'CAT-L3-SOUR-CREAM', nameIncludes: ['酸奶油'] }
    },
    {
        spu_code: 'SPU-RGD-CAMEL-MILK',
        spu_name: '骆驼奶制品',
        category_code: 'CAT-L3-CAMEL-MILK',
        product_line: '特殊地域乳制品',
        milk_source: '骆驼奶',
        process_type: '灭菌/调制',
        origin_region: '特定牧区',
        storage_type: '常温',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-CAMEL-MILK', nameIncludes: ['骆驼奶'] }
    },
    {
        spu_code: 'SPU-RGD-MARE-MILK',
        spu_name: '传统发酵马奶',
        category_code: 'CAT-L3-MARE-MILK',
        product_line: '特殊地域乳制品',
        milk_source: '马奶',
        process_type: '传统发酵',
        origin_region: '草原牧区',
        storage_type: '冷藏',
        shelf_life_days: 30,
        match: { categoryCode: 'CAT-L3-MARE-MILK', nameIncludes: ['马奶'] }
    },
    {
        spu_code: 'SPU-RGD-DONKEY-MILK',
        spu_name: '驴奶制品',
        category_code: 'CAT-L3-DONKEY-MILK',
        product_line: '特殊地域乳制品',
        milk_source: '驴奶',
        process_type: '灭菌/调制',
        origin_region: '特定牧区',
        storage_type: '常温',
        shelf_life_days: 180,
        match: { categoryCode: 'CAT-L3-DONKEY-MILK', nameIncludes: ['驴奶'] }
    }
];

const DEFAULT_SPU_BY_CODE = new Map(DEFAULT_SPU_DEFINITIONS.map((item) => [item.spu_code, item]));

const clone = (value) => JSON.parse(JSON.stringify(value));

const includesEvery = (text, parts = []) => parts.every((part) => text.includes(part));
const includesSome = (text, parts = []) => !parts.length || parts.some((part) => text.includes(part));

const matchesRule = (sku, rule = {}) => {
    const skuCode = normalizeCode(sku.sku_code);
    const skuName = normalizeText(sku.sku_name);
    const categoryCode = normalizeCode(sku.category_code);

    if (rule.categoryCode && categoryCode !== normalizeCode(rule.categoryCode)) return false;
    if (rule.codeStartsWith?.length && !rule.codeStartsWith.some((prefix) => skuCode.startsWith(normalizeCode(prefix)))) return false;
    if (rule.codeIncludes?.length && !includesEvery(skuCode, rule.codeIncludes.map(normalizeCode))) return false;
    if (rule.nameIncludes?.length && !includesEvery(skuName, rule.nameIncludes)) return false;
    if (rule.nameAny?.length && !includesSome(skuName, rule.nameAny)) return false;
    if (rule.nameExcludes?.length && rule.nameExcludes.some((part) => skuName.includes(part))) return false;

    return true;
};

const getCategoryName = (categoryRows = [], categoryCode = '') => {
    const code = normalizeCode(categoryCode);
    return normalizeText(categoryRows.find((row) => normalizeCode(row.category_code) === code)?.category_name);
};

const normalizeSpuRow = (row = {}, context = {}) => {
    const code = normalizeCode(row.spu_code);
    const categoryCode = normalizeText(row.category_code);
    const categoryName = normalizeText(row.category_name) || getCategoryName(context.categoryRows, categoryCode);
    const lifecycleStatus = normalizeCode(row.lifecycle_status || 'ACTIVE') || 'ACTIVE';
    const now = context.timeIso || new Date().toISOString();

    return {
        ...(row.id === undefined ? {} : { id: row.id }),
        spu_code: code,
        spu_name: normalizeText(row.spu_name),
        category_code: categoryCode,
        category_name: categoryName,
        product_line: normalizeText(row.product_line),
        milk_source: normalizeText(row.milk_source),
        process_type: normalizeText(row.process_type),
        origin_region: normalizeText(row.origin_region),
        storage_type: normalizeText(row.storage_type),
        shelf_life_days: toNum(row.shelf_life_days, 0),
        brand_name: normalizeText(row.brand_name || DEFAULT_BRAND_NAME),
        lifecycle_status: lifecycleStatus,
        sku_count: toNum(row.sku_count, 0),
        active_sku_count: toNum(row.active_sku_count, 0),
        representative_sku_code: normalizeText(row.representative_sku_code),
        representative_sku_name: normalizeText(row.representative_sku_name),
        status: row.status === undefined ? 1 : toNum(row.status, 1),
        remark: normalizeText(row.remark),
        created_time: row.created_time || now,
        updated_time: row.updated_time || now
    };
};

const matchesSpu = (spuRow, skuRow) => {
    const spuCode = normalizeCode(spuRow.spu_code);
    const explicitSkuSpuCode = normalizeCode(skuRow.spu_code);
    if (explicitSkuSpuCode) return explicitSkuSpuCode === spuCode;

    const definition = DEFAULT_SPU_BY_CODE.get(spuCode);
    if (!definition) return false;
    return matchesRule(skuRow, definition.match);
};

const withSpuMetrics = (spuRows = [], skuRows = []) => {
    const activeSkuRows = skuRows.filter((row) => Number(row.status ?? 1) !== 0);
    return spuRows.map((row) => {
        const matchedSkus = activeSkuRows.filter((sku) => matchesSpu(row, sku));
        const lifecycleActiveSkus = matchedSkus.filter((sku) => normalizeCode(sku.lifecycle_status || 'ACTIVE') === 'ACTIVE');
        const representative = lifecycleActiveSkus[0] || matchedSkus[0] || null;

        return {
            ...row,
            sku_count: matchedSkus.length,
            active_sku_count: lifecycleActiveSkus.length,
            representative_sku_code: representative?.sku_code || row.representative_sku_code || '',
            representative_sku_name: representative?.sku_name || row.representative_sku_name || ''
        };
    });
};

const buildDefaultSpuRows = (context = {}) => {
    const timeIso = context.timeIso || new Date().toISOString();
    const rows = DEFAULT_SPU_DEFINITIONS.map((definition, index) => normalizeSpuRow({
        id: index + 1,
        ...definition,
        lifecycle_status: 'ACTIVE',
        created_time: timeIso,
        updated_time: timeIso
    }, context));

    return withSpuMetrics(rows, context.skuRows || []);
};

const isBrokenText = (value) => {
    const text = normalizeText(value);
    return !text || text.includes('??') || text.includes('�');
};

const isBrokenSpuRow = (row = {}) => (
    isBrokenText(row.spu_name)
    || isBrokenText(row.product_line)
    || isBrokenText(row.milk_source)
    || isBrokenText(row.process_type)
);

const repairOrBuildSpuRows = (rows = [], context = {}) => {
    const currentRows = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
    const defaults = buildDefaultSpuRows(context);
    const byCode = new Map(currentRows.map((row) => [normalizeCode(row.spu_code), row]));
    const timeIso = context.timeIso || new Date().toISOString();
    let changed = false;

    defaults.forEach((defaultRow) => {
        const existing = byCode.get(defaultRow.spu_code);
        if (!existing) {
            currentRows.push(clone(defaultRow));
            byCode.set(defaultRow.spu_code, currentRows[currentRows.length - 1]);
            changed = true;
            return;
        }

        const shouldRepair = isBrokenSpuRow(existing);
        const next = {
            ...existing,
            ...(shouldRepair ? defaultRow : {}),
            id: existing.id ?? defaultRow.id,
            status: existing.status === undefined ? defaultRow.status : existing.status,
            remark: existing.remark ?? defaultRow.remark,
            sku_count: defaultRow.sku_count,
            active_sku_count: defaultRow.active_sku_count,
            representative_sku_code: defaultRow.representative_sku_code,
            representative_sku_name: defaultRow.representative_sku_name,
            created_time: existing.created_time || defaultRow.created_time,
            updated_time: shouldRepair ? timeIso : (existing.updated_time || defaultRow.updated_time)
        };

        if (JSON.stringify(existing) !== JSON.stringify(next)) {
            Object.assign(existing, next);
            changed = true;
        }
    });

    return {
        rows: currentRows.sort((a, b) => toNum(a.id) - toNum(b.id)),
        changed
    };
};

module.exports = {
    DEFAULT_SPU_DEFINITIONS,
    buildDefaultSpuRows,
    normalizeSpuRow,
    repairOrBuildSpuRows,
    withSpuMetrics
};
