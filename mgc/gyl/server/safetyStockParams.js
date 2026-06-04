/**
 * 安全库存参数管理模块
 *
 * 以 SKU 为最小单位（去掉服务水平维度），为每个仓库×SKU 设置安全库存天数范围。
 * 本模块是"可调天数规则"的前置依赖。
 *
 * 数据表: db.biz.safety_stock_params
 */

const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
const normalize = (v) => String(v || '').trim();

const createBizError = (msg, code = 400) => { const e = new Error(msg); e.statusCode = code; return e; };

const ensureStructures = (db) => {
    db.biz = db.biz || {};
    db.biz.safety_stock_params = arr(db.biz.safety_stock_params);
};

const registerSafetyStockParamsRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {

    // ⚠️ 注意：所有固定路径路由必须放在 /:id 参数路由之前！

    // ── 筛选选项 ──
    app.get('/api/safety-stock-params/filter-options', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const rows = arr(db.biz.safety_stock_params);
            const warehouses = [...new Set(rows.map(r => String(r.warehouse)).filter(Boolean))].sort();
            const abcTypes = [...new Set(rows.map(r => String(r.abc_type)).filter(Boolean))].sort();
            const categories = [...new Set(rows.map(r => String(r.category)).filter(Boolean))].sort();
            const warehouseCodes = [...new Set(rows.map(r => String(r.warehouse_code || '')).filter(Boolean))].sort();
            apiOk(res, req, { warehouses, warehouseCodes, abcTypes, categories }, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 按SKU查询仓库参数列表 ──
    app.get('/api/safety-stock-params/by-sku/:skuCode', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const params = arr(db.biz.safety_stock_params).filter(r =>
                String(r.sku_code) === String(req.params.skuCode) && Number(r.status) === 1
            );
            apiOk(res, req, params, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 批量导入 ──
    app.post('/api/safety-stock-params/batch-import', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const rows = arr(body.rows || body.data);
            if (!rows.length) return apiErr(res, req, 400, '导入数据不能为空');

            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let imported = 0, skipped = 0;
            const errors = [];

            updateDb((db) => {
                ensureStructures(db);
                for (let i = 0; i < rows.length; i++) {
                    const r = rows[i];
                    const skuCode = normalize(r.sku_code);
                    const warehouse = normalize(r.warehouse);
                    if (!skuCode || !warehouse) {
                        skipped++;
                        errors.push({ row: i + 1, msg: 'SKU编码或仓库为空' });
                        continue;
                    }
                    const exists = db.biz.safety_stock_params.some(p =>
                        String(p.sku_code) === skuCode && String(p.warehouse) === warehouse
                    );
                    if (exists) { skipped++; continue; }
                    db.biz.safety_stock_params.push({
                        id: nextId(db.biz.safety_stock_params),
                        sku_code: skuCode,
                        sku_name: normalize(r.sku_name || ''),
                        category: normalize(r.category || ''),
                        abc_type: normalize(r.abc_type || ''),
                        warehouse: warehouse,
                        warehouse_code: normalize(r.warehouse_code || ''),
                        min_safety_days: toNum(r.min_safety_days, 7),
                        max_safety_days: toNum(r.max_safety_days, 21),
                        remark: '',
                        status: 1,
                        created_by: operator,
                        created_time: nowIso(),
                        updated_by: operator,
                        updated_time: nowIso()
                    });
                    imported++;
                }
            });
            apiOk(res, req, { imported, skipped, errors }, `成功导入 ${imported} 条，跳过 ${skipped} 条`);
        } catch (e) {
            apiErr(res, req, 500, e.message || '导入失败');
        }
    });

    // ── 列表查询（分页+筛选） ──
    app.get('/api/safety-stock-params', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const { page = 1, pageSize = 20, keyword = '', sku_code = '', warehouse = '', abc_type = '', category = '' } = req.query || {};
            let rows = arr(db.biz.safety_stock_params);

            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                rows = rows.filter(r =>
                    String(r.sku_code || '').toLowerCase().includes(kw) ||
                    String(r.sku_name || '').toLowerCase().includes(kw) ||
                    String(r.warehouse || '').toLowerCase().includes(kw)
                );
            }
            if (String(sku_code).trim()) rows = rows.filter(r => String(r.sku_code) === String(sku_code).trim());
            if (String(warehouse).trim()) rows = rows.filter(r => String(r.warehouse) === String(warehouse).trim());
            if (String(abc_type).trim()) rows = rows.filter(r => String(r.abc_type) === String(abc_type).trim());
            if (String(category).trim()) rows = rows.filter(r => String(r.category || '').includes(String(category).trim()));

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

    // ── 单条详情 (/:id 必须放在所有固定路径之后) ──
    app.get('/api/safety-stock-params/:id', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const row = arr(db.biz.safety_stock_params).find(r => Number(r.id) === Number(req.params.id));
            if (!row) return apiErr(res, req, 404, '参数不存在');
            apiOk(res, req, row, '获取成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '获取失败');
        }
    });

    // ── 新增 ──
    app.post('/api/safety-stock-params', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.sku_code) return apiErr(res, req, 400, 'SKU编码不能为空');
            if (!body.warehouse) return apiErr(res, req, 400, '仓库不能为空');

            const operator = req.user?.nickname || req.user?.loginId || '系统';
            updateDb((db) => {
                ensureStructures(db);
                const exists = db.biz.safety_stock_params.some(r =>
                    String(r.sku_code) === String(body.sku_code) &&
                    String(r.warehouse) === String(body.warehouse)
                );
                if (exists) throw createBizError('该SKU在此仓库下已存在安全库存参数', 409);

                db.biz.safety_stock_params.push({
                    id: nextId(db.biz.safety_stock_params),
                    sku_code: String(body.sku_code).trim(),
                    sku_name: String(body.sku_name || '').trim(),
                    category: String(body.category || '').trim(),
                    abc_type: String(body.abc_type || '').trim(),
                    warehouse: String(body.warehouse).trim(),
                    warehouse_code: String(body.warehouse_code || '').trim(),
                    min_safety_days: toNum(body.min_safety_days, 7),
                    max_safety_days: toNum(body.max_safety_days, 21),
                    remark: String(body.remark || '').trim(),
                    status: body.status !== undefined ? toNum(body.status, 1) : 1,
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
    app.put('/api/safety-stock-params/:id', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const row = db.biz.safety_stock_params.find(r => Number(r.id) === Number(req.params.id));
                if (!row) return;
                if (body.min_safety_days !== undefined) row.min_safety_days = toNum(body.min_safety_days, 7);
                if (body.max_safety_days !== undefined) row.max_safety_days = toNum(body.max_safety_days, 21);
                if (body.abc_type !== undefined) row.abc_type = String(body.abc_type).trim();
                if (body.status !== undefined) row.status = toNum(body.status, 1);
                if (body.remark !== undefined) row.remark = String(body.remark).trim();
                row.updated_by = operator;
                row.updated_time = nowIso();
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '参数不存在');
            apiOk(res, req, null, '更新成功');
        } catch (e) {
            apiErr(res, req, e.statusCode || 400, e.message || '更新失败');
        }
    });

    // ── 删除 ──
    app.delete('/api/safety-stock-params/:id', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const idx = db.biz.safety_stock_params.findIndex(r => Number(r.id) === Number(req.params.id));
                if (idx === -1) return;
                db.biz.safety_stock_params.splice(idx, 1);
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '参数不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) {
            apiErr(res, req, 500, e.message || '删除失败');
        }
    });
};

module.exports = {
    ensureStructures,
    registerSafetyStockParamsRoutes
};
