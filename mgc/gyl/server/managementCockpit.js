const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const REPORT_PERIOD_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY'];
const REPORT_STATUS = ['GENERATED', 'ARCHIVED'];
const ORDER_ALLOC_SUCCESS_STATUS = ['ALLOCATED', 'WAIT_OUTBOUND', 'OUTBOUND', 'IN_TRANSIT', 'SIGNED', 'CLOSED'];
const ORDER_FULFILL_SUCCESS_STATUS = ['SIGNED', 'CLOSED'];

const arr = (v) => (Array.isArray(v) ? v : []);
const normalize = (v) => String(v || '').trim();
const toNum = (v, fb = 0) => {
    const n = Number(v);
    return Number.isNaN(n) ? fb : n;
};
const round2 = (n) => Number(toNum(n, 0).toFixed(2));
const contains = (src, key) => String(src || '').toLowerCase().includes(String(key || '').trim().toLowerCase());
const dateText = (v) => String(v || '').slice(0, 10);
const toPercent = (numerator, denominator) => (denominator ? round2((toNum(numerator, 0) / toNum(denominator, 0)) * 100) : 0);

const getTime = (...values) => {
    for (let i = 0; i < values.length; i += 1) {
        const t = new Date(values[i] || 0).getTime();
        if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
};

const byLatest = (rows, fields = ['updated_at', 'created_at']) => [...arr(rows)].sort((a, b) => {
    const ta = getTime(...fields.map((f) => a?.[f]));
    const tb = getTime(...fields.map((f) => b?.[f]));
    return tb - ta;
});

const orderPath = (orderNo) => {
    const no = normalize(orderNo);
    return no ? `/intelligent-closed-loop?orderNo=${encodeURIComponent(no)}` : '';
};
const transferPath = (transferNo) => {
    const no = normalize(transferNo);
    return no ? `/inventory-ops?transferNo=${encodeURIComponent(no)}` : '';
};
const mdmRequestPath = (requestNo) => {
    const no = normalize(requestNo);
    return no ? `/mdm/governance?requestNo=${encodeURIComponent(no)}` : '';
};

const getWeekLabel = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const yearStart = new Date(monday.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((monday - yearStart) / 86400000) + 1) / 7);
    return `${monday.getFullYear()}-W${String(weekNo).padStart(2, '0')} (${monday.toISOString().slice(0, 10)}~${sunday.toISOString().slice(0, 10)})`;
};

const getPeriodLabel = (periodType, now = new Date()) => {
    if (periodType === 'MONTHLY') return now.toISOString().slice(0, 7);
    if (periodType === 'WEEKLY') return getWeekLabel(now);
    return now.toISOString().slice(0, 10);
};

const ensureStructures = (db) => {
    db.biz = db.biz || {};
    db.master = db.master || {};
    db.platform = db.platform || {};

    db.biz.order_headers = arr(db.biz.order_headers);
    db.biz.order_lines = arr(db.biz.order_lines);
    db.biz.order_exceptions = arr(db.biz.order_exceptions);
    db.biz.inventory_ledger = arr(db.biz.inventory_ledger);
    db.biz.inventory_transactions = arr(db.biz.inventory_transactions);
    db.biz.inventory_warnings = arr(db.biz.inventory_warnings);
    db.biz.transfer_orders = arr(db.biz.transfer_orders);
    db.biz.channel_dealer_authorizations = arr(db.biz.channel_dealer_authorizations);

    db.master.sku = arr(db.master.sku);
    db.master.reseller = arr(db.master.reseller);
    db.master.warehouse = arr(db.master.warehouse);
    db.master.channel = arr(db.master.channel);
    db.master.org = arr(db.master.org);
    db.master.reseller_relation = arr(db.master.reseller_relation);
    db.master.rltn_warehouse_sku = arr(db.master.rltn_warehouse_sku);

    db.platform.mdm_change_requests = arr(db.platform.mdm_change_requests);
    db.platform.mdm_quality_issues = arr(db.platform.mdm_quality_issues);
    db.platform.mdm_conflicts = arr(db.platform.mdm_conflicts);
    db.platform.management_reports = arr(db.platform.management_reports);
};

const buildOrderAnalysis = (db) => {
    const headers = byLatest(db.biz.order_headers, ['created_at', 'updated_at']);
    const totalOrders = headers.length;
    const regionMap = new Map();
    const channelMap = new Map();

    headers.forEach((row) => {
        const region = normalize(row.region) || '未分区';
        const channel = normalize(row.channel_name || row.channel_code) || '未分渠道';
        const orderNo = normalize(row.order_no);

        const r = regionMap.get(region) || { region, order_count: 0, total_qty: 0, total_amount: 0, sample_order_no: '' };
        r.order_count += 1;
        r.total_qty += toNum(row.total_qty, 0);
        r.total_amount += toNum(row.total_amount, 0);
        if (!r.sample_order_no && orderNo) r.sample_order_no = orderNo;
        regionMap.set(region, r);

        const c = channelMap.get(channel) || { channel, order_count: 0, total_qty: 0, total_amount: 0, sample_order_no: '' };
        c.order_count += 1;
        c.total_qty += toNum(row.total_qty, 0);
        c.total_amount += toNum(row.total_amount, 0);
        if (!c.sample_order_no && orderNo) c.sample_order_no = orderNo;
        channelMap.set(channel, c);
    });

    const reviewedRows = headers.filter((row) => ['PASSED', 'REJECTED'].includes(String(row.review_status)));
    const passCount = reviewedRows.filter((row) => String(row.review_status) === 'PASSED').length;
    const allocatedCount = headers.filter((row) => ORDER_ALLOC_SUCCESS_STATUS.includes(String(row.fulfillment_status))).length;
    const fulfilledCount = headers.filter((row) => ORDER_FULFILL_SUCCESS_STATUS.includes(String(row.fulfillment_status)) || String(row.order_status) === 'CLOSED').length;
    const exceptionOrderCount = headers.filter((row) => Number(row.has_exception) === 1 || String(row.fulfillment_status) === 'ABNORMAL').length;

    return {
        totals: {
            order_count: totalOrders,
            total_amount: round2(headers.reduce((sum, row) => sum + toNum(row.total_amount, 0), 0)),
            total_qty: round2(headers.reduce((sum, row) => sum + toNum(row.total_qty, 0), 0))
        },
        by_region: [...regionMap.values()].map((row) => ({ ...row, total_qty: round2(row.total_qty), total_amount: round2(row.total_amount), share_rate: toPercent(row.order_count, totalOrders), link_path: orderPath(row.sample_order_no) })).sort((a, b) => b.order_count - a.order_count),
        by_channel: [...channelMap.values()].map((row) => ({ ...row, total_qty: round2(row.total_qty), total_amount: round2(row.total_amount), share_rate: toPercent(row.order_count, totalOrders), link_path: orderPath(row.sample_order_no) })).sort((a, b) => b.order_count - a.order_count),
        review_pass_rate: toPercent(passCount, reviewedRows.length),
        allocation_success_rate: toPercent(allocatedCount, totalOrders),
        fulfillment_rate: toPercent(fulfilledCount, totalOrders),
        exception_order_count: exceptionOrderCount,
        exception_order_ratio: toPercent(exceptionOrderCount, totalOrders),
        recent_documents: headers.filter((row) => normalize(row.order_no)).slice(0, 20).map((row) => ({ order_no: normalize(row.order_no), customer_name: normalize(row.customer_name || row.reseller_name), order_status: normalize(row.order_status), fulfillment_status: normalize(row.fulfillment_status), total_amount: round2(row.total_amount), total_qty: round2(row.total_qty), created_at: row.created_at || row.updated_at || '', link_path: orderPath(row.order_no) }))
    };
};

const buildInventoryAnalysis = (db) => {
    const ledgerRows = arr(db.biz.inventory_ledger);
    const warningRows = arr(db.biz.inventory_warnings);
    const txRows = arr(db.biz.inventory_transactions);
    const transferRows = byLatest(db.biz.transfer_orders, ['updated_at', 'created_at']);

    const latestByWarehouse = new Map();
    const latestByStatus = new Map();
    transferRows.forEach((row) => {
        const transferNo = normalize(row.transfer_no);
        const outWh = normalize(row.out_warehouse_name || row.out_warehouse_code);
        const inWh = normalize(row.in_warehouse_name || row.in_warehouse_code);
        const status = normalize(row.status || 'DRAFT');
        if (outWh && !latestByWarehouse.has(outWh) && transferNo) latestByWarehouse.set(outWh, transferNo);
        if (inWh && !latestByWarehouse.has(inWh) && transferNo) latestByWarehouse.set(inWh, transferNo);
        if (status && !latestByStatus.has(status) && transferNo) latestByStatus.set(status, transferNo);
    });

    const totalQty = ledgerRows.reduce((sum, row) => sum + toNum(row.total_qty, 0), 0);
    const availableQty = ledgerRows.reduce((sum, row) => sum + toNum(row.available_qty, 0), 0);
    const nearExpiryQty = ledgerRows.filter((row) => Number(row.near_expiry_flag) === 1 || toNum(row.remaining_days, 99999) <= 7).reduce((sum, row) => sum + toNum(row.total_qty, 0), 0);
    const stockoutSkuCount = new Set(ledgerRows.filter((row) => toNum(row.available_qty, 0) <= 0).map((row) => String(row.sku_code || '')).filter(Boolean)).size;

    const days30Ago = Date.now() - 30 * 86400000;
    const outboundQty30 = txRows.filter((row) => ['OUTBOUND', 'TRANSFER_OUT'].includes(String(row.tx_type))).filter((row) => getTime(row.biz_time, row.created_at, row.updated_at) >= days30Ago).reduce((sum, row) => sum + Math.abs(toNum(row.qty, 0)), 0);
    const turnoverDays = outboundQty30 > 0 ? round2(availableQty / (outboundQty30 / 30)) : 0;

    const whMap = new Map();
    ledgerRows.forEach((row) => {
        const key = normalize(row.warehouse_name || row.warehouse_code) || '未识别仓库';
        const base = whMap.get(key) || { warehouse: key, total_qty: 0, available_qty: 0, safety_qty: 0, near_expiry_qty: 0, stockout_sku_count: 0, sample_transfer_no: latestByWarehouse.get(key) || '' };
        base.total_qty += toNum(row.total_qty, 0);
        base.available_qty += toNum(row.available_qty, 0);
        base.safety_qty += toNum(row.safety_qty, 0);
        if (Number(row.near_expiry_flag) === 1 || toNum(row.remaining_days, 99999) <= 7) base.near_expiry_qty += toNum(row.total_qty, 0);
        if (toNum(row.available_qty, 0) <= 0) base.stockout_sku_count += 1;
        whMap.set(key, base);
    });

    return {
        summary: { total_qty: round2(totalQty), available_qty: round2(availableQty), near_expiry_qty: round2(nearExpiryQty), turnover_days: turnoverDays, near_expiry_ratio: toPercent(nearExpiryQty, totalQty), stockout_sku_count: stockoutSkuCount, open_warning_count: warningRows.filter((row) => String(row.status) !== 'CLOSED').length },
        warehouse_load: [...whMap.values()].map((row) => ({ ...row, total_qty: round2(row.total_qty), available_qty: round2(row.available_qty), safety_qty: round2(row.safety_qty), near_expiry_qty: round2(row.near_expiry_qty), load_rate: row.safety_qty > 0 ? round2((row.total_qty / row.safety_qty) * 100) : 0, link_path: transferPath(row.sample_transfer_no) })).sort((a, b) => b.total_qty - a.total_qty),
        warning_summary: ['OPEN', 'PROCESSING', 'CLOSED'].map((status) => ({ status, count: warningRows.filter((row) => String(row.status) === status).length })),
        transfer_summary: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'OUTBOUND', 'DONE', 'CANCELED'].map((status) => ({ status, count: transferRows.filter((row) => String(row.status) === status).length, sample_transfer_no: latestByStatus.get(status) || '', link_path: transferPath(latestByStatus.get(status) || '') })),
        recent_transfer_documents: transferRows.filter((row) => normalize(row.transfer_no)).slice(0, 20).map((row) => ({ transfer_no: normalize(row.transfer_no), status: normalize(row.status), out_warehouse_name: normalize(row.out_warehouse_name || row.out_warehouse_code), in_warehouse_name: normalize(row.in_warehouse_name || row.in_warehouse_code), sku_name: normalize(row.sku_name || row.sku_code), qty: round2(row.qty), updated_at: row.updated_at || row.created_at || '', link_path: transferPath(row.transfer_no) }))
    };
};

const buildChannelAnalysis = (db) => {
    const orderRows = byLatest(db.biz.order_headers, ['created_at', 'updated_at']);
    const authRows = arr(db.biz.channel_dealer_authorizations);
    const totalOrders = orderRows.length;
    const today = dateText(nowIso());

    const channelMap = new Map();
    const regionMap = new Map();
    const dealerMap = new Map();

    orderRows.forEach((row) => {
        const channel = normalize(row.channel_name || row.channel_code) || '未分渠道';
        const region = normalize(row.region) || '未分区';
        const dealerCode = normalize(row.customer_code || row.reseller_code);
        const dealerName = normalize(row.customer_name || row.reseller_name) || dealerCode || '未识别经销商';
        const dealerKey = `${dealerCode}|${dealerName}`;
        const orderNo = normalize(row.order_no);

        const ch = channelMap.get(channel) || { channel, order_count: 0, total_amount: 0, total_qty: 0, sample_order_no: '' };
        ch.order_count += 1; ch.total_amount += toNum(row.total_amount, 0); ch.total_qty += toNum(row.total_qty, 0); if (!ch.sample_order_no && orderNo) ch.sample_order_no = orderNo; channelMap.set(channel, ch);
        const rg = regionMap.get(region) || { region, order_count: 0, total_amount: 0, total_qty: 0, sample_order_no: '' };
        rg.order_count += 1; rg.total_amount += toNum(row.total_amount, 0); rg.total_qty += toNum(row.total_qty, 0); if (!rg.sample_order_no && orderNo) rg.sample_order_no = orderNo; regionMap.set(region, rg);
        const dl = dealerMap.get(dealerKey) || { reseller_code: dealerCode, reseller_name: dealerName, order_count: 0, total_amount: 0, total_qty: 0, sample_order_no: '' };
        dl.order_count += 1; dl.total_amount += toNum(row.total_amount, 0); dl.total_qty += toNum(row.total_qty, 0); if (!dl.sample_order_no && orderNo) dl.sample_order_no = orderNo; dealerMap.set(dealerKey, dl);
    });

    const activeAuthRows = authRows.filter((row) => {
        if (String(row.status) !== 'ACTIVE') return false;
        const begin = dateText(row.begin_date || '');
        const end = dateText(row.end_date || '');
        if (begin && begin > today) return false;
        if (end && end < today) return false;
        return true;
    });
    const expiredAuthRows = authRows.filter((row) => String(row.status) === 'EXPIRED' || (dateText(row.end_date || '') && dateText(row.end_date || '') < today));
    const activeResellerSet = new Set(activeAuthRows.map((row) => normalize(row.reseller_code)).filter(Boolean));
    const coveredOrderCount = orderRows.filter((row) => activeResellerSet.has(normalize(row.customer_code || row.reseller_code))).length;

    return {
        channel_structure: [...channelMap.values()].map((row) => ({ ...row, total_amount: round2(row.total_amount), total_qty: round2(row.total_qty), share_rate: toPercent(row.order_count, totalOrders), link_path: orderPath(row.sample_order_no) })).sort((a, b) => b.order_count - a.order_count),
        dealer_ranking: [...dealerMap.values()].map((row) => ({ ...row, total_amount: round2(row.total_amount), total_qty: round2(row.total_qty), link_path: orderPath(row.sample_order_no) })).sort((a, b) => b.total_amount - a.total_amount).slice(0, 12),
        region_performance: [...regionMap.values()].map((row) => ({ ...row, total_amount: round2(row.total_amount), total_qty: round2(row.total_qty), link_path: orderPath(row.sample_order_no) })).sort((a, b) => b.total_amount - a.total_amount),
        authorization_execution: { active_authorization_count: activeAuthRows.length, expired_authorization_count: expiredAuthRows.length, covered_order_count: coveredOrderCount, total_order_count: totalOrders, execution_rate: toPercent(coveredOrderCount, totalOrders) },
        recent_order_documents: orderRows.filter((row) => normalize(row.order_no)).slice(0, 20).map((row) => ({ order_no: normalize(row.order_no), reseller_name: normalize(row.customer_name || row.reseller_name), channel_name: normalize(row.channel_name || row.channel_code), region: normalize(row.region), total_amount: round2(row.total_amount), total_qty: round2(row.total_qty), created_at: row.created_at || row.updated_at || '', link_path: orderPath(row.order_no) }))
    };
};

const buildMdmQualityAnalysis = (db) => {
    const changeRequests = byLatest(db.platform.mdm_change_requests, ['updated_at', 'created_at']);
    const qualityIssues = arr(db.platform.mdm_quality_issues);
    const conflicts = arr(db.platform.mdm_conflicts);
    const openIssues = qualityIssues.filter((row) => String(row.status) !== 'RESOLVED');
    const unresolvedConflicts = conflicts.filter((row) => String(row.status) !== 'RESOLVED');

    const governedCount = arr(db.master.sku).length + arr(db.master.reseller).length + arr(db.master.warehouse).length + arr(db.master.channel).length + arr(db.master.org).length;

    const today = new Date(dateText(nowIso()));
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const expiringSoonCount = [...arr(db.master.reseller_relation), ...arr(db.master.rltn_warehouse_sku)].filter((row) => Number(row.status ?? 1) !== 0).filter((row) => {
        const end = new Date(dateText(row.end_date || ''));
        return Number.isFinite(end.getTime()) && end >= today && end <= in30Days;
    }).length;

    const requestStatusList = ['DRAFT', 'PENDING', 'REJECTED', 'EFFECTIVE'];
    const requestStatus = requestStatusList.map((status) => {
        const sample = changeRequests.find((row) => String(row.status) === status);
        const requestNo = normalize(sample?.request_no);
        return { status, count: changeRequests.filter((row) => String(row.status) === status).length, sample_request_no: requestNo, link_path: mdmRequestPath(requestNo) };
    });

    return {
        data_error_rate: toPercent(openIssues.length, governedCount),
        conflict_count: unresolvedConflicts.length,
        expiring_soon_count: expiringSoonCount,
        approval_backlog_count: changeRequests.filter((row) => String(row.status) === 'PENDING').length,
        issue_by_severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((severity) => ({ severity, count: openIssues.filter((row) => String(row.severity || '').toUpperCase() === severity).length })),
        request_status: requestStatus,
        pending_request_documents: changeRequests.filter((row) => normalize(row.request_no)).slice(0, 20).map((row) => ({ request_no: normalize(row.request_no), object_type: normalize(row.object_type), action: normalize(row.action), status: normalize(row.status), target_code: normalize(row.target_code), updated_at: row.updated_at || row.created_at || '', link_path: mdmRequestPath(row.request_no) }))
    };
};

const buildOverview = (db) => {
    const order = buildOrderAnalysis(db);
    const inventory = buildInventoryAnalysis(db);
    const channel = buildChannelAnalysis(db);
    const mdm = buildMdmQualityAnalysis(db);

    const availableRate = toPercent(inventory.summary.available_qty, inventory.summary.total_qty);
    const nearExpiryPenalty = toNum(inventory.summary.near_expiry_ratio, 0);
    const stockoutPenalty = Math.min(15, toNum(inventory.summary.stockout_sku_count, 0) * 1.2);
    const inventoryHealthScore = Math.min(100, Math.max(0, round2((availableRate * 0.7) + ((100 - nearExpiryPenalty) * 0.3) - stockoutPenalty)));

    return {
        order_scale: order.totals,
        fulfillment_rate: order.fulfillment_rate,
        inventory_health_score: inventoryHealthScore,
        exception_count: toNum(order.exception_order_count, 0) + toNum(inventory.summary.open_warning_count, 0) + toNum(mdm.conflict_count, 0),
        channel_contribution: channel.channel_structure.slice(0, 8),
        region_performance: channel.region_performance.slice(0, 8)
    };
};

const pickReportRow = (row) => ({ id: toNum(row.id, 0), report_no: row.report_no || '', period_type: row.period_type || 'DAILY', period_label: row.period_label || '', status: row.status || 'GENERATED', generated_at: row.generated_at || '', generated_by: row.generated_by || '', archived_at: row.archived_at || '', archived_by: row.archived_by || '', file_name: row.file_name || '' });

const buildReportNo = (periodType, rows) => {
    const prefixMap = { DAILY: 'DR', WEEKLY: 'WR', MONTHLY: 'MR' };
    const prefix = prefixMap[periodType] || 'DR';
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const maxSeq = arr(rows).map((row) => String(row.report_no || '')).filter((code) => code.startsWith(`${prefix}${datePart}`)).reduce((max, code) => Math.max(max, toNum(code.slice(-4), 0)), 0);
    return `${prefix}${datePart}${String(maxSeq + 1).padStart(4, '0')}`;
};

const buildReportSnapshot = (db) => ({ overview: buildOverview(db), order_analysis: buildOrderAnalysis(db), inventory_analysis: buildInventoryAnalysis(db), channel_analysis: buildChannelAnalysis(db), mdm_quality: buildMdmQualityAnalysis(db) });

const createReportRow = (db, periodType, operatorName) => {
    const label = getPeriodLabel(periodType);
    const report = { id: nextId(db.platform.management_reports), report_no: buildReportNo(periodType, db.platform.management_reports), period_type: periodType, period_label: label, status: 'GENERATED', generated_at: nowIso(), generated_by: operatorName, archived_at: '', archived_by: '', file_name: `management-cockpit-${periodType}-${label}.json`, snapshot: buildReportSnapshot(db) };
    db.platform.management_reports.push(report);
    return report;
};

const createBatchReportRows = (db, periodTypes, operatorName) => {
    const normalized = [...new Set(arr(periodTypes).map((v) => String(v || '').toUpperCase()))].filter((v) => REPORT_PERIOD_TYPES.includes(v));
    const finalTypes = normalized.length ? normalized : [...REPORT_PERIOD_TYPES];
    return finalTypes.map((periodType) => createReportRow(db, periodType, operatorName));
};

const ensureSeedReports = (db, operatorName = 'system') => {
    if (arr(db.platform.management_reports).length) return;
    REPORT_PERIOD_TYPES.forEach((periodType) => createReportRow(db, periodType, operatorName));
};

const serializeReportCsv = (report) => {
    const snapshot = report?.snapshot || {};
    const lines = [];
    lines.push(`Report No,${report.report_no || ''}`);
    lines.push(`Period Type,${report.period_type || ''}`);
    lines.push(`Period Label,${report.period_label || ''}`);
    lines.push(`Generated At,${report.generated_at || ''}`);
    lines.push('');

    const overview = snapshot.overview || {};
    lines.push('Overview');
    lines.push('Metric,Value');
    lines.push(`Order Count,${toNum(overview.order_scale?.order_count, 0)}`);
    lines.push(`Order Qty,${round2(overview.order_scale?.total_qty)}`);
    lines.push(`Order Amount,${round2(overview.order_scale?.total_amount)}`);
    lines.push(`Fulfillment Rate,${round2(overview.fulfillment_rate)}%`);
    lines.push(`Inventory Health Score,${round2(overview.inventory_health_score)}`);
    lines.push(`Exception Count,${toNum(overview.exception_count, 0)}`);

    return lines.join('\n');
};

const getOperatorName = (req) => req?.user?.nickname || req?.user?.username || 'system';

const registerManagementCockpitRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {
    app.get('/api/management-cockpit/options', authRequired, (req, res) => {
        updateDb((db) => { ensureStructures(db); ensureSeedReports(db, getOperatorName(req)); });
        apiOk(res, req, { report_period_types: REPORT_PERIOD_TYPES, report_status: REPORT_STATUS }, '获取成功');
    });

    app.get('/api/management-cockpit/overview', authRequired, (req, res) => { const db = readDb(); ensureStructures(db); apiOk(res, req, buildOverview(db), '获取成功'); });
    app.get('/api/management-cockpit/order-analysis', authRequired, (req, res) => { const db = readDb(); ensureStructures(db); apiOk(res, req, buildOrderAnalysis(db), '获取成功'); });
    app.get('/api/management-cockpit/inventory-analysis', authRequired, (req, res) => { const db = readDb(); ensureStructures(db); apiOk(res, req, buildInventoryAnalysis(db), '获取成功'); });
    app.get('/api/management-cockpit/channel-analysis', authRequired, (req, res) => { const db = readDb(); ensureStructures(db); apiOk(res, req, buildChannelAnalysis(db), '获取成功'); });
    app.get('/api/management-cockpit/mdm-quality', authRequired, (req, res) => { const db = readDb(); ensureStructures(db); apiOk(res, req, buildMdmQualityAnalysis(db), '获取成功'); });

    app.get('/api/management-cockpit/reports', authRequired, (req, res) => {
        updateDb((db) => { ensureStructures(db); ensureSeedReports(db, getOperatorName(req)); });
        const { page = 1, pageSize = 20, periodType = '', status = '', keyword = '' } = req.query || {};
        const db = readDb();
        ensureStructures(db);

        let rows = arr(db.platform.management_reports).map((row) => pickReportRow(row));
        if (periodType) rows = rows.filter((row) => String(row.period_type) === String(periodType).toUpperCase());
        if (status) rows = rows.filter((row) => String(row.status) === String(status).toUpperCase());
        if (keyword) rows = rows.filter((row) => contains(row.report_no, keyword) || contains(row.period_label, keyword) || contains(row.generated_by, keyword));
        rows = rows.sort((a, b) => String(b.generated_at || '').localeCompare(String(a.generated_at || '')));

        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.post('/api/management-cockpit/reports/generate', authRequired, (req, res) => {
        const periodType = String(req.body?.periodType || '').toUpperCase();
        if (!REPORT_PERIOD_TYPES.includes(periodType)) return apiErr(res, req, 400, `periodType 仅支持 ${REPORT_PERIOD_TYPES.join('/')}`);
        let created = null;
        updateDb((db) => { ensureStructures(db); created = createReportRow(db, periodType, getOperatorName(req)); });
        apiOk(res, req, pickReportRow(created), '生成成功');
    });

    app.post('/api/management-cockpit/reports/generate-batch', authRequired, (req, res) => {
        let createdRows = [];
        updateDb((db) => { ensureStructures(db); createdRows = createBatchReportRows(db, arr(req.body?.periodTypes), getOperatorName(req)); });
        apiOk(res, req, { period_types: [...new Set(createdRows.map((row) => row.period_type))], total: createdRows.length, list: createdRows.map((row) => pickReportRow(row)) }, '批量生成成功');
    });

    app.get('/api/management-cockpit/reports/:id/snapshot', authRequired, (req, res) => {
        updateDb((db) => { ensureStructures(db); ensureSeedReports(db, getOperatorName(req)); });
        const db = readDb();
        ensureStructures(db);
        const row = arr(db.platform.management_reports).find((item) => Number(item.id) === toNum(req.params.id, 0));
        if (!row) return apiErr(res, req, 404, '报表不存在');
        apiOk(res, req, row.snapshot || {}, '获取成功');
    });

    app.get('/api/management-cockpit/reports/:id/export', authRequired, (req, res) => {
        updateDb((db) => { ensureStructures(db); ensureSeedReports(db, getOperatorName(req)); });
        const db = readDb();
        ensureStructures(db);
        const row = arr(db.platform.management_reports).find((item) => Number(item.id) === toNum(req.params.id, 0));
        if (!row) return apiErr(res, req, 404, '报表不存在');
        apiOk(res, req, { report: pickReportRow(row), file_name: `${row.report_no || 'report'}.csv`, content: serializeReportCsv(row) }, '导出成功');
    });

    app.post('/api/management-cockpit/reports/:id/archive', authRequired, (req, res) => {
        let out = null;
        updateDb((db) => {
            ensureStructures(db);
            ensureSeedReports(db, getOperatorName(req));
            const row = arr(db.platform.management_reports).find((item) => Number(item.id) === toNum(req.params.id, 0));
            if (!row) return;
            row.status = 'ARCHIVED';
            row.archived_at = nowIso();
            row.archived_by = getOperatorName(req);
            out = pickReportRow(row);
        });
        if (!out) return apiErr(res, req, 404, '报表不存在');
        apiOk(res, req, out, '留档成功');
    });
};

module.exports = { registerManagementCockpitRoutes };
