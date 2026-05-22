/**
 * 规则引擎模块 — 新鲜度规则 + 日期时间规则管理
 *
 * 新鲜度规则 (freshness_rules)：按温层+效期区间定义调拨约束
 * 日期时间规则 (datetime_rules)：截单时间、提前期、非工作日处理等
 */

const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
const normalize = (v) => String(v || '').trim();

const FRESHNESS_SCOPE = { 0: '本省', 1: '邻省', 2: '全国' };
const TEMPERATURE_ZONE = { 0: '全部温层', 1: '常温', 2: '冷藏', 3: '冷冻' };
const RULE_TYPE_LABELS = {
    CUTOFF_TIME: '截单时间',
    LEAD_TIME: '提前期',
    NON_WORKDAY: '非工作日处理',
    DELIVERY_WINDOW: '配送窗口'
};

const createBizError = (msg, code = 400) => { const e = new Error(msg); e.statusCode = code; return e; };

const ensureRuleStructures = (db) => {
    db.biz = db.biz || {};
    db.biz.freshness_rules = arr(db.biz.freshness_rules);
    db.biz.datetime_rules = arr(db.biz.datetime_rules);
};

// ===== Freshness Rule Engine =====

/**
 * Query applicable freshness rules for a given SKU context.
 * Returns rules sorted by priority (lowest first = most specific).
 */
const queryFreshnessRules = (db, { skuCode, temperatureZone = 0 } = {}) => {
    ensureRuleStructures(db);
    const allRules = arr(db.biz.freshness_rules).filter(r => Number(r.status) === 1);

    // Filter: match temperature zone
    // Query zone=0 means "don't filter" → return all rules
    // Query zone=1/2/3 → return rules for that zone OR rules for all zones (0)
    const matched = Number(temperatureZone) === 0
        ? allRules
        : allRules.filter(r => {
            const rZone = Number(r.temperature_zone) || 0;
            return rZone === 0 || rZone === Number(temperatureZone);
        });

    return matched.sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99));
};

/**
 * Find the freshness rule that applies to a given remaining shelf life.
 * Rules define ranges [min_remaining_days, max_remaining_days).
 */
const findApplicableRule = (rules, remainingDays) => {
    for (const rule of rules) {
        const min = Number(rule.min_remaining_days) || 0;
        const max = Number(rule.max_remaining_days) || 9999;
        if (remainingDays >= min && remainingDays < max) {
            return rule;
        }
    }
    return null; // no rule matches — no restriction
};

/**
 * Evaluate whether a warehouse can supply a batch given freshness constraints.
 */
const evaluateBatchSupply = (db, { warehouseCode, channelCode, skuCode, batchRemainingDays, temperatureZone }) => {
    const rules = queryFreshnessRules(db, { skuCode, temperatureZone });
    const rule = findApplicableRule(rules, batchRemainingDays);

    if (!rule) return { allowed: true, rule: null, reason: '' };

    const maxScope = rule.allowed_scope !== undefined && rule.allowed_scope !== null ? Number(rule.allowed_scope) : 2;

    // Determine warehouse-to-channel distance scope
    const scope = getWarehouseChannelScope(db, warehouseCode, channelCode);

    if (scope > maxScope) {
        return {
            allowed: false,
            rule: { code: rule.rule_code, name: rule.rule_name },
            reason: `保质期剩余 ${batchRemainingDays} 天（规则: ${rule.rule_name}），仅允许${FRESHNESS_SCOPE[maxScope] || '全国'}调拨，当前仓库距离为${['本省','邻省','全国'][scope] || '未知'}`
        };
    }

    return { allowed: true, rule: { code: rule.rule_code, name: rule.rule_name }, reason: '' };
};

const buildFreshnessAllocationPreview = (db, { skuCode, temperatureZone = 0, totalQty = 100 } = {}) => {
    const rules = queryFreshnessRules(db, { skuCode, temperatureZone });
    if (!rules.length) return { totalQty: Math.max(0, toNum(totalQty, 0)), rows: [] };

    const sourceRules = rules
        .map((rule) => {
            const ratio = Number(rule.allocation_ratio ?? rule.min_delivery_ratio ?? 0);
            return {
                rule_code: rule.rule_code,
                rule_name: rule.rule_name,
                min_remaining_days: Number(rule.min_remaining_days) || 0,
                max_remaining_days: Number(rule.max_remaining_days) || 9999,
                allowed_scope: Number(rule.allowed_scope) || 0,
                force_fefo: Boolean(rule.force_fefo),
                priority: Number(rule.priority) || 99,
                allocation_ratio: ratio > 0 ? ratio : 0
            };
        })
        .filter((rule) => rule.allocation_ratio > 0);

    const ordered = sourceRules.sort((a, b) => a.priority - b.priority);
    const ratioSum = ordered.reduce((sum, rule) => sum + rule.allocation_ratio, 0);
    const normalized = ratioSum > 0
        ? ordered.map((rule) => rule.allocation_ratio / ratioSum)
        : ordered.map(() => 1 / ordered.length);

    const total = Math.max(0, toNum(totalQty, 0));
    let used = 0;
    const rows = ordered.map((rule, idx) => {
        const ratio = Number(normalized[idx] || 0);
        const qty = idx === ordered.length - 1
            ? Math.max(0, total - used)
            : Math.max(0, Math.floor(total * ratio));
        used += qty;
        return {
            ...rule,
            allocation_ratio: Number(ratio.toFixed(4)),
            allocation_qty: qty,
            allocation_percent: Number((ratio * 100).toFixed(1)),
            remaining_range: `${rule.min_remaining_days} ~ ${rule.max_remaining_days === 9999 ? '不限' : rule.max_remaining_days}`
        };
    });

    return { totalQty: total, rows };
};

/**
 * Sort ledger rows by FEFO (first-expiry-first-out) when force_fefo is set.
 */
const sortByFefo = (ledgerRows, forceFefo) => {
    if (!forceFefo) return ledgerRows;
    return [...ledgerRows].sort((a, b) => {
        const aExp = (a && a.expiry_date) || '9999-99-99';
        const bExp = (b && b.expiry_date) || '9999-99-99';
        return aExp.localeCompare(bExp);
    });
};

// ===== Datetime Rule Engine =====

const queryDatetimeRules = (db, ruleType = '') => {
    ensureRuleStructures(db);
    let rules = arr(db.biz.datetime_rules).filter(r => Number(r.status) === 1);
    if (ruleType) rules = rules.filter(r => String(r.rule_type) === String(ruleType));
    return rules;
};

/**
 * Get the cutoff time for a given scope.
 * Returns HH:MM string, e.g. "16:00"
 */
const getCutoffTime = (db, scope = 'ALL') => {
    const rules = queryDatetimeRules(db, 'CUTOFF_TIME');
    const matched = rules.find(r => String(r.apply_scope) === String(scope))
        || rules.find(r => String(r.apply_scope) === 'ALL');
    if (matched) {
        const cfg = matched.config_value || {};
        return cfg.time || '16:00';
    }
    return '16:00';
};

/**
 * Get lead time in days for delivery scope.
 */
const getLeadTime = (db, scope = 'ALL') => {
    const rules = queryDatetimeRules(db, 'LEAD_TIME');
    const matched = rules.find(r => String(r.apply_scope) === String(scope))
        || rules.find(r => String(r.apply_scope) === 'ALL');
    if (matched) {
        const cfg = matched.config_value || {};
        return Number(cfg.days) || 0;
    }
    return 0;
};

/**
 * Check if a given date is a non-workday (holiday/weekend).
 * Currently uses simple weekend check; should integrate with db.master.calendar.
 */
const isNonWorkday = (db, dateStr) => {
    // First check business calendar
    const cal = arr(db.master.calendar).find(c => String(c.date) === String(dateStr));
    if (cal && Number(cal.is_workday) === 0) return true;
    if (cal && Number(cal.is_workday) === 1) return false;
    // Fallback: weekend check
    const d = new Date(dateStr);
    return d.getDay() === 0 || d.getDay() === 6;
};

/**
 * Compute next valid workday after an offset, skipping non-workdays.
 */
const nextWorkday = (db, fromDateStr, offsetDays = 0) => {
    if (!fromDateStr || isNaN(Date.parse(fromDateStr))) return fromDateStr || '';
    const d = new Date(fromDateStr);
    const maxIter = Math.max(365, offsetDays * 3); // safety limit
    for (let i = 0; i < maxIter; i++) {
        d.setDate(d.getDate() + 1);
        const dateStr = d.toISOString().slice(0, 10);
        if (!isNonWorkday(db, dateStr)) {
            if (offsetDays <= 0) return dateStr;
            offsetDays--;
        }
    }
    return d.toISOString().slice(0, 10); // fallback
};

// ===== Warehouse-Channel Distance Scope =====

const getWarehouseChannelScope = (db, warehouseCode, channelCode) => {
    const wh = arr(db.master.warehouse).find(w => String(w.warehouse_code) === String(warehouseCode));
    const ch = arr(db.master.channel).find(c => String(c.channel_code) === String(channelCode));
    if (!wh || !ch) return 2; // unknown → allow all (conservative)

    const whProv = normalize(wh.province_name || wh.province || '');
    const chProv = normalize(ch.province_name || ch.province || '');
    if (!whProv || !chProv) return 2;
    if (whProv === chProv) return 0; // same province

    // Neighbor check
    const NEIGHBOR_MAP = {
        '浙江': ['江苏','上海','安徽','福建','江西'],
        '江苏': ['浙江','上海','安徽','山东'],
        '上海': ['浙江','江苏'],
        '安徽': ['浙江','江苏','河南','湖北','江西'],
        '福建': ['浙江','江西','广东'],
        '江西': ['浙江','福建','广东','湖南','湖北','安徽'],
        '山东': ['江苏','河南','河北'],
        '河南': ['山东','安徽','湖北','陕西','山西','河北'],
        '湖北': ['河南','安徽','江西','湖南','重庆','陕西'],
        '湖南': ['湖北','江西','广东','广西','贵州','重庆'],
        '广东': ['福建','江西','湖南','广西'],
        '广西': ['广东','湖南','贵州','云南'],
        '四川': ['重庆','贵州','云南','陕西','甘肃','青海','西藏'],
        '重庆': ['四川','湖北','湖南','贵州'],
        '贵州': ['四川','重庆','湖南','广西','云南'],
        '云南': ['四川','贵州','广西'],
        '北京': ['天津','河北'], '天津': ['北京','河北'],
        '河北': ['北京','天津','山东','河南','山西','辽宁'],
        '辽宁': ['河北','吉林'], '吉林': ['辽宁','内蒙古'],
        '黑龙江': ['内蒙古','吉林'],
        '内蒙古': ['黑龙江','吉林','辽宁','河北','山西','陕西','宁夏','甘肃'],
        '山西': ['河北','河南','陕西','内蒙古'],
        '陕西': ['山西','河南','湖北','甘肃','四川','宁夏','内蒙古'],
        '甘肃': ['陕西','青海','新疆','宁夏','内蒙古','四川'],
        '宁夏': ['陕西','甘肃','内蒙古'],
        '青海': ['甘肃','新疆','四川','西藏'],
        '新疆': ['甘肃','青海','西藏'],
        '西藏': ['新疆','青海','四川','云南'],
        '海南': ['广东'],
        '香港': ['广东'], '澳门': ['广东'], '台湾': ['福建'],
    };
    const neighbors = NEIGHBOR_MAP[chProv] || [];
    return neighbors.includes(whProv) ? 1 : 2;
};

// ===== Route Registration =====

const registerFreshnessRuleRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {

    // ── Freshness Rules CRUD ──

    app.get('/api/rules/freshness', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureRuleStructures(db);
            const { page = 1, pageSize = 20, keyword = '' } = req.query || {};
            let rows = arr(db.biz.freshness_rules).filter(r => (r.status !== undefined ? Number(r.status) : 1) >= 0);
            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                rows = rows.filter(r =>
                    String(r.rule_code || '').toLowerCase().includes(kw) ||
                    String(r.rule_name || '').toLowerCase().includes(kw)
                );
            }
            rows.sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99));
            const { list, total } = paginate(rows, page, pageSize);
            apiOk(res, req, { list, total }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    app.get('/api/rules/freshness/:id', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureRuleStructures(db);
            const row = arr(db.biz.freshness_rules).find(r => Number(r.id) === Number(req.params.id));
            if (!row) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, row, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    app.post('/api/rules/freshness', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.rule_code || !body.rule_name) return apiErr(res, req, 400, '规则编码和名称不能为空');
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            updateDb((db) => {
                ensureRuleStructures(db);
                if (db.biz.freshness_rules.some(r => String(r.rule_code) === String(body.rule_code)))
                    throw createBizError('规则编码已存在', 409);
                db.biz.freshness_rules.push({
                    id: nextId(db.biz.freshness_rules),
                    rule_code: String(body.rule_code).trim(),
                    rule_name: String(body.rule_name).trim(),
                    temperature_zone: Number(body.temperature_zone) || 0,
                    min_remaining_days: Number(body.min_remaining_days) || 0,
                    max_remaining_days: Number(body.max_remaining_days) || 9999,
                    allowed_scope: body.allowed_scope !== undefined ? Number(body.allowed_scope) : 2,
                    force_fefo: Boolean(body.force_fefo),
                    min_delivery_ratio: Number(body.min_delivery_ratio) || 0,
                    allocation_ratio: body.allocation_ratio !== undefined ? Number(body.allocation_ratio) : (Number(body.min_delivery_ratio) || 0),
                    priority: Number(body.priority) || 99,
                    status: body.status !== undefined ? Number(body.status) : 1,
                    remark: String(body.remark || ''),
                    created_by: operator,
                    created_time: nowIso(),
                    updated_by: operator,
                    updated_time: nowIso()
                });
            });
            apiOk(res, req, null, '新增成功');
        } catch (e) {
            apiErr(res, req, e.statusCode || 400, e.message || '新增失败');
        }
    });

    app.put('/api/rules/freshness/:id', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let found = false;
            updateDb((db) => {
                ensureRuleStructures(db);
                const row = db.biz.freshness_rules.find(r => Number(r.id) === Number(req.params.id));
                if (!row) return;
                if (body.rule_name !== undefined) row.rule_name = String(body.rule_name).trim();
                if (body.temperature_zone !== undefined) row.temperature_zone = Number(body.temperature_zone);
                if (body.min_remaining_days !== undefined) row.min_remaining_days = Number(body.min_remaining_days);
                if (body.max_remaining_days !== undefined) row.max_remaining_days = Number(body.max_remaining_days);
                if (body.allowed_scope !== undefined) row.allowed_scope = Number(body.allowed_scope);
                if (body.force_fefo !== undefined) row.force_fefo = Boolean(body.force_fefo);
                if (body.min_delivery_ratio !== undefined) row.min_delivery_ratio = Number(body.min_delivery_ratio);
                if (body.allocation_ratio !== undefined) row.allocation_ratio = Number(body.allocation_ratio);
                if (body.priority !== undefined) row.priority = Number(body.priority);
                if (body.status !== undefined) row.status = Number(body.status);
                if (body.remark !== undefined) row.remark = String(body.remark);
                row.updated_by = operator;
                row.updated_time = nowIso();
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, null, '更新成功');
        } catch (e) {
            apiErr(res, req, e.statusCode || 400, e.message || '更新失败');
        }
    });

    app.delete('/api/rules/freshness/:id', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureRuleStructures(db);
                const idx = db.biz.freshness_rules.findIndex(r => Number(r.id) === Number(req.params.id));
                if (idx === -1) return;
                db.biz.freshness_rules.splice(idx, 1);
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '删除失败');
        }
    });

    // ── Datetime Rules CRUD ──

    app.get('/api/rules/datetime', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureRuleStructures(db);
            const { page = 1, pageSize = 20, ruleType = '' } = req.query || {};
            let rows = arr(db.biz.datetime_rules).filter(r => (r.status !== undefined ? Number(r.status) : 1) >= 0);
            if (String(ruleType).trim()) {
                rows = rows.filter(r => String(r.rule_type) === String(ruleType));
            }
            const { list, total } = paginate(rows, page, pageSize);
            apiOk(res, req, { list, total }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    app.get('/api/rules/datetime/:id', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureRuleStructures(db);
            const row = arr(db.biz.datetime_rules).find(r => Number(r.id) === Number(req.params.id));
            if (!row) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, row, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    app.post('/api/rules/datetime', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.rule_code || !body.rule_name) return apiErr(res, req, 400, '规则编码和名称不能为空');
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            updateDb((db) => {
                ensureRuleStructures(db);
                if (db.biz.datetime_rules.some(r => String(r.rule_code) === String(body.rule_code)))
                    throw createBizError('规则编码已存在', 409);
                db.biz.datetime_rules.push({
                    id: nextId(db.biz.datetime_rules),
                    rule_code: String(body.rule_code).trim(),
                    rule_name: String(body.rule_name).trim(),
                    rule_type: String(body.rule_type || '').trim(),
                    apply_scope: String(body.apply_scope || 'ALL').trim(),
                    apply_value: String(body.apply_value || '').trim(),
                    config_value: body.config_value || {},
                    status: body.status !== undefined ? Number(body.status) : 1,
                    remark: String(body.remark || ''),
                    created_by: operator,
                    created_time: nowIso(),
                    updated_by: operator,
                    updated_time: nowIso()
                });
            });
            apiOk(res, req, null, '新增成功');
        } catch (e) {
            apiErr(res, req, e.statusCode || 400, e.message || '新增失败');
        }
    });

    app.put('/api/rules/datetime/:id', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let found = false;
            updateDb((db) => {
                ensureRuleStructures(db);
                const row = db.biz.datetime_rules.find(r => Number(r.id) === Number(req.params.id));
                if (!row) return;
                if (body.rule_name !== undefined) row.rule_name = String(body.rule_name).trim();
                if (body.rule_type !== undefined) row.rule_type = String(body.rule_type).trim();
                if (body.apply_scope !== undefined) row.apply_scope = String(body.apply_scope).trim();
                if (body.apply_value !== undefined) row.apply_value = String(body.apply_value).trim();
                if (body.config_value !== undefined) row.config_value = body.config_value;
                if (body.status !== undefined) row.status = Number(body.status);
                if (body.remark !== undefined) row.remark = String(body.remark);
                row.updated_by = operator;
                row.updated_time = nowIso();
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, null, '更新成功');
        } catch (e) {
            apiErr(res, req, e.statusCode || 400, e.message || '更新失败');
        }
    });

    app.delete('/api/rules/datetime/:id', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureRuleStructures(db);
                const idx = db.biz.datetime_rules.findIndex(r => Number(r.id) === Number(req.params.id));
                if (idx === -1) return;
                db.biz.datetime_rules.splice(idx, 1);
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '删除失败');
        }
    });

    // ── Rule Engine Query (for allocation algorithm) ──

    app.get('/api/rules/evaluate-batch', authRequired, (req, res) => {
        try {
            const db = readDb();
            const { warehouse_code, channel_code, sku_code, remaining_days, temperature_zone = 0 } = req.query || {};
            if (!warehouse_code || !channel_code || !sku_code) {
                return apiErr(res, req, 400, 'warehouse_code, channel_code, sku_code 必填');
            }
            const result = evaluateBatchSupply(db, {
                warehouseCode: String(warehouse_code),
                channelCode: String(channel_code),
                skuCode: String(sku_code),
                batchRemainingDays: Number(remaining_days) || 0,
                temperatureZone: Number(temperature_zone) || 0
            });
            apiOk(res, req, result, '评估成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '评估失败');
        }
    });

    app.get('/api/rules/datetime-resolve', authRequired, (req, res) => {
        try {
            const db = readDb();
            const cutoff = getCutoffTime(db);
            const leadIntra = getLeadTime(db, 'INTRA_PROVINCE');
            const leadInter = getLeadTime(db, 'INTER_PROVINCE');
            apiOk(res, req, {
                cutoff_time: cutoff,
                lead_time_intra_province: leadIntra || 1,
                lead_time_inter_province: leadInter || 3
            }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    app.get('/api/rules/freshness-allocation-preview', authRequired, (req, res) => {
        try {
            const db = readDb();
            const { sku_code = '', temperature_zone = 0, total_qty = 100 } = req.query || {};
            if (!String(sku_code).trim()) return apiErr(res, req, 400, 'sku_code ???');
            apiOk(res, req, buildFreshnessAllocationPreview(db, {
                skuCode: String(sku_code).trim(),
                temperatureZone: Number(temperature_zone) || 0,
                totalQty: Number(total_qty) || 100
            }), '??????');
        } catch (e) {
            apiErr(res, req, 500, e.message || '??????');
        }
    });
};

module.exports = {
    ensureRuleStructures,
    registerFreshnessRuleRoutes,
    queryFreshnessRules,
    findApplicableRule,
    evaluateBatchSupply,
    buildFreshnessAllocationPreview,
    sortByFefo,
    getCutoffTime,
    getLeadTime,
    isNonWorkday,
    nextWorkday,
    getWarehouseChannelScope
};
