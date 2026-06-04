/**
 * 种子数据脚本 — 安全库存参数、仓能力规则、可调天数规则
 *
 * 使用项目内正确的 master 数据（仓库、SKU、品类）生成种子数据。
 * 不使用外部 Excel 数据。
 *
 * 使用方式：node server/seedSafetyStockAndRules.js
 */

const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };

function seed() {
    const operator = '系统初始化';
    console.log('开始基于项目 master 数据初始化种子数据...');

    updateDb((db) => {
        // ===== 确保结构 =====
        db.biz = db.biz || {};
        db.master = db.master || {};

        // 获取 master 数据
        const warehouses = arr(db.master.warehouse);
        const skus = arr(db.master.sku);
        const categories = arr(db.master.category);
        const rltnWhSku = arr(db.master.rltn_warehouse_sku);

        console.log(`  仓库: ${warehouses.length} 个`);
        console.log(`  SKU: ${skus.length} 个`);
        console.log(`  品类: ${categories.length} 个`);
        console.log(`  仓库-SKU关系: ${rltnWhSku.length} 条`);

        // 构建 lookup map
        const skuMap = {};
        skus.forEach(s => { skuMap[String(s.sku_code)] = s; });
        const catMap = {};
        categories.forEach(c => { catMap[String(c.category_code)] = c; });

        // ABC分类 mock: 按SKU编码后缀分配
        function getAbcType(skuCode) {
            const last = String(skuCode).slice(-3);
            const num = parseInt(last, 10);
            if (!isNaN(num) && num <= 10) return 'A类';
            if (!isNaN(num) && num <= 20) return 'B类';
            // fallback: hash
            let hash = 0;
            for (let i = 0; i < skuCode.length; i++) hash = (hash * 31 + skuCode.charCodeAt(i)) & 0xffff;
            const types = ['A类', 'B类', 'C类'];
            return types[hash % 3];
        }

        // ===== 1. 安全库存参数 (基于仓库-SKU关系) =====
        console.log('\n--- 安全库存参数 ---');
        db.biz.safety_stock_params = [];
        const seenPairs = new Set();

        for (const rel of rltnWhSku) {
            const skuCode = String(rel.sku_code || '').trim();
            const whCode = String(rel.warehouse_code || '').trim();
            if (!skuCode || !whCode) continue;

            const key = `${skuCode}::${whCode}`;
            if (seenPairs.has(key)) continue;
            seenPairs.add(key);

            const sku = skuMap[skuCode] || {};
            const catCode = sku.category_code || '';
            const cat = catMap[catCode] || {};
            const wh = warehouses.find(w => String(w.warehouse_code) === whCode) || {};

            // 根据品类设定不同的安全库存天数基准
            let baseMin = 7, baseMax = 21;
            const catName = String(cat.category_name || '');

            if (catName.includes('低温') || catName.includes('冷藏') || catName.includes('鲜')) {
                baseMin = 3; baseMax = 7;  // 短保产品
            } else if (catName.includes('奶粉') || catName.includes('固态')) {
                baseMin = 14; baseMax = 45; // 长保产品
            } else if (catName.includes('酸奶') || catName.includes('发酵')) {
                baseMin = 5; baseMax = 14;  // 中保产品
            }

            db.biz.safety_stock_params.push({
                id: nextId(db.biz.safety_stock_params),
                sku_code: skuCode,
                sku_name: String(sku.sku_name || '').trim(),
                category: String(catName || catCode).trim(),
                abc_type: getAbcType(skuCode),
                warehouse: String(wh.warehouse_name || whCode).trim(),
                warehouse_code: whCode,
                min_safety_days: baseMin,
                max_safety_days: baseMax,
                status: 1,
                remark: '',
                created_by: operator,
                created_time: nowIso(),
                updated_by: operator,
                updated_time: nowIso()
            });
        }
        console.log(`  生成 ${db.biz.safety_stock_params.length} 条安全库存参数`);

        // ===== 2. 仓能力规则 (每个仓库 × 3种能力类型) =====
        console.log('\n--- 仓能力规则 ---');
        db.biz.warehouse_capacity_rules = [];

        const capacityTypes = [
            { type: 'STORAGE', label: '库容', baseValue: 100000 },
            { type: 'INBOUND', label: '收货', baseValue: 10000 },
            { type: 'OUTBOUND', label: '出库', baseValue: 15000 }
        ];

        // 按仓库类型调整能力值
        function getCapacityValue(whCode, baseType) {
            let multiplier = 1.0;
            if (whCode.includes('RDC')) multiplier = 3.0;      // RDC大仓
            else if (whCode.includes('DC')) multiplier = 0.5;  // 城市DC
            else if (whCode.includes('PASTURE')) multiplier = 0.3; // 牧场前置仓
            else if (whCode.includes('HQ')) multiplier = 0.2;  // 总部

            const map = { STORAGE: 100000, INBOUND: 10000, OUTBOUND: 15000 };
            return Math.round((map[baseType] || 5000) * multiplier);
        }

        for (const wh of warehouses) {
            const whCode = String(wh.warehouse_code || '').trim();
            const whName = String(wh.warehouse_name || '').trim();
            if (!whCode) continue;

            for (const ct of capacityTypes) {
                db.biz.warehouse_capacity_rules.push({
                    id: nextId(db.biz.warehouse_capacity_rules),
                    rule_name: `${whName}-${ct.label}能力`,
                    warehouse: whName,
                    warehouse_code: whCode,
                    capacity_type: ct.type,
                    capacity_value: getCapacityValue(whCode, ct.type),
                    capacity_unit: '提',
                    scope_type: 'CATEGORY',
                    scope_code: 'ALL',
                    scope_name: '全部品类',
                    effective_start: '2025-01-01',
                    effective_end: '2026-12-31',
                    status: 1,
                    remark: whCode.includes('RDC') ? '区域配送中心' : whCode.includes('DC') ? '城市配送中心' : '',
                    created_by: operator,
                    created_time: nowIso(),
                    updated_by: operator,
                    updated_time: nowIso()
                });
            }
        }
        console.log(`  生成 ${db.biz.warehouse_capacity_rules.length} 条仓能力规则`);

        // ===== 3. 可调天数规则 (选取前20个SKU×仓库组合) =====
        console.log('\n--- 可调天数规则 ---');
        db.biz.adjustable_days_rules = [];

        const safetyParams = db.biz.safety_stock_params;
        const sampleParams = safetyParams.slice(0, 30); // 取前30条

        const directions = ['UP', 'DOWN', 'BOTH'];
        for (let i = 0; i < sampleParams.length; i++) {
            const sp = sampleParams[i];
            const direction = directions[i % 3];

            const adjustDays = direction === 'UP' ? 3 : direction === 'DOWN' ? 2 : 5;
            const effMin = Math.max(0, sp.min_safety_days - adjustDays);
            const effMax = sp.max_safety_days + adjustDays;

            db.biz.adjustable_days_rules.push({
                id: nextId(db.biz.adjustable_days_rules),
                rule_name: direction === 'UP' ? '促销弹性上调' : direction === 'DOWN' ? '库存宽松下调' : '大促双向弹性',
                sku_code: sp.sku_code,
                sku_name: sp.sku_name,
                category: sp.category,
                warehouse: sp.warehouse,
                warehouse_code: sp.warehouse_code || '',
                adjust_direction: direction,
                adjust_days: adjustDays,
                safety_min_days: sp.min_safety_days,
                safety_max_days: sp.max_safety_days,
                safety_param_id: sp.id,
                effective_min_days: effMin,
                effective_max_days: effMax,
                status: 1,
                remark: '',
                effective_start: '',
                effective_end: '',
                created_by: operator,
                created_time: nowIso(),
                updated_by: operator,
                updated_time: nowIso()
            });
        }
        console.log(`  生成 ${db.biz.adjustable_days_rules.length} 条可调天数规则`);
    });

    console.log('\n✅ 种子数据初始化完成！');
}

seed();
