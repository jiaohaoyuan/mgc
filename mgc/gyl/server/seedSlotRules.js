/**
 * 档期规则 — 种子数据脚本
 * 运行：node server/seedSlotRules.js
 */

const { updateDb, nextId, nowIso } = require('./localDb');
const arr = (v) => (Array.isArray(v) ? v : []);

const seed = () => {
    updateDb((db) => {
        db.biz = db.biz || {};
        db.biz.slot_definitions = arr(db.biz.slot_definitions);
        db.biz.slot_allocation_rules = arr(db.biz.slot_allocation_rules);
        const op = '系统种子'; const t = nowIso();

        const slotDefaults = [
            { slot_code: '618_2026', slot_name: '618年中大促', slot_type: 'PROMO', start_date: '2026-06-01', end_date: '2026-06-18', priority: 100, status: 1, remark: '618大促档期' },
            { slot_code: 'SUMMER_2026', slot_name: '夏季促销', slot_type: 'SEASONAL', start_date: '2026-07-01', end_date: '2026-08-31', priority: 50, status: 1, remark: '暑期乳品消费旺季' },
            { slot_code: 'NATIONAL_DAY_2026', slot_name: '国庆档期', slot_type: 'FESTIVAL', start_date: '2026-09-28', end_date: '2026-10-07', priority: 80, status: 1, remark: '国庆黄金周' }
        ];

        slotDefaults.forEach(def => {
            if (!db.biz.slot_definitions.some(s => String(s.slot_code) === def.slot_code)) {
                db.biz.slot_definitions.push({ id: nextId(db.biz.slot_definitions), ...def, created_by: op, created_time: t, updated_by: op, updated_time: t });
            }
        });

        // Sample allocation rule for 618 slot: shift more weight to larger warehouses
        const ruleDefaults = [
            {
                slot_code: '618_2026', rule_name: '618华东常温分配',
                channel_codes: [], sku_codes: [],
                warehouse_weights: [
                    { warehouse_code: '', warehouse_name: '杭州仓', weight: 40 },
                    { warehouse_code: '', warehouse_name: '上海仓', weight: 35 },
                    { warehouse_code: '', warehouse_name: '合肥仓', weight: 25 }
                ],
                status: 1, remark: '618期间增加合肥仓供应比例'
            }
        ];

        ruleDefaults.forEach(def => {
            if (!db.biz.slot_allocation_rules.some(r => String(r.rule_name) === def.rule_name && String(r.slot_code) === def.slot_code)) {
                db.biz.slot_allocation_rules.push({ id: nextId(db.biz.slot_allocation_rules), ...def, created_by: op, created_time: t, updated_by: op, updated_time: t });
            }
        });

        console.log(`档期: ${slotDefaults.length} 个, 分配规则: ${ruleDefaults.length} 条`);
    });
    console.log('\nSeed 档期规则完成\n');
};

seed();
