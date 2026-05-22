/**
 * 低温需求提报模块 — 冷链产品专属
 *
 * 与常温提报的关键差异：
 * 1. 仅匹配冷藏仓 (warehouse_type=2)
 * 2. 运输时效限制 (24h/500km from datetime_rules)
 * 3. 严格新鲜度约束 (强制FEFO + 到货效期门槛)
 * 4. 紧急补货通道 (bypass cutoff + highest priority)
 * 5. 最小批量 (per-SKU min_batch_qty)
 */

const XLSX = require('xlsx');
const { readDb, updateDb, nextId, nowIso, buildSequenceNo } = require('./localDb');
const { ensureChannelDemandPlanStructures } = require('./channelDemandPlan');
const { queryFreshnessRules, findApplicableRule, getWarehouseChannelScope, getCutoffTime, getLeadTime, isNonWorkday, buildFreshnessAllocationPreview } = require('./freshnessRules');
const { getSlotWeights } = require('./slotRules');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
const normalize = (v) => String(v || '').trim();

const STATUS = { DRAFT: 0, ALLOCATED: 1, CONFIRMED: 2, DISPATCHED: 3, DELETED: -1 };

const createBizError = (msg, code = 400) => { const e = new Error(msg); e.statusCode = code; return e; };

const ensureStructures = (db) => {
    db.biz = db.biz || {};
    db.master = db.master || {};
    db.biz.cold_chain_submissions = arr(db.biz.cold_chain_submissions);
    db.biz.cold_chain_submission_lines = arr(db.biz.cold_chain_submission_lines);
    db.biz.cold_chain_submission_warehouses = arr(db.biz.cold_chain_submission_warehouses);
    ensureChannelDemandPlanStructures(db);
};

const buildNo = (db) => {
    return buildSequenceNo(db, { prefix: 'CCS', metaKey: '_cold_sub_seq', array: arr(db.biz.cold_chain_submissions), field: 'submission_no' });
};

// ===== Cold Chain Warehouse Matching =====

const getColdWarehouses = (db) => {
    // Only cold storage warehouses (warehouse_type=2)
    return arr(db.master.warehouse).filter(w => Number(w.warehouse_type) === 2);
};

const calcTransportHours = (db, warehouseCode, channelCode) => {
    const scope = getWarehouseChannelScope(db, warehouseCode, channelCode);
    if (scope === 0) return 8;   // same province: ~8h delivery
    if (scope === 1) return 18;  // neighbor: ~18h
    return 36;                    // cross-country: ~36h (may exceed limit)
};

const getColdTransportLimit = (db) => {
    const rules = arr(db.biz.datetime_rules).filter(r =>
        String(r.rule_type) === 'DELIVERY_WINDOW' && String(r.apply_scope) === 'COLD' && Number(r.status) === 1
    );
    if (rules.length > 0) {
        const cfg = rules[0].config_value || {};
        return { max_hours: Number(cfg.max_hours) || 24, max_km: Number(cfg.max_km) || 500 };
    }
    return { max_hours: 24, max_km: 500 };
};

/**
 * Get cold-chain-eligible warehouse stock for a SKU.
 * Only returns warehouses that:
 *  - Are cold storage (warehouse_type=2)
 *  - Have transport time within cold chain limit
 *  - Have batches that pass freshness checks
 */
const getColdSkuStock = (db, skuCode, channelCode) => {
    const coldWhs = getColdWarehouses(db);
    if (coldWhs.length === 0) return [];

    const transportLimit = getColdTransportLimit(db);

    // Get SKU temperature zone
    const sku = arr(db.master.sku).find(s => String(s.sku_code) === String(skuCode));
    const tempZone = sku ? (Number(sku.temperature_zone) || 0) : 2; // default to cold

    const freshRules = queryFreshnessRules(db, { skuCode, temperatureZone: tempZone });
    const ledgerBatches = arr(db.biz.inventory_ledger).filter(
        r => String(r.sku_code) === String(skuCode) && toNum(r.available_qty, 0) > 0
    );

    const results = [];
    coldWhs.forEach(wh => {
        const transportHours = calcTransportHours(db, wh.warehouse_code, channelCode);
        if (transportHours > transportLimit.max_hours) return; // exceeds transport window

        const whBatches = ledgerBatches.filter(r => String(r.warehouse_code) === String(wh.warehouse_code));
        if (whBatches.length === 0) return;

        // Filter by freshness: only batches that pass strict cold chain rules
        const validBatches = whBatches.filter(batch => {
            const remainingDays = Number(batch.remaining_days) || 0;
            const rule = findApplicableRule(freshRules, remainingDays);
            if (!rule) return true;
            const scope = Number(rule.allowed_scope !== undefined && rule.allowed_scope !== null ? Number(rule.allowed_scope) : 2);
            const batchScope = getWarehouseChannelScope(db, wh.warehouse_code, channelCode);
            return batchScope <= scope;
        });

        // Cold chain: always FEFO sort
        validBatches.sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));

        const validQty = validBatches.reduce((s, b) => s + toNum(b.available_qty, 0), 0);
        if (validQty === 0) return;

        results.push({
            warehouse_code: wh.warehouse_code,
            warehouse_name: wh.warehouse_name,
            available_qty: validQty,
            total_qty: whBatches.reduce((s, b) => s + toNum(b.total_qty, 0), 0),
            locked_qty: whBatches.reduce((s, b) => s + toNum(b.locked_qty, 0), 0),
            priority: getWarehouseChannelScope(db, wh.warehouse_code, channelCode),
            transport_hours: transportHours,
            batch_count: validBatches.length
        });
    });

    results.sort((a, b) => a.priority - b.priority || b.available_qty - a.available_qty);
    return results;
};

// ===== Core Allocation =====

const autoAllocateColdLine = (db, line, ratios) => {
    const { sku_code, lv2_channel_code, plan_value } = line;
    const targetQty = toNum(plan_value, 0);
    if (targetQty <= 0) return [];

    const warehouses = getColdSkuStock(db, sku_code, lv2_channel_code);
    if (warehouses.length === 0) return [];

    // Get SKU min batch qty
    const sku = arr(db.master.sku).find(s => String(s.sku_code) === String(skuCode));
    const minBatch = sku ? (toNum(sku.min_batch_qty, 0) || 0) : 0;

    // Check for slot override
    const slotResult = getSlotWeights(db, {
        channelCode: lv2_channel_code,
        skuCode: sku_code,
        defaultRatios: ratios
    });

    let effectiveRatios = ratios;
    if (slotResult.slot_code && slotResult.weights.length > 0) {
        const whWeightMap = new Map(slotResult.weights.map(w => [w.warehouse_code, w.weight]));
        warehouses.sort((a, b) => (whWeightMap.get(b.warehouse_code) || 0) - (whWeightMap.get(a.warehouse_code) || 0));
        effectiveRatios = warehouses.map(wh => whWeightMap.get(wh.warehouse_code) || 0);
    } else {
        effectiveRatios = ratios.slice(0, warehouses.length);
        while (effectiveRatios.length < warehouses.length) effectiveRatios.push(0);
    }

    const ratioSum = effectiveRatios.reduce((s, r) => s + r, 0);
    const normalized = ratioSum > 0
        ? effectiveRatios.map(r => r / ratioSum)
        : warehouses.map(() => 1 / warehouses.length);

    return warehouses.map((wh, i) => {
        let qty = Math.round(targetQty * normalized[i]);
        qty = Math.min(qty, wh.available_qty);
        // Apply minimum batch quantity
        if (minBatch > 0 && qty > 0 && qty < minBatch) qty = Math.min(minBatch, wh.available_qty);
        return {
            warehouse_code: wh.warehouse_code,
            warehouse_name: wh.warehouse_name,
            sku_code,
            allocation_qty: qty,
            allocation_ratio: Number(normalized[i].toFixed(4)),
            available_qty: wh.available_qty,
            total_qty: wh.total_qty,
            transport_hours: wh.transport_hours,
            is_emergency: false,
            sort_order: i + 1
        };
    }).filter(a => a.allocation_qty > 0);
};

const autoAllocateAll = (db, submissionNo, ratios) => {
    ensureStructures(db);
    const lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(submissionNo));
    const results = { allocated: 0, shortfall: 0, noStock: 0 };

    lines.forEach(line => {
        db.biz.cold_chain_submission_warehouses = arr(db.biz.cold_chain_submission_warehouses).filter(w => Number(w.line_id) !== Number(line.id));
        const allocs = autoAllocateColdLine(db, line, ratios);
        allocs.forEach(a => {
            db.biz.cold_chain_submission_warehouses.push({
                id: nextId(db.biz.cold_chain_submission_warehouses),
                submission_no: submissionNo, line_id: line.id,
                ...a, updated_by: '', updated_time: nowIso()
            });
        });
        const total = allocs.reduce((s, a) => s + a.allocation_qty, 0);
        line.total_allocated = total;
        line.shortage = Math.max(0, toNum(line.plan_value, 0) - total);
        line.status = line.shortage > 0 ? 0 : 1;
        line.updated_time = nowIso();
        if (allocs.length === 0) results.noStock++;
        else if (line.shortage > 0) results.shortfall++;
        else results.allocated++;
    });
    return results;
};

// ===== Dispatch =====

const dispatchColdSubmission = (db, submissionNo, operator) => {
    ensureStructures(db);
    db.biz.transfer_orders = arr(db.biz.transfer_orders);
    db.biz.transfer_tracks = arr(db.biz.transfer_tracks);
    db.biz.inventory_locks = arr(db.biz.inventory_locks);
    db.biz.inventory_ledger = arr(db.biz.inventory_ledger);

    const sub = arr(db.biz.cold_chain_submissions).find(s => String(s.submission_no) === String(submissionNo));
    if (!sub) throw createBizError('提报单不存在', 404);
    if (sub.status !== STATUS.CONFIRMED) throw createBizError('仅已确认的提报可下发', 400);

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    db.meta = db.meta || {}; db.meta._transfer_seq = db.meta._transfer_seq || {};
    const trKey = `TR${today}`;
    if (!db.meta._transfer_seq[trKey]) {
        const maxSeq = arr(db.biz.transfer_orders)
            .filter(r => String(r.transfer_no || '').startsWith(trKey))
            .reduce((max, r) => Math.max(max, toNum(String(r.transfer_no || '').slice(-4), 0)), 0);
        db.meta._transfer_seq[trKey] = maxSeq + 1;
    }

    const lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(submissionNo));
    const transfers = [], locks = [];

    lines.forEach(line => {
        const allocs = arr(db.biz.cold_chain_submission_warehouses).filter(w => Number(w.line_id) === Number(line.id));
        allocs.forEach(alloc => {
            if (toNum(alloc.allocation_qty, 0) <= 0) return;
            const seq = db.meta._transfer_seq[trKey]++;
            const transferNo = `${trKey}${String(seq).padStart(4, '0')}`;
            db.biz.transfer_orders.push({
                id: nextId(db.biz.transfer_orders), transfer_no: transferNo,
                source_submission_no: submissionNo, submission_type: 'COLD_CHAIN',
                from_warehouse_code: alloc.warehouse_code, from_warehouse_name: alloc.warehouse_name,
                to_channel_code: line.lv2_channel_code, to_channel_name: line.lv2_channel_name,
                sku_code: line.sku_code, sku_name: line.sku_name,
                plan_week: line.plan_week, quantity: alloc.allocation_qty,
                status: 'DRAFT', note: `低温提报 ${submissionNo}${line.is_emergency ? ' [紧急]' : ''} 自动生成`,
                created_by: operator, created_time: nowIso(), updated_time: nowIso()
            });
            transfers.push({ transfer_no: transferNo });
            db.biz.transfer_tracks.push({
                id: nextId(db.biz.transfer_tracks), transfer_no: transferNo,
                action: 'CREATED', action_by: operator, action_time: nowIso(),
                note: '低温需求提报自动下发'
            });
            db.biz.inventory_locks.push({
                id: nextId(db.biz.inventory_locks),
                warehouse_code: alloc.warehouse_code, warehouse_name: alloc.warehouse_name,
                sku_code: line.sku_code, sku_name: line.sku_name,
                lock_qty: alloc.allocation_qty, lock_type: 'COLD_CHAIN_DISPATCH',
                lock_ref: submissionNo, lock_ref_type: 'cold_chain_submission',
                transfer_no: transferNo, created_by: operator,
                created_time: nowIso(), updated_time: nowIso(), status: 'ACTIVE'
            });
            locks.push({ lock_qty: alloc.allocation_qty });
            // FIFO deduct
            let remaining = alloc.allocation_qty;
            const batches = arr(db.biz.inventory_ledger)
                .filter(r => String(r.warehouse_code) === String(alloc.warehouse_code) && String(r.sku_code) === String(line.sku_code) && toNum(r.available_qty, 0) > 0)
                .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));
            batches.forEach(b => {
                if (remaining <= 0) return;
                const deduct = Math.min(remaining, toNum(b.available_qty, 0));
                b.available_qty = Math.max(0, toNum(b.available_qty, 0) - deduct);
                b.locked_qty = toNum(b.locked_qty, 0) + deduct;
                b.updated_at = nowIso();
                remaining -= deduct;
            });
        });
    });
    sub.status = STATUS.DISPATCHED; sub.updated_time = nowIso();
    return { transferCount: transfers.length, lockCount: locks.length };
};

// ===== Export =====

const exportWorkbook = (db, submissionNo) => {
    ensureStructures(db);
    const sub = arr(db.biz.cold_chain_submissions).find(s => String(s.submission_no) === String(submissionNo));
    if (!sub) throw createBizError('提报单不存在', 404);
    const lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(submissionNo));
    const data = lines.map(line => {
        const allocs = arr(db.biz.cold_chain_submission_warehouses)
            .filter(w => Number(w.line_id) === Number(line.id)).sort((a, b) => toNum(a.sort_order, 0) - toNum(b.sort_order, 0));
        const row = {
            '渠道': line.lv2_channel_name, 'SKU编码': line.sku_code, 'SKU名称': line.sku_name,
            '品类': line.category_name, '需求周': line.plan_week,
            '计划需求量': toNum(line.plan_value, 0), '已分配总量': toNum(line.total_allocated, 0),
            '缺口': toNum(line.shortage, 0), '紧急': line.is_emergency ? '是' : '否'
        };
        allocs.forEach((a, i) => {
            row[`仓${i+1}`] = a.warehouse_name;
            row[`分配量${i+1}`] = a.allocation_qty;
            row[`运输时效${i+1}`] = `${a.transport_hours}h`;
        });
        return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '低温发货指引');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { filename: `低温提报_${submissionNo}.xlsx`, buffer: buf };
};

// ===== Route Registration =====

const registerColdChainRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {

    app.get('/api/demand/cold-chain-submission/confirmed-versions', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureChannelDemandPlanStructures(db);
            const versions = arr(db.biz.channel_demand_plan_versions)
                .filter(v => Number(v.status) === 3)
                .map(v => {
                    const plan = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(v.plan_code));
                    return { plan_code: v.plan_code, plan_name: plan?.plan_name || '', version_code: v.version_code, version_label: v.version_label, begin_week: v.begin_week, end_week: v.end_week, week_count: v.week_count, confirmed_time: v.confirmed_time };
                });
            apiOk(res, req, versions, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.get('/api/demand/cold-chain-submission', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureStructures(db);
            const { page = 1, pageSize = 10, keyword = '', status = '' } = req.query || {};
            let rows = arr(db.biz.cold_chain_submissions).filter(s => Number(s.status) !== -1);
            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                rows = rows.filter(s => String(s.submission_no || '').toLowerCase().includes(kw) || String(s.plan_code || '').toLowerCase().includes(kw));
            }
            if (String(status)) rows = rows.filter(s => Number(s.status) === Number(status));
            const enriched = rows.map(s => {
                const plan = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(s.plan_code));
                const v = arr(db.biz.channel_demand_plan_versions).find(ver => String(ver.version_code) === String(s.version_code));
                const lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(s.submission_no));
                return { ...s, plan_name: plan?.plan_name || '', version_label: v?.version_label || '', line_count: lines.length, fulfilled_count: lines.filter(l => Number(l.status) === 1).length };
            });
            const { list, total } = paginate(enriched, page, pageSize);
            apiOk(res, req, { list, total }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.post('/api/demand/cold-chain-submission', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { version_code, ratios = [70, 30] } = req.body || {};
            if (!version_code) return apiErr(res, req, 400, '请选择已确认版本');
            const result = updateDb((db) => {
                ensureStructures(db);
                const version = arr(db.biz.channel_demand_plan_versions).find(v => String(v.version_code) === String(version_code));
                if (!version) throw createBizError('版本不存在', 404);
                if (Number(version.status) !== 3) throw createBizError('仅已确认版本可创建提报');
                const existing = arr(db.biz.cold_chain_submissions).find(s => String(s.version_code) === String(version_code) && Number(s.status) !== -1);
                if (existing) throw createBizError('该版本已有低温提报单', 409);

                // Only include cold-chain SKUs (temperature_zone=2冷藏)
                const planData = arr(db.biz.channel_demand_plan_data).filter(d => String(d.version_code) === String(version_code));
                const coldSkuCodes = new Set(arr(db.master.sku).filter(s => Number(s.temperature_zone) === 2).map(s => s.sku_code));
                const coldPlanData = planData.filter(d => coldSkuCodes.has(String(d.sku_code)));
                if (coldPlanData.length === 0) throw createBizError('该版本无低温产品需求');

                const subNo = buildNo(db);
                const plan = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(version.plan_code));
                const sub = {
                    id: nextId(db.biz.cold_chain_submissions), submission_no: subNo,
                    plan_code: version.plan_code, version_code, plan_name: plan?.plan_name || '', version_label: version.version_label || '',
                    status: STATUS.DRAFT, created_by: operator, created_time: nowIso(), updated_by: operator, updated_time: nowIso(), confirmed_by: '', confirmed_time: ''
                };
                db.biz.cold_chain_submissions.push(sub);
                coldPlanData.forEach(pd => {
                    const freshnessPreview = buildFreshnessAllocationPreview(db, {
                        skuCode: pd.sku_code,
                        temperatureZone: Number(arr(db.master.sku).find((sku) => String(sku.sku_code) === String(pd.sku_code))?.temperature_zone) || 0,
                        totalQty: toNum(pd.plan_value, 0)
                    });
                    db.biz.cold_chain_submission_lines.push({
                        id: nextId(db.biz.cold_chain_submission_lines), submission_no: subNo,
                        lv2_channel_code: pd.lv2_channel_code, lv2_channel_name: pd.lv2_channel_name,
                        sku_code: pd.sku_code, sku_name: pd.sku_name,
                        category_code: pd.lv3_category_code || '', category_name: pd.lv3_category_name || '',
                        plan_week: pd.plan_week, week_start_date: pd.week_start_date, week_end_date: pd.week_end_date,
                        plan_value: toNum(pd.plan_value, 0), total_allocated: 0, shortage: toNum(pd.plan_value, 0),
                        is_emergency: false, status: 0, updated_time: nowIso()
                        , freshness_allocation_preview: JSON.stringify(freshnessPreview.rows || [])
                    });
                });
                const r = autoAllocateAll(db, subNo, arr(ratios).map(n => toNum(n, 0)));
                if (r.noStock + r.shortfall === 0) sub.status = STATUS.ALLOCATED;
                return { submission: sub, allocResult: r };
            });
            apiOk(res, req, result, '创建成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '创建失败'); }
    });

    app.get('/api/demand/cold-chain-submission/:submissionNo', authRequired, (req, res) => {
        try {
            const db = readDb(); ensureStructures(db);
            const sub = arr(db.biz.cold_chain_submissions).find(s => String(s.submission_no) === String(req.params.submissionNo));
            if (!sub) return apiErr(res, req, 404, '不存在');
            const plan = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(sub.plan_code));
            const v = arr(db.biz.channel_demand_plan_versions).find(ver => String(ver.version_code) === String(sub.version_code));
            const lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(sub.submission_no));
            apiOk(res, req, { ...sub, plan_name: plan?.plan_name || '', version_label: v?.version_label || '', begin_week: v?.begin_week || '', end_week: v?.end_week || '', line_count: lines.length, fulfilled_count: lines.filter(l => Number(l.status) === 1).length }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.get('/api/demand/cold-chain-submission/:submissionNo/lines', authRequired, (req, res) => {
        try {
            const db = readDb(); ensureStructures(db);
            const { page = 1, pageSize = 20, shortcut = '' } = req.query || {};
            let lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(req.params.submissionNo));
            if (String(shortcut) === '1') lines = lines.filter(l => toNum(l.shortage, 0) > 0);
            const { list, total } = paginate(lines, page, pageSize);
            const enriched = list.map(line => {
                const allocs = arr(db.biz.cold_chain_submission_warehouses).filter(w => Number(w.line_id) === Number(line.id)).sort((a, b) => toNum(a.sort_order, 0) - toNum(b.sort_order, 0));
                return { ...line, warehouses: allocs };
            });
            const sub = arr(db.biz.cold_chain_submissions).find(s => String(s.submission_no) === String(req.params.submissionNo));
            apiOk(res, req, { list: enriched, total, submission: sub }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.put('/api/demand/cold-chain-submission/:submissionNo/lines/:lineId', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { warehouses } = req.body || {};
            if (!Array.isArray(warehouses)) return apiErr(res, req, 400, '请提供仓库分配数据');
            updateDb((db) => {
                ensureStructures(db);
                const line = arr(db.biz.cold_chain_submission_lines).find(l => Number(l.id) === Number(req.params.lineId) && String(l.submission_no) === String(req.params.submissionNo));
                if (!line) throw createBizError('不存在', 404);
                db.biz.cold_chain_submission_warehouses = arr(db.biz.cold_chain_submission_warehouses).filter(w => Number(w.line_id) !== Number(line.id));
                let total = 0;
                warehouses.forEach((wh, i) => {
                    const qty = Math.max(0, toNum(wh.allocation_qty, 0));
                    total += qty;
                    db.biz.cold_chain_submission_warehouses.push({
                        id: nextId(db.biz.cold_chain_submission_warehouses), submission_no: req.params.submissionNo, line_id: line.id,
                        warehouse_code: wh.warehouse_code, warehouse_name: wh.warehouse_name, sku_code: line.sku_code,
                        allocation_qty: qty, allocation_ratio: total > 0 ? Number((qty / toNum(line.plan_value, 1)).toFixed(4)) : 0,
                        available_qty: toNum(wh.available_qty, 0), total_qty: toNum(wh.total_qty, 0),
                        transport_hours: toNum(wh.transport_hours, 0), is_emergency: Boolean(wh.is_emergency), sort_order: i + 1,
                        updated_by: operator, updated_time: nowIso()
                    });
                });
                line.total_allocated = total; line.shortage = Math.max(0, toNum(line.plan_value, 0) - total); line.status = line.shortage > 0 ? 0 : 1;
                line.updated_time = nowIso();
            });
            apiOk(res, req, null, '更新成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '更新失败'); }
    });

    app.post('/api/demand/cold-chain-submission/:submissionNo/toggle-emergency', authRequired, (req, res) => {
        try {
            const { line_id, is_emergency } = req.body || {};
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const line = arr(db.biz.cold_chain_submission_lines).find(l => Number(l.id) === Number(line_id));
                if (!line) throw createBizError('不存在', 404);
                line.is_emergency = Boolean(is_emergency); line.updated_time = nowIso();
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '不存在');
            apiOk(res, req, null, '已更新');
        } catch (e) { apiErr(res, req, 400, e.message); }
    });

    app.post('/api/demand/cold-chain-submission/:submissionNo/auto-allocate', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { ratios } = req.body || {};
            const result = updateDb((db) => {
                ensureStructures(db);
                const sub = arr(db.biz.cold_chain_submissions).find(s => String(s.submission_no) === String(req.params.submissionNo));
                if (!sub) throw createBizError('不存在', 404);
                if (sub.status === STATUS.DISPATCHED) throw createBizError('已下发不可重新分配');
                const r = autoAllocateAll(db, req.params.submissionNo, arr(ratios || sub.ratios || [70, 30]).map(n => toNum(n, 0)));
                sub.status = (r.noStock + r.shortfall === 0) ? STATUS.ALLOCATED : STATUS.DRAFT;
                sub.updated_by = operator; sub.updated_time = nowIso();
                return r;
            });
            apiOk(res, req, result, '自动分配完成');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '自动分配失败'); }
    });

    app.post('/api/demand/cold-chain-submission/:submissionNo/confirm', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const warnings = [];
            updateDb((db) => {
                ensureStructures(db);
                const sub = arr(db.biz.cold_chain_submissions).find(s => String(s.submission_no) === String(req.params.submissionNo));
                if (!sub) throw createBizError('不存在', 404);
                const lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(req.params.submissionNo));
                lines.forEach(l => {
                    if (toNum(l.shortage, 0) > 0) warnings.push({ channel: l.lv2_channel_name, sku: `${l.sku_code} ${l.sku_name}`, week: l.plan_week, shortage: toNum(l.shortage, 0) });
                });
                sub.status = STATUS.CONFIRMED; sub.confirmed_by = operator; sub.confirmed_time = nowIso(); sub.updated_time = nowIso();
            });
            apiOk(res, req, { warnings }, warnings.length ? '确认成功，存在缺口' : '确认成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '确认失败'); }
    });

    app.post('/api/demand/cold-chain-submission/:submissionNo/dispatch', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const result = updateDb((db) => dispatchColdSubmission(db, req.params.submissionNo, operator));
            apiOk(res, req, result, '下发成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '下发失败'); }
    });

    app.get('/api/demand/cold-chain-submission/:submissionNo/export', authRequired, (req, res) => {
        try {
            const db = readDb(); ensureStructures(db);
            const out = exportWorkbook(db, req.params.submissionNo);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
            res.send(out.buffer);
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '导出失败'); }
    });

    app.delete('/api/demand/cold-chain-submission/:submissionNo', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => { ensureStructures(db); const s = db.biz.cold_chain_submissions.find(s => String(s.submission_no) === String(req.params.submissionNo)); if (s) { s.status = -1; s.updated_time = nowIso(); found = true; } });
            if (!found) return apiErr(res, req, 404, '不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });
};

module.exports = { ensureStructures, registerColdChainRoutes };
