/**
 * 可调天数规则模块
 *
 * 库存分配/调拨计划的弹性配置，定义各仓库在不同SKU下的"可调天数"，
 * 即在调拨计划/分仓需求计划中，允许超出正常安全库存的弹性天数范围。
 *
 * 前置依赖：安全库存参数 (db.biz.safety_stock_params)
 * 以 SKU 为最小单位（去掉服务水平维度）
 *
 * 数据表: db.biz.adjustable_days_rules
 */

const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
const normalize = (v) => String(v || '').trim();

const createBizError = (msg, code = 400) => { const e = new Error(msg); e.statusCode = code; return e; };

const ADJUST_DIRECTION_LABELS = {
    UP: '向上调整（增加天数）',
    DOWN: '向下调整（减少天数）',
    BOTH: '双向调整'
};

const ensureStructures = (db) => {
    db.biz = db.biz || {};
    db.biz.adjustable_days_rules = arr(db.biz.adjustable_days_rules);
    db.biz.safety_stock_params = arr(db.biz.safety_stock_params);
};

const getSafetyStockParam = (db, skuCode, warehouse) => {
    return arr(db.biz.safety_stock_params).find(r =>
        String(r.sku_code) === String(skuCode) &&
        String(r.warehouse) === String(warehouse) &&
        Number(r.status) === 1
    );
};

const registerAdjustableDaysRulesRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {

    // ⚠️ 固定路径必须在 /:id 之前

    // ── 筛选选项 ──
    app.get('/api/rules/adjustable-days/filter-options', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const rows = arr(db.biz.adjustable_days_rules);
            const warehouses = [...new Set(rows.map(r => String(r.warehouse)).filter(Boolean))].sort();
            const directions = Object.entries(ADJUST_DIRECTION_LABELS).map(([value, label]) => ({ value, label }));
            apiOk(res, req, { warehouses, directions }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 按SKU查询 ──
    app.get('/api/rules/adjustable-days/by-sku/:skuCode', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const rules = arr(db.biz.adjustable_days_rules).filter(r =>
                String(r.sku_code) === String(req.params.skuCode) && Number(r.status) === 1
            );
            apiOk(res, req, rules, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 批量设置 ──
    app.post('/api/rules/adjustable-days/batch-set', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const rows = arr(body.rows || body.data);
            if (!rows.length) return apiErr(res, req, 400, '数据不能为空');

            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let created = 0, updated = 0, skipped = 0;

            updateDb((db) => {
                ensureStructures(db);
                for (const r of rows) {
                    const skuCode = normalize(r.sku_code);
                    const warehouse = normalize(r.warehouse);
                    const direction = normalize(r.adjust_direction || 'BOTH');
                    if (!skuCode || !warehouse) { skipped++; continue; }

                    const safetyParam = getSafetyStockParam(db, skuCode, warehouse);
                    const adjustDays = toNum(r.adjust_days, 0);

                    const existing = db.biz.adjustable_days_rules.find(e =>
                        String(e.sku_code) === skuCode && String(e.warehouse) === warehouse && String(e.adjust_direction) === direction
                    );

                    if (existing) {
                        existing.adjust_days = adjustDays;
                        existing.effective_min_days = Math.max(0, (safetyParam ? safetyParam.min_safety_days : 7) - adjustDays);
                        existing.effective_max_days = (safetyParam ? safetyParam.max_safety_days : 21) + adjustDays;
                        existing.updated_by = operator;
                        existing.updated_time = nowIso();
                        updated++;
                    } else {
                        db.biz.adjustable_days_rules.push({
                            id: nextId(db.biz.adjustable_days_rules),
                            rule_name: normalize(r.rule_name || ''),
                            sku_code: skuCode,
                            sku_name: normalize(r.sku_name || ''),
                            category: normalize(r.category || ''),
                            warehouse: warehouse,
                            warehouse_code: normalize(r.warehouse_code || ''),
                            adjust_direction: direction,
                            adjust_days: adjustDays,
                            safety_min_days: safetyParam ? safetyParam.min_safety_days : 7,
                            safety_max_days: safetyParam ? safetyParam.max_safety_days : 21,
                            safety_param_id: safetyParam ? safetyParam.id : null,
                            effective_min_days: Math.max(0, (safetyParam ? safetyParam.min_safety_days : 7) - adjustDays),
                            effective_max_days: (safetyParam ? safetyParam.max_safety_days : 21) + adjustDays,
                            status: r.status !== undefined ? toNum(r.status, 1) : 1,
                            remark: normalize(r.remark || ''),
                            effective_start: normalize(r.effective_start || ''),
                            effective_end: normalize(r.effective_end || ''),
                            created_by: operator,
                            created_time: nowIso(),
                            updated_by: operator,
                            updated_time: nowIso()
                        });
                        created++;
                    }
                }
            });
            apiOk(res, req, { created, updated, skipped }, `新增 ${created} 条，更新 ${updated} 条，跳过 ${skipped} 条`);
        } catch (e) {
            apiErr(res, req, 500, e.message || '批量设置失败');
        }
    });

    // ── 列表 ──
    app.get('/api/rules/adjustable-days', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const { page = 1, pageSize = 20, keyword = '', sku_code = '', warehouse = '', adjust_direction = '', status = '' } = req.query || {};
            let rows = arr(db.biz.adjustable_days_rules);

            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                rows = rows.filter(r =>
                    String(r.rule_name || '').toLowerCase().includes(kw) ||
                    String(r.sku_code || '').toLowerCase().includes(kw) ||
                    String(r.sku_name || '').toLowerCase().includes(kw) ||
                    String(r.warehouse || '').toLowerCase().includes(kw)
                );
            }
            if (String(sku_code).trim()) rows = rows.filter(r => String(r.sku_code) === String(sku_code).trim());
            if (String(warehouse).trim()) rows = rows.filter(r => String(r.warehouse) === String(warehouse).trim());
            if (String(adjust_direction).trim()) rows = rows.filter(r => String(r.adjust_direction) === String(adjust_direction).trim());
            if (String(status).trim()) rows = rows.filter(r => Number(r.status) === Number(status));

            rows.sort((a, b) => {
                const cmp = String(a.sku_code).localeCompare(String(b.sku_code));
                return cmp !== 0 ? cmp : String(a.warehouse).localeCompare(String(b.warehouse));
            });

            const { list, total } = paginate(rows, page, pageSize);
            apiOk(res, req, { list, total }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 单条 (/:id 必须在固定路径之后) ──
    app.get('/api/rules/adjustable-days/:id', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const row = arr(db.biz.adjustable_days_rules).find(r => Number(r.id) === Number(req.params.id));
            if (!row) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, row, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 新增 ──
    app.post('/api/rules/adjustable-days', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.sku_code) return apiErr(res, req, 400, 'SKU编码不能为空');
            if (!body.warehouse) return apiErr(res, req, 400, '仓库不能为空');
            if (!body.adjust_direction) return apiErr(res, req, 400, '调整方向不能为空');

            const operator = req.user?.nickname || req.user?.loginId || '系统';
            updateDb((db) => {
                ensureStructures(db);

                const exists = db.biz.adjustable_days_rules.some(r =>
                    String(r.sku_code) === String(body.sku_code) &&
                    String(r.warehouse) === String(body.warehouse) &&
                    String(r.adjust_direction) === String(body.adjust_direction) &&
                    Number(r.status) === 1
                );
                if (exists) throw createBizError('该SKU在此仓库下已存在相同调整方向的可调天数规则', 409);

                const safetyParam = getSafetyStockParam(db, String(body.sku_code), String(body.warehouse));

                db.biz.adjustable_days_rules.push({
                    id: nextId(db.biz.adjustable_days_rules),
                    rule_name: String(body.rule_name || '').trim(),
                    sku_code: String(body.sku_code).trim(),
                    sku_name: String(body.sku_name || '').trim(),
                    category: String(body.category || '').trim(),
                    warehouse: String(body.warehouse).trim(),
                    warehouse_code: String(body.warehouse_code || '').trim(),
                    adjust_direction: String(body.adjust_direction).trim(),
                    adjust_days: toNum(body.adjust_days, 0),
                    safety_min_days: safetyParam ? safetyParam.min_safety_days : 7,
                    safety_max_days: safetyParam ? safetyParam.max_safety_days : 21,
                    safety_param_id: safetyParam ? safetyParam.id : null,
                    effective_min_days: toNum(body.effective_min_days,
                        (safetyParam ? safetyParam.min_safety_days : 7) - toNum(body.adjust_days, 0)),
                    effective_max_days: toNum(body.effective_max_days,
                        (safetyParam ? safetyParam.max_safety_days : 21) + toNum(body.adjust_days, 0)),
                    status: body.status !== undefined ? toNum(body.status, 1) : 1,
                    remark: String(body.remark || '').trim(),
                    effective_start: String(body.effective_start || '').trim(),
                    effective_end: String(body.effective_end || '').trim(),
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

    // ── 更新 ──
    app.put('/api/rules/adjustable-days/:id', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const row = db.biz.adjustable_days_rules.find(r => Number(r.id) === Number(req.params.id));
                if (!row) return;

                if (body.rule_name !== undefined) row.rule_name = String(body.rule_name).trim();
                if (body.adjust_direction !== undefined) row.adjust_direction = String(body.adjust_direction).trim();
                if (body.adjust_days !== undefined) {
                    row.adjust_days = toNum(body.adjust_days, 0);
                    const baseMin = toNum(row.safety_min_days, 7);
                    const baseMax = toNum(row.safety_max_days, 21);
                    row.effective_min_days = Math.max(0, baseMin - row.adjust_days);
                    row.effective_max_days = baseMax + row.adjust_days;
                }
                if (body.effective_min_days !== undefined) row.effective_min_days = toNum(body.effective_min_days, 0);
                if (body.effective_max_days !== undefined) row.effective_max_days = toNum(body.effective_max_days, 0);
                if (body.status !== undefined) row.status = toNum(body.status, 1);
                if (body.remark !== undefined) row.remark = String(body.remark).trim();
                if (body.effective_start !== undefined) row.effective_start = String(body.effective_start).trim();
                if (body.effective_end !== undefined) row.effective_end = String(body.effective_end).trim();
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

    // ── 删除 ──
    app.delete('/api/rules/adjustable-days/:id', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const idx = db.biz.adjustable_days_rules.findIndex(r => Number(r.id) === Number(req.params.id));
                if (idx === -1) return;
                db.biz.adjustable_days_rules.splice(idx, 1);
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '删除失败');
        }
    });
};

module.exports = {
    ensureStructures,
    registerAdjustableDaysRulesRoutes,
    ADJUST_DIRECTION_LABELS
};
