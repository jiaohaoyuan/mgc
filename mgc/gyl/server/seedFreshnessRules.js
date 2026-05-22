/**
 * 规则引擎 — 种子数据脚本
 * 运行方式：node server/seedFreshnessRules.js
 */

const { updateDb, nextId, nowIso } = require('./localDb');

const arr = (v) => (Array.isArray(v) ? v : []);

const seed = () => {
    updateDb((db) => {
        db.biz = db.biz || {};
        db.biz.freshness_rules = arr(db.biz.freshness_rules);
        db.biz.datetime_rules = arr(db.biz.datetime_rules);

        const operator = '系统种子';
        const t = nowIso();

        // ── Freshness Rules ──
        const freshDefaults = [
            {
                rule_code: 'SHELF_CRITICAL',
                rule_name: '临期限制（≤7天）',
                temperature_zone: 0,
                min_remaining_days: 0,
                max_remaining_days: 7,
                allowed_scope: 0,    // 仅本省
                force_fefo: true,
                min_delivery_ratio: 0,
                priority: 1,
                status: 1,
                remark: '保质期剩余≤7天仅允许本省内调拨，强制FEFO出库'
            },
            {
                rule_code: 'SHELF_SHORT',
                rule_name: '短保限制（8-15天）',
                temperature_zone: 0,
                min_remaining_days: 7,
                max_remaining_days: 15,
                allowed_scope: 1,    // 本省+邻省
                force_fefo: true,
                min_delivery_ratio: 0,
                priority: 2,
                status: 1,
                remark: '保质期剩余8-15天允许本省及邻省调拨'
            },
            {
                rule_code: 'SHELF_NORMAL',
                rule_name: '常规（16天以上）',
                temperature_zone: 0,
                min_remaining_days: 15,
                max_remaining_days: 9999,
                allowed_scope: 2,    // 全国
                force_fefo: false,
                min_delivery_ratio: 0,
                priority: 3,
                status: 1,
                remark: '保质期16天以上全国可调拨'
            },
            {
                rule_code: 'COLD_CHAIN_STRICT',
                rule_name: '冷链严格限制（≤3天）',
                temperature_zone: 2,  // 冷藏
                min_remaining_days: 0,
                max_remaining_days: 3,
                allowed_scope: 0,     // 仅本省
                force_fefo: true,
                min_delivery_ratio: 0.5,  // 到货时剩余不低于50%
                priority: 1,
                status: 1,
                remark: '低温产品保质期≤3天仅省内调拨，到货剩余效期≥50%'
            },
            {
                rule_code: 'COLD_CHAIN_MEDIUM',
                rule_name: '冷链中等（4-7天）',
                temperature_zone: 2,
                min_remaining_days: 3,
                max_remaining_days: 7,
                allowed_scope: 1,
                force_fefo: true,
                min_delivery_ratio: 0.3,
                priority: 2,
                status: 1,
                remark: '低温产品保质期4-7天允许省内+邻省调拨'
            },
            {
                rule_code: 'COLD_CHAIN_NORMAL',
                rule_name: '冷链常规（8天以上）',
                temperature_zone: 2,
                min_remaining_days: 7,
                max_remaining_days: 9999,
                allowed_scope: 2,
                force_fefo: true,
                min_delivery_ratio: 0.3,
                priority: 3,
                status: 1,
                remark: '低温产品8天以上可全国调拨'
            }
        ];

        freshDefaults.forEach((def) => {
            if (!db.biz.freshness_rules.some(r => String(r.rule_code) === def.rule_code)) {
                db.biz.freshness_rules.push({
                    id: nextId(db.biz.freshness_rules),
                    ...def,
                    created_by: operator,
                    created_time: t,
                    updated_by: operator,
                    updated_time: t
                });
            }
        });

        // ── Datetime Rules ──
        const datetimeDefaults = [
            {
                rule_code: 'CUTOFF_1600',
                rule_name: '每日16点截单',
                rule_type: 'CUTOFF_TIME',
                apply_scope: 'ALL',
                apply_value: '',
                config_value: { time: '16:00', desc: '每日16:00前提交的调拨需求当日处理，之后顺延至次日' },
                status: 1,
                remark: '全局截单时间规则'
            },
            {
                rule_code: 'LEAD_INTRA_1D',
                rule_name: '省内提前期1天',
                rule_type: 'LEAD_TIME',
                apply_scope: 'INTRA_PROVINCE',
                apply_value: '',
                config_value: { days: 1, desc: '省内调拨需提前1天提交' },
                status: 1,
                remark: ''
            },
            {
                rule_code: 'LEAD_INTER_3D',
                rule_name: '跨省提前期3天',
                rule_type: 'LEAD_TIME',
                apply_scope: 'INTER_PROVINCE',
                apply_value: '',
                config_value: { days: 3, desc: '跨省调拨需提前3天提交（含运输时间）' },
                status: 1,
                remark: ''
            },
            {
                rule_code: 'NON_WORKDAY_SKIP',
                rule_name: '非工作日顺延',
                rule_type: 'NON_WORKDAY',
                apply_scope: 'ALL',
                apply_value: '',
                config_value: { skip: true, push_to_next: true, desc: '法定节假日及周末不发货，顺延至下一工作日' },
                status: 1,
                remark: '与业务日历联动'
            },
            {
                rule_code: 'COLD_DELIVERY_24H',
                rule_name: '冷链24小时配送窗口',
                rule_type: 'DELIVERY_WINDOW',
                apply_scope: 'COLD',
                apply_value: '',
                config_value: { max_hours: 24, max_km: 500, desc: '冷链运输必须在24小时内送达，运输半径不超过500公里' },
                status: 1,
                remark: '低温产品专属'
            }
        ];

        datetimeDefaults.forEach((def) => {
            if (!db.biz.datetime_rules.some(r => String(r.rule_code) === def.rule_code)) {
                db.biz.datetime_rules.push({
                    id: nextId(db.biz.datetime_rules),
                    ...def,
                    created_by: operator,
                    created_time: t,
                    updated_by: operator,
                    updated_time: t
                });
            }
        });

        console.log(`新鲜度规则: ${freshDefaults.length} 条`);
        console.log(`日期时间规则: ${datetimeDefaults.length} 条`);
    });

    console.log('\n✓ 规则引擎种子数据创建完成');
    console.log('  新鲜度规则: 6 条 (临期/短保/常规 × 常温+冷链)');
    console.log('  日期时间规则: 5 条 (截单/提前期×2/非工作日/冷链窗口)\n');
};

seed();
