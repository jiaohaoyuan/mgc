/**
 * 仓能力规则模块
 *
 * 库存分配/调拨计划的核心约束配置，定义各仓库在不同产品/品类下的三种能力上限：
 *   1. 库容（库存容量）：仓库能存储的最大量（提/罐）
 *   2. 收货能力上限（入库能力）：仓库每天能接收的最大进货量
 *   3. 出库能力上限（发货能力）：仓库每天能发出的最大发货量
 *
 * 约束：同一仓库+同一产品/品类+同一能力类型，生效时间不应重叠
 *
 * 数据表: db.biz.warehouse_capacity_rules
 */

const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };

const createBizError = (msg, code = 400) => { const e = new Error(msg); e.statusCode = code; return e; };

const CAPACITY_TYPE_LABELS = {
    STORAGE: '库容（库存容量）',
    INBOUND: '收货能力上限（入库能力）',
    OUTBOUND: '出库能力上限（发货能力）'
};
const CAPACITY_TYPE_LIST = ['STORAGE', 'INBOUND', 'OUTBOUND'];

const ensureStructures = (db) => {
    db.biz = db.biz || {};
    db.biz.warehouse_capacity_rules = arr(db.biz.warehouse_capacity_rules);
};

const checkTimeOverlap = (db, { warehouse, scope_type, scope_code, capacity_type, effective_start, effective_end }, excludeId) => {
    const start = String(effective_start || '');
    const end = String(effective_end || '');
    if (!start || !end) return null;

    const existing = arr(db.biz.warehouse_capacity_rules).filter(r => {
        if (excludeId && Number(r.id) === Number(excludeId)) return false;
        if (Number(r.status) !== 1) return false;
        if (String(r.warehouse) !== String(warehouse)) return false;
        if (String(r.capacity_type) !== String(capacity_type)) return false;
        return true;
    });

    for (const r of existing) {
        const rStart = String(r.effective_start || '');
        const rEnd = String(r.effective_end || '');
        if (!rStart || !rEnd) continue;
        if (start <= rEnd && end >= rStart) return r;
    }
    return null;
};

const registerWarehouseCapacityRulesRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {

    // ⚠️ 固定路径必须在 /:id 之前

    // ── 筛选选项 ──
    app.get('/api/rules/warehouse-capacity/filter-options', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const rows = arr(db.biz.warehouse_capacity_rules);
            const warehouses = [...new Set(rows.map(r => String(r.warehouse)).filter(Boolean))].sort();
            apiOk(res, req, {
                warehouses,
                capacityTypes: CAPACITY_TYPE_LIST.map(t => ({ value: t, label: CAPACITY_TYPE_LABELS[t] })),
                scopeTypes: [{ value: 'PRODUCT', label: '产品（SKU）' }, { value: 'CATEGORY', label: '品类' }]
            }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 按仓库查询 ──
    app.get('/api/rules/warehouse-capacity/by-warehouse/:warehouse', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const rules = arr(db.biz.warehouse_capacity_rules).filter(r =>
                String(r.warehouse) === String(req.params.warehouse) && Number(r.status) === 1
            );
            apiOk(res, req, rules, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 列表 ──
    app.get('/api/rules/warehouse-capacity', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const { page = 1, pageSize = 20, keyword = '', warehouse = '', capacity_type = '', status = '' } = req.query || {};
            let rows = arr(db.biz.warehouse_capacity_rules);

            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                rows = rows.filter(r =>
                    String(r.rule_name || '').toLowerCase().includes(kw) ||
                    String(r.warehouse || '').toLowerCase().includes(kw)
                );
            }
            if (String(warehouse).trim()) rows = rows.filter(r => String(r.warehouse) === String(warehouse).trim());
            if (String(capacity_type).trim()) rows = rows.filter(r => String(r.capacity_type) === String(capacity_type).trim());
            if (String(status).trim()) rows = rows.filter(r => Number(r.status) === Number(status));

            rows.sort((a, b) => {
                const cmp = String(a.warehouse).localeCompare(String(b.warehouse));
                if (cmp !== 0) return cmp;
                return String(a.capacity_type).localeCompare(String(b.capacity_type));
            });

            const { list, total } = paginate(rows, page, pageSize);
            apiOk(res, req, { list, total }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 单条 (/:id 必须在固定路径之后) ──
    app.get('/api/rules/warehouse-capacity/:id', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const row = arr(db.biz.warehouse_capacity_rules).find(r => Number(r.id) === Number(req.params.id));
            if (!row) return apiErr(res, req, 404, '规则不存在');
            apiOk(res, req, row, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 新增 ──
    app.post('/api/rules/warehouse-capacity', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.warehouse) return apiErr(res, req, 400, '仓库不能为空');
            if (!body.capacity_type) return apiErr(res, req, 400, '能力类型不能为空');
            if (!CAPACITY_TYPE_LIST.includes(body.capacity_type)) return apiErr(res, req, 400, '无效的能力类型');
            if (body.capacity_value !== undefined && toNum(body.capacity_value) < 0) return apiErr(res, req, 400, '能力值不能为负数');

            const operator = req.user?.nickname || req.user?.loginId || '系统';
            updateDb((db) => {
                ensureStructures(db);
                const overlap = checkTimeOverlap(db, {
                    warehouse: String(body.warehouse),
                    capacity_type: String(body.capacity_type),
                    effective_start: body.effective_start,
                    effective_end: body.effective_end
                });
                if (overlap) {
                    throw createBizError(`生效时间与已有规则 [${overlap.rule_name || overlap.id}] 重叠`, 409);
                }

                db.biz.warehouse_capacity_rules.push({
                    id: nextId(db.biz.warehouse_capacity_rules),
                    rule_name: String(body.rule_name || '').trim(),
                    warehouse: String(body.warehouse).trim(),
                    warehouse_code: String(body.warehouse_code || '').trim(),
                    capacity_type: String(body.capacity_type).trim(),
                    capacity_value: toNum(body.capacity_value, 0),
                    capacity_unit: String(body.capacity_unit || '提').trim(),
                    scope_type: String(body.scope_type || 'CATEGORY').trim(),
                    scope_code: String(body.scope_code || 'ALL').trim(),
                    scope_name: String(body.scope_name || '').trim(),
                    effective_start: String(body.effective_start || '').trim(),
                    effective_end: String(body.effective_end || '').trim(),
                    status: body.status !== undefined ? toNum(body.status, 1) : 1,
                    remark: String(body.remark || '').trim(),
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
    app.put('/api/rules/warehouse-capacity/:id', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const row = db.biz.warehouse_capacity_rules.find(r => Number(r.id) === Number(req.params.id));
                if (!row) return;

                const overlap = checkTimeOverlap(db, {
                    warehouse: body.warehouse !== undefined ? String(body.warehouse) : String(row.warehouse),
                    capacity_type: body.capacity_type !== undefined ? String(body.capacity_type) : String(row.capacity_type),
                    effective_start: body.effective_start !== undefined ? String(body.effective_start) : String(row.effective_start),
                    effective_end: body.effective_end !== undefined ? String(body.effective_end) : String(row.effective_end)
                }, req.params.id);
                if (overlap) throw createBizError(`生效时间与已有规则重叠`, 409);

                if (body.rule_name !== undefined) row.rule_name = String(body.rule_name).trim();
                if (body.warehouse !== undefined) row.warehouse = String(body.warehouse).trim();
                if (body.warehouse_code !== undefined) row.warehouse_code = String(body.warehouse_code).trim();
                if (body.capacity_type !== undefined) row.capacity_type = String(body.capacity_type).trim();
                if (body.capacity_value !== undefined) row.capacity_value = toNum(body.capacity_value, 0);
                if (body.capacity_unit !== undefined) row.capacity_unit = String(body.capacity_unit).trim();
                if (body.scope_type !== undefined) row.scope_type = String(body.scope_type).trim();
                if (body.scope_code !== undefined) row.scope_code = String(body.scope_code).trim();
                if (body.scope_name !== undefined) row.scope_name = String(body.scope_name).trim();
                if (body.effective_start !== undefined) row.effective_start = String(body.effective_start).trim();
                if (body.effective_end !== undefined) row.effective_end = String(body.effective_end).trim();
                if (body.status !== undefined) row.status = toNum(body.status, 1);
                if (body.remark !== undefined) row.remark = String(body.remark).trim();
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
    app.delete('/api/rules/warehouse-capacity/:id', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const idx = db.biz.warehouse_capacity_rules.findIndex(r => Number(r.id) === Number(req.params.id));
                if (idx === -1) return;
                db.biz.warehouse_capacity_rules.splice(idx, 1);
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
    registerWarehouseCapacityRulesRoutes,
    CAPACITY_TYPE_LABELS,
    CAPACITY_TYPE_LIST
};
