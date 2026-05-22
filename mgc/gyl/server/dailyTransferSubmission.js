/**
 * 日分仓调拨需求提报 — 仓库主管每日操作
 *
 * 核心能力：
 * 1. 从周提报拆解为日计划（跳过非工作日 + 提前期 + 截单时间）
 * 2. 仓库主管按日查看/调整调拨量
 * 3. 确认后自动生成调拨单
 */

const XLSX = require('xlsx');
const { readDb, updateDb, nextId, nowIso, buildSequenceNo } = require('./localDb');
const { ensureChannelDemandPlanStructures } = require('./channelDemandPlan');
const { getCutoffTime, getLeadTime, isNonWorkday } = require('./freshnessRules');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
const normalize = (v) => String(v || '').trim();

const STATUS = { DRAFT: 0, CONFIRMED: 1, DISPATCHED: 2, DELETED: -1 };
const SOURCE_TYPES = { DEMAND_SUBMISSION: '常温提报', COLD_CHAIN: '低温提报' };

const createBizError = (msg, code = 400) => { const e = new Error(msg); e.statusCode = code; return e; };

const ensureStructures = (db) => {
    db.biz = db.biz || {};
    db.biz.daily_transfer_submissions = arr(db.biz.daily_transfer_submissions);
    db.biz.daily_transfer_lines = arr(db.biz.daily_transfer_lines);
    ensureChannelDemandPlanStructures(db);
};

const buildDailyNo = (db) => {
    return buildSequenceNo(db, { prefix: 'DT', metaKey: '_daily_seq', array: arr(db.biz.daily_transfer_submissions), field: 'daily_no' });
};

// ===== Week → Day Breakdown Algorithm =====

const weekToDateRange = (weekLabel) => {
    // Parse "2026W18" → [2026-05-04, 2026-05-10] (ISO week, Monday start)
    const m = String(weekLabel).match(/^(\d{4})W(\d{2})$/);
    if (!m) return [];
    const year = Number(m[1]), weekNum = Number(m[2]);
    // Simple: Jan 1 + (week-1)*7, adjust to Monday
    const jan1 = new Date(year, 0, 1);
    const daysOffset = (weekNum - 1) * 7;
    const d = new Date(jan1);
    d.setDate(jan1.getDate() + daysOffset);
    // Move to Monday
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const cur = new Date(monday);
        cur.setDate(monday.getDate() + i);
        dates.push(cur.toISOString().slice(0, 10));
    }
    return dates;
};

const getValidWorkdays = (db, dateRange, leadDays) => {
    // Filter: only workdays, and shift by leadDays (delivery must be earlier)
    const workdays = dateRange.filter(d => !isNonWorkday(db, d));
    if (workdays.length === 0) return [];
    // Apply lead time: the last leadDays workdays are removed (too late for delivery)
    return workdays.slice(0, Math.max(1, workdays.length - leadDays));
};

const breakWeekToDaily = (db, allocation, cutOffTime) => {
    const { week, total_qty, lead_days } = allocation;
    const dateRange = weekToDateRange(week);
    if (dateRange.length === 0) return [];

    const workdays = getValidWorkdays(db, dateRange, lead_days);
    if (workdays.length === 0) return [];

    // Evenly distribute: each workday gets total_qty / workdays.length
    const baseQty = Math.floor(total_qty / workdays.length);
    const remainder = total_qty - baseQty * workdays.length;

    // Check cutoff: if current time > cutoff, the first day is skipped
    const now = new Date();
    const [cutH, cutM] = (cutOffTime || '16:00').split(':').map(Number);
    const cutoffToday = now.getHours() > cutH || (now.getHours() === cutH && now.getMinutes() >= cutM);
    const effectiveWorkdays = cutoffToday ? workdays.slice(1) : workdays;
    if (effectiveWorkdays.length === 0) return [];

    return effectiveWorkdays.map((date, i) => ({
        date,
        qty: baseQty + (i < remainder ? 1 : 0)
    })).filter(d => d.qty > 0);
};

// ===== Load allocations from source submissions =====

const loadWeeklyAllocations = (db, sourceType, sourceSubmissionNo) => {
    if (sourceType === 'DEMAND_SUBMISSION') {
        const lines = arr(db.biz.channel_demand_submission_lines).filter(l => String(l.submission_no) === String(sourceSubmissionNo));
        const warehouses = arr(db.biz.channel_demand_submission_warehouses).filter(w => String(w.submission_no) === String(sourceSubmissionNo));
        return lines.map(line => {
            const allocs = warehouses.filter(w => Number(w.line_id) === Number(line.id));
            return allocs.map(a => ({
                week: line.plan_week,
                warehouse_code: a.warehouse_code,
                warehouse_name: a.warehouse_name,
                sku_code: line.sku_code,
                sku_name: line.sku_name,
                channel_code: line.lv2_channel_code,
                channel_name: line.lv2_channel_name,
                total_qty: toNum(a.allocation_qty, 0),
                lead_days: 0, // will be calculated below
                temperature_zone: 0,
                freshness_allocation_preview: []
            }));
        }).flat().filter(a => a.total_qty > 0);
    }
    if (sourceType === 'COLD_CHAIN') {
        const lines = arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(sourceSubmissionNo));
        const warehouses = arr(db.biz.cold_chain_submission_warehouses).filter(w => String(w.submission_no) === String(sourceSubmissionNo));
        return lines.map(line => {
            const allocs = warehouses.filter(w => Number(w.line_id) === Number(line.id));
            return allocs.map(a => ({
                week: line.plan_week,
                warehouse_code: a.warehouse_code,
                warehouse_name: a.warehouse_name,
                sku_code: line.sku_code,
                sku_name: line.sku_name,
                channel_code: line.lv2_channel_code,
                channel_name: line.lv2_channel_name,
                total_qty: toNum(a.allocation_qty, 0),
                lead_days: 0,
                temperature_zone: 2, // cold chain
                freshness_allocation_preview: (() => {
                    try { return line.freshness_allocation_preview ? JSON.parse(line.freshness_allocation_preview) : []; } catch { return []; }
                })()
            }));
        }).flat().filter(a => a.total_qty > 0);
    }
    return [];
};

const calcLeadDays = (db, warehouseCode, channelCode) => {
    const { getWarehouseChannelScope } = require('./freshnessRules');
    const scope = getWarehouseChannelScope(db, warehouseCode, channelCode);
    if (scope === 0) return getLeadTime(db, 'INTRA_PROVINCE') || 1;
    if (scope === 1) return getLeadTime(db, 'INTER_PROVINCE') || 2;
    return getLeadTime(db, 'INTER_PROVINCE') || 3;
};

const generateDailyLines = (db, sourceType, sourceSubmissionNo) => {
    const allocations = loadWeeklyAllocations(db, sourceType, sourceSubmissionNo);
    if (allocations.length === 0) throw createBizError('???????????????');

    const cutOff = getCutoffTime(db);
    const dailyLines = [];

    allocations.forEach(alloc => {
        const leadDays = calcLeadDays(db, alloc.warehouse_code, alloc.channel_code);
        const previewRows = arr(alloc.freshness_allocation_preview);
        const dayPlan = breakWeekToDaily(db, { ...alloc, lead_days: leadDays }, cutOff);
        dayPlan.forEach(dp => {
            dailyLines.push({
                warehouse_code: alloc.warehouse_code,
                warehouse_name: alloc.warehouse_name,
                sku_code: alloc.sku_code,
                sku_name: alloc.sku_name,
                channel_code: alloc.channel_code,
                channel_name: alloc.channel_name,
                week: alloc.week,
                date: dp.date,
                allocated_qty: dp.qty,
                adjusted_qty: dp.qty,
                is_adjusted: false,
                lead_days: leadDays,
                temperature_zone: alloc.temperature_zone,
                transfer_no: '',
                freshness_allocation_preview: previewRows,
                freshness_allocation_preview: previewRows
            });
        });
    });

    return dailyLines;
};

// ===== Dispatch =====

const dispatchDaily = (db, dailyNo, operator) => {
    ensureStructures(db);
    db.biz.transfer_orders = arr(db.biz.transfer_orders);
    db.biz.transfer_tracks = arr(db.biz.transfer_tracks);
    db.biz.inventory_locks = arr(db.biz.inventory_locks);
    db.biz.inventory_ledger = arr(db.biz.inventory_ledger);

    const sub = arr(db.biz.daily_transfer_submissions).find(s => String(s.daily_no) === String(dailyNo));
    if (!sub) throw createBizError('不存在', 404);
    if (sub.status !== STATUS.CONFIRMED) throw createBizError('仅已确认可下发', 400);

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    db.meta = db.meta || {}; db.meta._transfer_seq = db.meta._transfer_seq || {};
    const trKey = `TR${today}`;
    if (!db.meta._transfer_seq[trKey]) {
        const maxSeq = arr(db.biz.transfer_orders)
            .filter(r => String(r.transfer_no || '').startsWith(trKey))
            .reduce((max, r) => Math.max(max, toNum(String(r.transfer_no || '').slice(-4), 0)), 0);
        db.meta._transfer_seq[trKey] = maxSeq + 1;
    }

    const lines = arr(db.biz.daily_transfer_lines).filter(l => String(l.daily_no) === String(dailyNo));
    const transfers = [];

    // Group by warehouse+SKU+date to merge into single transfer orders
    const grouped = new Map();
    lines.forEach(l => {
        if (toNum(l.adjusted_qty, 0) <= 0) return;
        const key = `${l.warehouse_code}::${l.sku_code}::${l.date}`;
        if (!grouped.has(key)) grouped.set(key, { ...l, merged_qty: 0, channels: [] });
        const g = grouped.get(key);
        g.merged_qty += toNum(l.adjusted_qty, 0);
        g.channels.push(`${l.channel_name}(${toNum(l.adjusted_qty, 0)})`);
    });

    grouped.forEach((g) => {
        const seq = db.meta._transfer_seq[trKey]++;
        const transferNo = `${trKey}${String(seq).padStart(4, '0')}`;
        db.biz.transfer_orders.push({
            id: nextId(db.biz.transfer_orders), transfer_no: transferNo,
            source_daily_no: dailyNo, source_type: 'DAILY_TRANSFER',
            from_warehouse_code: g.warehouse_code, from_warehouse_name: g.warehouse_name,
            to_channel_code: g.channel_code, to_channel_name: g.channel_name,
            sku_code: g.sku_code, sku_name: g.sku_name,
            plan_week: g.week, quantity: g.merged_qty,
            status: 'DRAFT', note: `日分仓 ${dailyNo} 自动生成 (${g.date})`,
            created_by: operator, created_time: nowIso(), updated_time: nowIso()
        });
        db.biz.transfer_tracks.push({
            id: nextId(db.biz.transfer_tracks), transfer_no: transferNo,
            action: 'CREATED', action_by: operator, action_time: nowIso(),
            note: `日分仓调拨自动下发 ${g.date}`
        });
        db.biz.inventory_locks.push({
            id: nextId(db.biz.inventory_locks),
            warehouse_code: g.warehouse_code, warehouse_name: g.warehouse_name,
            sku_code: g.sku_code, sku_name: g.sku_name,
            lock_qty: g.merged_qty, lock_type: 'DAILY_DISPATCH',
            lock_ref: dailyNo, lock_ref_type: 'daily_transfer',
            transfer_no: transferNo, created_by: operator,
            created_time: nowIso(), updated_time: nowIso(), status: 'ACTIVE'
        });
        // Mark lines with transfer_no
        lines.filter(l => l.warehouse_code === g.warehouse_code && l.sku_code === g.sku_code && l.date === g.date)
            .forEach(l => { l.transfer_no = transferNo; });
        transfers.push({ transfer_no: transferNo });
    });

    sub.status = STATUS.DISPATCHED; sub.updated_time = nowIso();
    return { transferCount: transfers.length };
};

// ===== Export =====

const exportDaily = (db, dailyNo) => {
    ensureStructures(db);
    const sub = arr(db.biz.daily_transfer_submissions).find(s => String(s.daily_no) === String(dailyNo));
    if (!sub) throw createBizError('不存在', 404);
    const lines = arr(db.biz.daily_transfer_lines).filter(l => String(l.daily_no) === String(dailyNo));
    // Pivot: date × warehouse×SKU
    const data = lines.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.warehouse_code).localeCompare(String(b.warehouse_code)));
    const rows = data.map(l => ({
        '日期': l.date, '仓库': l.warehouse_name, 'SKU编码': l.sku_code, 'SKU名称': l.sku_name,
        '渠道': l.channel_name, '周': l.week, '原始分配量': l.allocated_qty, '调整后': l.adjusted_qty,
        '是否调整': l.is_adjusted ? '是' : '否', '提前天数': l.lead_days, '温层': l.temperature_zone === 2 ? '低温' : '常温',
        '调拨单号': l.transfer_no || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '日调拨计划');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { filename: `日分仓调拨_${dailyNo}.xlsx`, buffer: buf };
};

// ===== Route Registration =====

const registerDailyTransferRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {

    // List source submissions (confirmed demand or cold chain)
    app.get('/api/daily-transfer/sources', authRequired, (req, res) => {
        try {
            const db = readDb();
            const sources = [];
            arr(db.biz.channel_demand_submissions).filter(s => Number(s.status) === 2 || Number(s.status) === 3).forEach(s => {
                const p = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(s.plan_code));
                sources.push({ type: 'DEMAND_SUBMISSION', submission_no: s.submission_no, plan_name: p?.plan_name || '', version_label: s.version_label || '', status: s.status, line_count: arr(db.biz.channel_demand_submission_lines).filter(l => String(l.submission_no) === String(s.submission_no)).length });
            });
            arr(db.biz.cold_chain_submissions).filter(s => Number(s.status) === 2 || Number(s.status) === 3).forEach(s => {
                const p = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(s.plan_code));
                sources.push({ type: 'COLD_CHAIN', submission_no: s.submission_no, plan_name: p?.plan_name || '', version_label: s.version_label || '', status: s.status, line_count: arr(db.biz.cold_chain_submission_lines).filter(l => String(l.submission_no) === String(s.submission_no)).length });
            });
            apiOk(res, req, sources, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    // List daily submissions
    app.get('/api/daily-transfer', authRequired, (req, res) => {
        try {
            const db = readDb(); ensureStructures(db);
            const { page = 1, pageSize = 10, keyword = '', status = '', warehouse = '' } = req.query || {};
            let rows = arr(db.biz.daily_transfer_submissions).filter(s => Number(s.status) !== -1);
            if (String(keyword)) { const kw = String(keyword).toLowerCase(); rows = rows.filter(s => String(s.daily_no || '').toLowerCase().includes(kw) || String(s.source_submission_no || '').toLowerCase().includes(kw)); }
            if (String(status)) rows = rows.filter(s => Number(s.status) === Number(status));
            if (String(warehouse)) {
                const dailyNos = new Set(arr(db.biz.daily_transfer_lines).filter(l => String(l.warehouse_code) === String(warehouse)).map(l => l.daily_no));
                rows = rows.filter(s => dailyNos.has(s.daily_no));
            }
            rows.sort((a, b) => (b.id || 0) - (a.id || 0));
            const { list, total } = paginate(rows, page, pageSize);
            const enriched = list.map(s => {
                const lines = arr(db.biz.daily_transfer_lines).filter(l => String(l.daily_no) === String(s.daily_no));
                const dates = [...new Set(lines.map(l => l.date))].sort();
                return { ...s, line_count: lines.length, date_count: dates.length, date_range: dates.length ? `${dates[0]} ~ ${dates[dates.length-1]}` : '' };
            });
            apiOk(res, req, { list: enriched, total }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    // Create daily submission from source
    app.post('/api/daily-transfer', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { source_type, source_submission_no } = req.body || {};
            if (!source_type || !source_submission_no) return apiErr(res, req, 400, '参数不全');
            const result = updateDb((db) => {
                ensureStructures(db);
                const existing = arr(db.biz.daily_transfer_submissions).find(s => String(s.source_submission_no) === String(source_submission_no) && s.source_type === source_type && Number(s.status) !== -1);
                if (existing) throw createBizError('该提报单已有日分仓计划', 409);

                const dailyNo = buildDailyNo(db);
                const dailyLines = generateDailyLines(db, source_type, source_submission_no);
                if (dailyLines.length === 0) throw createBizError('无可拆解的分配数据');

                const sub = {
                    id: nextId(db.biz.daily_transfer_submissions), daily_no: dailyNo,
                    source_type, source_submission_no,
                    status: STATUS.DRAFT, created_by: operator, created_time: nowIso(), updated_by: operator, updated_time: nowIso()
                };
                db.biz.daily_transfer_submissions.push(sub);
                dailyLines.forEach(l => {
                    db.biz.daily_transfer_lines.push({
                        id: nextId(db.biz.daily_transfer_lines), daily_no: dailyNo, ...l
                    });
                });
                return { daily_no: dailyNo, line_count: dailyLines.length };
            });
            apiOk(res, req, result, '创建成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '创建失败'); }
    });

    // Get daily detail with lines, grouped by date
    app.get('/api/daily-transfer/:dailyNo', authRequired, (req, res) => {
        try {
            const db = readDb(); ensureStructures(db);
            const sub = arr(db.biz.daily_transfer_submissions).find(s => String(s.daily_no) === String(req.params.dailyNo));
            if (!sub) return apiErr(res, req, 404, '不存在');
            const lines = arr(db.biz.daily_transfer_lines).filter(l => String(l.daily_no) === String(req.params.dailyNo));
            const dates = [...new Set(lines.map(l => l.date))].sort();
            const warehouses = [...new Set(lines.map(l => l.warehouse_code))].map(code => {
                const wl = lines.filter(l => l.warehouse_code === code);
                return { warehouse_code: code, warehouse_name: wl[0]?.warehouse_name || '', line_count: wl.length };
            });
            const skus = [...new Set(lines.map(l => l.sku_code))].map(code => ({ sku_code: code, sku_name: lines.find(l => l.sku_code === code)?.sku_name || '' }));
            apiOk(res, req, { submission: sub, lines, dates, warehouses, skus }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    // Get lines for a date
    app.get('/api/daily-transfer/:dailyNo/date/:date', authRequired, (req, res) => {
        try {
            const db = readDb(); ensureStructures(db);
            const lines = arr(db.biz.daily_transfer_lines).filter(l => String(l.daily_no) === String(req.params.dailyNo) && String(l.date) === String(req.params.date));
            lines.sort((a, b) => String(a.warehouse_code).localeCompare(String(b.warehouse_code)) || String(a.sku_code).localeCompare(String(b.sku_code)));
            // Temperature zone grouping
            const ambient = lines.filter(l => l.temperature_zone !== 2);
            const cold = lines.filter(l => l.temperature_zone === 2);
            apiOk(res, req, { lines, ambient_count: ambient.length, cold_count: cold.length, total_qty: lines.reduce((s, l) => s + toNum(l.adjusted_qty, 0), 0) }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    // Update a single line's adjusted quantity
    app.put('/api/daily-transfer/:dailyNo/lines/:lineId', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { adjusted_qty } = req.body || {};
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const line = arr(db.biz.daily_transfer_lines).find(l => Number(l.id) === Number(req.params.lineId) && String(l.daily_no) === String(req.params.dailyNo));
                if (!line) return;
                line.adjusted_qty = Math.max(0, toNum(adjusted_qty, 0));
                line.is_adjusted = line.adjusted_qty !== line.allocated_qty;
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '不存在');
            apiOk(res, req, null, '更新成功');
        } catch (e) { apiErr(res, req, 400, e.message); }
    });

    // Confirm
    app.post('/api/daily-transfer/:dailyNo/confirm', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureStructures(db);
                const sub = arr(db.biz.daily_transfer_submissions).find(s => String(s.daily_no) === String(req.params.dailyNo));
                if (!sub) return;
                sub.status = STATUS.CONFIRMED; sub.updated_time = nowIso();
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '不存在');
            apiOk(res, req, null, '确认成功');
        } catch (e) { apiErr(res, req, 400, e.message); }
    });

    // Dispatch
    app.post('/api/daily-transfer/:dailyNo/dispatch', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const result = updateDb((db) => dispatchDaily(db, req.params.dailyNo, operator));
            apiOk(res, req, result, '下发成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '下发失败'); }
    });

    // Export
    app.get('/api/daily-transfer/:dailyNo/export', authRequired, (req, res) => {
        try {
            const db = readDb(); ensureStructures(db);
            const out = exportDaily(db, req.params.dailyNo);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
            res.send(out.buffer);
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '导出失败'); }
    });

    // Delete
    app.delete('/api/daily-transfer/:dailyNo', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => { ensureStructures(db); const s = arr(db.biz.daily_transfer_submissions).find(s => String(s.daily_no) === String(req.params.dailyNo)); if (s) { s.status = -1; found = true; } });
            if (!found) return apiErr(res, req, 404, '不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });
};

module.exports = { registerDailyTransferRoutes };
