const XLSX = require('xlsx');
const { readDb, updateDb, nextId, nowIso } = require('./localDb');
const { ensureChannelDemandPlanStructures } = require('./channelDemandPlan');

const SUBMISSION_STATUS = {
    DRAFT: 0,
    ALLOCATED: 1,
    CONFIRMED: 2,
    DISPATCHED: 3,
    DELETED: -1
};

const arr = (value) => (Array.isArray(value) ? value : []);
const normalize = (value) => String(value || '').trim();
const toNum = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isNaN(num) ? fallback : num;
};

const createBizError = (message, statusCode = 400, details = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.details = details;
    return error;
};

const ensureSubmissionStructures = (db) => {
    db.biz = db.biz || {};
    db.master = db.master || {};

    db.biz.channel_demand_submissions = arr(db.biz.channel_demand_submissions);
    db.biz.channel_demand_submission_lines = arr(db.biz.channel_demand_submission_lines);
    db.biz.channel_demand_submission_warehouses = arr(db.biz.channel_demand_submission_warehouses);

    // also ensure demand plan structures exist (we depend on them)
    ensureChannelDemandPlanStructures(db);
};

const buildSubmissionNo = (db) => {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // O(1) counter stored in db.meta — avoids full array scan on every call
    db.meta = db.meta || {};
    db.meta._submission_seq = db.meta._submission_seq || {};
    const key = `CDS${datePart}`;
    if (!db.meta._submission_seq[key]) {
        const maxSeq = arr(db.biz.channel_demand_submissions)
            .filter((row) => String(row.submission_no || '').startsWith(key))
            .reduce((max, row) => Math.max(max, toNum(String(row.submission_no || '').slice(-4), 0)), 0);
        db.meta._submission_seq[key] = maxSeq + 1;
    }
    const seq = db.meta._submission_seq[key]++;
    return `${key}${String(seq).padStart(4, '0')}`;
};

// ===== Warehouse matching helpers =====

const getChannelProvince = (db, channelCode) => {
    const channel = arr(db.master.channel).find(
        (c) => String(c.channel_code) === String(channelCode)
    );
    return normalize(channel?.province_name || channel?.province || '');
};

const getWarehouseProvince = (db, warehouseCode) => {
    const wh = arr(db.master.warehouse).find(
        (w) => String(w.warehouse_code) === String(warehouseCode)
    );
    return normalize(wh?.province_name || wh?.province || '');
};

/**
 * Calculate warehouse priority for a given channel:
 * 0 = same province (best), 1 = neighbor province (good), 99 = others
 * Neighbor logic uses a simple adjacency map for common Chinese provinces.
 */
const NEIGHBOR_MAP = {
    '浙江': ['江苏', '上海', '安徽', '福建', '江西'],
    '江苏': ['浙江', '上海', '安徽', '山东'],
    '上海': ['浙江', '江苏'],
    '安徽': ['浙江', '江苏', '河南', '湖北', '江西'],
    '福建': ['浙江', '江西', '广东'],
    '江西': ['浙江', '福建', '广东', '湖南', '湖北', '安徽'],
    '山东': ['江苏', '河南', '河北'],
    '河南': ['山东', '安徽', '湖北', '陕西', '山西', '河北'],
    '湖北': ['河南', '安徽', '江西', '湖南', '重庆', '陕西'],
    '湖南': ['湖北', '江西', '广东', '广西', '贵州', '重庆'],
    '广东': ['福建', '江西', '湖南', '广西'],
    '广西': ['广东', '湖南', '贵州', '云南'],
    '四川': ['重庆', '贵州', '云南', '陕西', '甘肃', '青海', '西藏'],
    '重庆': ['四川', '湖北', '湖南', '贵州'],
    '贵州': ['四川', '重庆', '湖南', '广西', '云南'],
    '云南': ['四川', '贵州', '广西'],
    '北京': ['天津', '河北'],
    '天津': ['北京', '河北'],
    '河北': ['北京', '天津', '山东', '河南', '山西', '辽宁'],
    '辽宁': ['河北', '吉林'],
    '吉林': ['辽宁'],
    '黑龙江': ['内蒙古'],
    '内蒙古': ['黑龙江', '吉林', '辽宁', '河北', '山西', '陕西', '宁夏', '甘肃'],
    '山西': ['河北', '河南', '陕西', '内蒙古'],
    '陕西': ['山西', '河南', '湖北', '甘肃', '四川', '宁夏', '内蒙古'],
    '甘肃': ['陕西', '青海', '新疆', '宁夏', '内蒙古', '四川'],
    '青海': ['甘肃', '四川', '西藏', '新疆'],
    '宁夏': ['陕西', '甘肃', '内蒙古'],
    '新疆': ['甘肃', '青海', '西藏'],
    '西藏': ['四川', '青海', '新疆', '云南'],
    '海南': ['广东'],
    '香港': ['广东'],
    '澳门': ['广东'],
    '台湾': ['福建']
};

const calcWarehousePriority = (db, warehouseCode, channelCode) => {
    const chProv = getChannelProvince(db, channelCode);
    const whProv = getWarehouseProvince(db, warehouseCode);

    if (!chProv || !whProv) return 50; // unknown => medium priority
    if (chProv === whProv) return 0;   // same province
    const neighbors = NEIGHBOR_MAP[chProv] || [];
    if (neighbors.includes(whProv)) return 1; // neighbor province
    return 99; // far away
};

/**
 * Get available SKU stock grouped by warehouse, sorted by priority then available_qty desc.
 */
const getSkuWarehouseStock = (db, skuCode, channelCode) => {
    const ledgerRows = arr(db.biz.inventory_ledger).filter(
        (r) => String(r.sku_code) === String(skuCode) && toNum(r.available_qty, 0) > 0
    );

    // Aggregate by warehouse
    const whMap = {};
    ledgerRows.forEach((row) => {
        const key = row.warehouse_code;
        if (!whMap[key]) {
            whMap[key] = {
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                available_qty: 0,
                total_qty: 0,
                locked_qty: 0,
                in_transit_qty: 0
            };
        }
        whMap[key].available_qty += toNum(row.available_qty, 0);
        whMap[key].total_qty += toNum(row.total_qty, 0);
        whMap[key].locked_qty += toNum(row.locked_qty, 0);
        whMap[key].in_transit_qty += toNum(row.in_transit_qty, 0);
    });

    const warehouseList = Object.values(whMap).map((wh) => ({
        ...wh,
        priority: calcWarehousePriority(db, wh.warehouse_code, channelCode)
    }));

    // Sort: priority ASC, then available_qty DESC
    warehouseList.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.available_qty - a.available_qty;
    });

    return warehouseList;
};

// ===== Core allocation logic =====

const autoAllocateLine = (db, line, warehouseCount, ratios) => {
    const { sku_code, lv2_channel_code, plan_value } = line;
    const targetQty = toNum(plan_value, 0);
    if (targetQty <= 0) return [];

    // Get available warehouse stock for this SKU
    const warehouses = getSkuWarehouseStock(db, sku_code, lv2_channel_code);

    // Take top N warehouses (up to warehouseCount)
    const selected = warehouses.slice(0, Math.max(1, warehouseCount));

    if (selected.length === 0) return [];

    // Normalize ratios to match selected count
    const effectiveRatios = ratios.slice(0, selected.length);
    // Pad with 0 for any ratio slots beyond user-specified ratios
    while (effectiveRatios.length < selected.length) {
        effectiveRatios.push(0);
    }
    const ratioSum = effectiveRatios.reduce((s, r) => s + r, 0);
    const normalizedRatios = ratioSum > 0
        ? effectiveRatios.map((r) => r / ratioSum)
        : selected.map(() => 1 / selected.length);

    // Allocate
    const allocations = selected.map((wh, i) => {
        const target = Math.round(targetQty * normalizedRatios[i]);
        const actual = Math.min(target, wh.available_qty);
        return {
            warehouse_code: wh.warehouse_code,
            warehouse_name: wh.warehouse_name,
            sku_code,
            allocation_qty: actual,
            allocation_ratio: Number(normalizedRatios[i].toFixed(4)),
            available_qty: wh.available_qty,
            total_qty: wh.total_qty,
            is_primary: i === 0,
            sort_order: i + 1
        };
    });

    return allocations;
};

const autoAllocateAllLines = (db, submissionNo, warehouseCount, ratios) => {
    ensureSubmissionStructures(db);

    const lines = arr(db.biz.channel_demand_submission_lines).filter(
        (l) => String(l.submission_no) === String(submissionNo)
    );

    const results = { allocated: 0, shortfall: 0, noStock: 0 };

    lines.forEach((line) => {
        const allocations = autoAllocateLine(db, line, warehouseCount, ratios);

        // Remove old allocations for this line
        db.biz.channel_demand_submission_warehouses = arr(db.biz.channel_demand_submission_warehouses).filter(
            (w) => Number(w.line_id) !== Number(line.id)
        );

        const totalAllocated = allocations.reduce((s, a) => s + a.allocation_qty, 0);
        const shortage = Math.max(0, toNum(line.plan_value, 0) - totalAllocated);

        // Insert new allocations
        allocations.forEach((alloc) => {
            db.biz.channel_demand_submission_warehouses.push({
                id: nextId(arr(db.biz.channel_demand_submission_warehouses)),
                submission_no: submissionNo,
                line_id: line.id,
                ...alloc,
                updated_by: '',
                updated_time: nowIso()
            });
        });

        line.total_allocated = totalAllocated;
        line.shortage = shortage;
        line.status = shortage > 0 ? 0 : 1; // 0=未足额, 1=足额
        line.updated_time = nowIso();

        if (allocations.length === 0) results.noStock++;
        else if (shortage > 0) results.shortfall++;
        else results.allocated++;
    });

    return results;
};

// ===== Dispatch: create transfer orders and lock inventory =====

const dispatchSubmission = (db, submissionNo, operator) => {
    ensureSubmissionStructures(db);

    // Initialize inventory arrays that are owned by inventoryOps but used here
    db.biz.transfer_orders = arr(db.biz.transfer_orders);
    db.biz.transfer_tracks = arr(db.biz.transfer_tracks);
    db.biz.inventory_locks = arr(db.biz.inventory_locks);
    db.biz.inventory_ledger = arr(db.biz.inventory_ledger);

    const submission = arr(db.biz.channel_demand_submissions).find(
        (s) => String(s.submission_no) === String(submissionNo)
    );
    if (!submission) throw createBizError('提报单不存在', 404);
    if (submission.status !== SUBMISSION_STATUS.CONFIRMED) {
        throw createBizError('仅已确认的提报单可下发', 400);
    }

    const lines = arr(db.biz.channel_demand_submission_lines).filter(
        (l) => String(l.submission_no) === String(submissionNo)
    );

    const transferOrders = [];
    const lockRecords = [];
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Seed transfer counter once before all loops
    db.meta = db.meta || {};
    db.meta._transfer_seq = db.meta._transfer_seq || {};
    const trKey = `TR${today}`;
    if (!db.meta._transfer_seq[trKey]) {
        const maxSeq = arr(db.biz.transfer_orders)
            .filter((row) => String(row.transfer_no || '').startsWith(trKey))
            .reduce((max, row) => Math.max(max, toNum(String(row.transfer_no || '').slice(-4), 0)), 0);
        db.meta._transfer_seq[trKey] = maxSeq + 1;
    }

    lines.forEach((line) => {
        const allocations = arr(db.biz.channel_demand_submission_warehouses).filter(
            (w) => Number(w.line_id) === Number(line.id)
        );

        allocations.forEach((alloc) => {
            if (toNum(alloc.allocation_qty, 0) <= 0) return;

            // O(1) counter lookup — no array scan per allocation
            const seq = db.meta._transfer_seq[trKey]++;
            const transferNo = `${trKey}${String(seq).padStart(4, '0')}`;

            const transfer = {
                id: nextId(arr(db.biz.transfer_orders)),
                transfer_no: transferNo,
                source_submission_no: submissionNo,
                from_warehouse_code: alloc.warehouse_code,
                from_warehouse_name: alloc.warehouse_name,
                to_channel_code: line.lv2_channel_code,
                to_channel_name: line.lv2_channel_name,
                sku_code: line.sku_code,
                sku_name: line.sku_name,
                plan_week: line.plan_week,
                quantity: alloc.allocation_qty,
                status: 'DRAFT',
                created_by: operator,
                created_time: nowIso(),
                updated_time: nowIso(),
                note: `渠道需求提报 ${submissionNo} 自动生成`
            };
            db.biz.transfer_orders.push(transfer);
            transferOrders.push(transfer);

            // Create transfer track
            db.biz.transfer_tracks = arr(db.biz.transfer_tracks);
            db.biz.transfer_tracks.push({
                id: nextId(arr(db.biz.transfer_tracks)),
                transfer_no: transferNo,
                action: 'CREATED',
                action_by: operator,
                action_time: nowIso(),
                note: '渠道需求提报自动下发'
            });

            // Lock inventory
            const lock = {
                id: nextId(arr(db.biz.inventory_locks)),
                warehouse_code: alloc.warehouse_code,
                warehouse_name: alloc.warehouse_name,
                sku_code: line.sku_code,
                sku_name: line.sku_name,
                lock_qty: alloc.allocation_qty,
                lock_type: 'SUBMISSION_DISPATCH',
                lock_ref: submissionNo,
                lock_ref_type: 'channel_demand_submission',
                transfer_no: transferNo,
                created_by: operator,
                created_time: nowIso(),
                updated_time: nowIso(),
                status: 'ACTIVE'
            };
            db.biz.inventory_locks = arr(db.biz.inventory_locks);
            db.biz.inventory_locks.push(lock);
            lockRecords.push(lock);

            // Deduct available_qty from ledger (select rows FIFO by expiry)
            let remaining = alloc.allocation_qty;
            const ledgerRows = arr(db.biz.inventory_ledger)
                .filter((r) => String(r.warehouse_code) === String(alloc.warehouse_code)
                    && String(r.sku_code) === String(line.sku_code)
                    && toNum(r.available_qty, 0) > 0)
                .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
            ledgerRows.forEach((lr) => {
                if (remaining <= 0) return;
                const deduct = Math.min(remaining, toNum(lr.available_qty, 0));
                lr.available_qty = Math.max(0, toNum(lr.available_qty, 0) - deduct);
                lr.locked_qty = toNum(lr.locked_qty, 0) + deduct;
                lr.updated_at = nowIso();
                remaining -= deduct;
            });
        });
    });

    submission.status = SUBMISSION_STATUS.DISPATCHED;
    submission.updated_time = nowIso();

    return { transferOrders, lockRecords };
};

// ===== Export helper =====

const exportSubmissionWorkbook = (db, submissionNo) => {
    ensureSubmissionStructures(db);

    const submission = arr(db.biz.channel_demand_submissions).find(
        (s) => String(s.submission_no) === String(submissionNo)
    );
    if (!submission) throw createBizError('提报单不存在', 404);

    const lines = arr(db.biz.channel_demand_submission_lines).filter(
        (l) => String(l.submission_no) === String(submissionNo)
    );

    const data = lines.map((line) => {
        const allocs = arr(db.biz.channel_demand_submission_warehouses)
            .filter((w) => Number(w.line_id) === Number(line.id))
            .sort((a, b) => toNum(a.sort_order, 0) - toNum(b.sort_order, 0));

        const row = {
            '渠道': line.lv2_channel_name,
            'SKU编码': line.sku_code,
            'SKU名称': line.sku_name,
            '品类': line.category_name,
            '需求周': line.plan_week,
            '周起始': line.week_start_date,
            '周结束': line.week_end_date,
            '计划需求量': toNum(line.plan_value, 0),
            '已分配总量': toNum(line.total_allocated, 0),
            '缺口': toNum(line.shortage, 0)
        };

        allocs.forEach((alloc, i) => {
            row[`仓库${i + 1}-编码`] = alloc.warehouse_code;
            row[`仓库${i + 1}-名称`] = alloc.warehouse_name;
            row[`仓库${i + 1}-分配量`] = toNum(alloc.allocation_qty, 0);
            row[`仓库${i + 1}-比例`] = `${Number(toNum(alloc.allocation_ratio, 0) * 100).toFixed(1)}%`;
        });

        return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '发货指引');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return {
        filename: `渠道需求提报_${submissionNo}_发货指引.xlsx`,
        buffer
    };
};

// ===== Route registration =====

const registerChannelDemandSubmissionRoutes = ({
    app,
    authRequired,
    apiOk,
    apiErr,
    paginate,
    appendOperationLog
}) => {
    // List confirmed demand plan versions (for creating submissions)
    app.get('/api/demand/channel-submission/confirmed-versions', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureChannelDemandPlanStructures(db);

            const confirmedVersions = arr(db.biz.channel_demand_plan_versions)
                .filter((v) => Number(v.status) === 3)
                .map((v) => {
                    const plan = arr(db.biz.channel_demand_plans).find(
                        (p) => String(p.plan_code) === String(v.plan_code)
                    );
                    return {
                        plan_code: v.plan_code,
                        plan_name: plan?.plan_name || '',
                        version_code: v.version_code,
                        version_label: v.version_label,
                        begin_week: v.begin_week,
                        end_week: v.end_week,
                        week_count: v.week_count,
                        confirmed_time: v.confirmed_time
                    };
                });

            apiOk(res, req, confirmedVersions, '获取已确认版本成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 500, error.message || '获取已确认版本失败');
        }
    });

    // List submissions
    app.get('/api/demand/channel-submission', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSubmissionStructures(db);

            const { page = 1, pageSize = 10, keyword = '', status = '' } = req.query || {};
            let rows = arr(db.biz.channel_demand_submissions)
                .filter((s) => Number(s.status) !== SUBMISSION_STATUS.DELETED);

            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                rows = rows.filter((s) =>
                    String(s.submission_no || '').toLowerCase().includes(kw) ||
                    String(s.plan_code || '').toLowerCase().includes(kw) ||
                    String(s.version_code || '').toLowerCase().includes(kw)
                );
            }

            if (String(status).trim() !== '') {
                rows = rows.filter((s) => Number(s.status) === Number(status));
            }

            // Attach plan/version info
            const enriched = rows.map((s) => {
                const plan = arr(db.biz.channel_demand_plans).find(
                    (p) => String(p.plan_code) === String(s.plan_code)
                );
                const version = arr(db.biz.channel_demand_plan_versions).find(
                    (v) => String(v.version_code) === String(s.version_code)
                );
                const lineCount = arr(db.biz.channel_demand_submission_lines)
                    .filter((l) => String(l.submission_no) === String(s.submission_no)).length;
                const fulfilledCount = arr(db.biz.channel_demand_submission_lines)
                    .filter((l) => String(l.submission_no) === String(s.submission_no) && Number(l.status) === 1).length;

                return {
                    ...s,
                    plan_name: plan?.plan_name || '',
                    version_label: version?.version_label || '',
                    begin_week: version?.begin_week || '',
                    end_week: version?.end_week || '',
                    line_count: lineCount,
                    fulfilled_count: fulfilledCount
                };
            });

            const { list, total } = paginate(enriched, page, pageSize);
            apiOk(res, req, { list, total }, '获取提报单列表成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 500, error.message || '获取提报单列表失败');
        }
    });

    // Create submission
    app.post('/api/demand/channel-submission', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { version_code, warehouse_count = 2, ratios = [0.7, 0.3] } = req.body || {};

            if (!version_code) throw createBizError('请选择已确认的需求计划版本');

            // Validate ratios sum
            const ratioSum = arr(ratios).reduce((s, r) => s + toNum(r, 0), 0);
            if (ratioSum <= 0 || ratioSum > 1.01) {
                throw createBizError('分配比例之和需在 (0, 1.0] 范围内');
            }

            const result = updateDb((db) => {
                ensureSubmissionStructures(db);

                // Find confirmed version
                const version = arr(db.biz.channel_demand_plan_versions).find(
                    (v) => String(v.version_code) === String(version_code)
                );
                if (!version) throw createBizError('版本不存在', 404);
                if (Number(version.status) !== 3) throw createBizError('仅已确认的版本可创建提报');

                const plan = arr(db.biz.channel_demand_plans).find(
                    (p) => String(p.plan_code) === String(version.plan_code)
                );

                // Check for existing submission for this version
                const existing = arr(db.biz.channel_demand_submissions).find(
                    (s) => String(s.version_code) === String(version_code)
                        && Number(s.status) !== SUBMISSION_STATUS.DELETED
                );
                if (existing) throw createBizError('该版本已创建提报单，请勿重复创建', 409);

                // Get plan data rows
                const planData = arr(db.biz.channel_demand_plan_data).filter(
                    (d) => String(d.version_code) === String(version_code)
                );

                if (planData.length === 0) throw createBizError('该版本无需求数据');

                // Create submission
                const submissionNo = buildSubmissionNo(db);
                const submission = {
                    id: nextId(arr(db.biz.channel_demand_submissions)),
                    submission_no: submissionNo,
                    plan_code: version.plan_code,
                    version_code,
                    plan_name: plan?.plan_name || '',
                    version_label: version.version_label || '',
                    warehouse_count: Number(warehouse_count),
                    ratios: arr(ratios).map((r) => toNum(r, 0)),
                    status: SUBMISSION_STATUS.DRAFT,
                    created_by: operator,
                    created_time: nowIso(),
                    updated_by: operator,
                    updated_time: nowIso(),
                    confirmed_by: '',
                    confirmed_time: ''
                };
                db.biz.channel_demand_submissions.push(submission);

                // Create lines from plan data
                const existingLines = arr(db.biz.channel_demand_submission_lines);
                planData.forEach((pd) => {
                    existingLines.push({
                        id: nextId(existingLines),
                        submission_no: submissionNo,
                        lv2_channel_code: pd.lv2_channel_code,
                        lv2_channel_name: pd.lv2_channel_name,
                        sku_code: pd.sku_code,
                        sku_name: pd.sku_name,
                        category_code: pd.lv3_category_code || pd.category_code || '',
                        category_name: pd.lv3_category_name || pd.category_name || '',
                        plan_week: pd.plan_week,
                        week_start_date: pd.week_start_date,
                        week_end_date: pd.week_end_date,
                        plan_value: toNum(pd.plan_value, 0),
                        total_allocated: 0,
                        shortage: toNum(pd.plan_value, 0),
                        status: 0,
                        updated_by: '',
                        updated_time: nowIso()
                    });
                });

                // Auto-allocate
                const allocResult = autoAllocateAllLines(db, submissionNo, Number(warehouse_count), arr(ratios).map((r) => toNum(r, 0)));

                if (allocResult.noStock + allocResult.shortfall === 0) {
                    submission.status = SUBMISSION_STATUS.ALLOCATED;
                }

                return { submission, allocResult };
            });

            if (appendOperationLog) {
                appendOperationLog(req, {
                    logType: 'BUSINESS',
                    moduleCode: 'channel-demand-submission',
                    bizObjectType: 'submission',
                    bizObjectId: result.submission.submission_no,
                    action: 'CREATE',
                    detail: `创建渠道需求提报单，版本: ${version_code}，分配行数: ${result.allocResult.allocated + result.allocResult.shortfall + result.allocResult.noStock}`
                });
            }

            apiOk(res, req, result, '创建提报单成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '创建提报单失败', { details: error.details || null });
        }
    });

    // Get submission detail
    app.get('/api/demand/channel-submission/:submissionNo', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSubmissionStructures(db);

            const submission = arr(db.biz.channel_demand_submissions).find(
                (s) => String(s.submission_no) === String(req.params.submissionNo)
            );
            if (!submission) throw createBizError('提报单不存在', 404);

            const plan = arr(db.biz.channel_demand_plans).find(
                (p) => String(p.plan_code) === String(submission.plan_code)
            );
            const version = arr(db.biz.channel_demand_plan_versions).find(
                (v) => String(v.version_code) === String(submission.version_code)
            );

            const lineCount = arr(db.biz.channel_demand_submission_lines)
                .filter((l) => String(l.submission_no) === String(submission.submission_no)).length;
            const fulfilledCount = arr(db.biz.channel_demand_submission_lines)
                .filter((l) => String(l.submission_no) === String(submission.submission_no) && Number(l.status) === 1).length;

            apiOk(res, req, {
                ...submission,
                plan_name: plan?.plan_name || '',
                version_label: version?.version_label || '',
                begin_week: version?.begin_week || '',
                end_week: version?.end_week || '',
                line_count: lineCount,
                fulfilled_count: fulfilledCount
            }, '获取提报单详情成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 500, error.message || '获取提报单详情失败');
        }
    });

    // Update submission basic info
    app.put('/api/demand/channel-submission/:submissionNo', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { warehouse_count, ratios } = req.body || {};

            updateDb((db) => {
                ensureSubmissionStructures(db);

                const submission = arr(db.biz.channel_demand_submissions).find(
                    (s) => String(s.submission_no) === String(req.params.submissionNo)
                );
                if (!submission) throw createBizError('提报单不存在', 404);
                if (submission.status !== SUBMISSION_STATUS.DRAFT
                    && submission.status !== SUBMISSION_STATUS.ALLOCATED) {
                    throw createBizError('仅草稿或已分配状态可修改');
                }

                if (warehouse_count !== undefined) submission.warehouse_count = Number(warehouse_count);
                if (ratios !== undefined) {
                    const sum = arr(ratios).reduce((s, r) => s + toNum(r, 0), 0);
                    if (sum <= 0 || sum > 1.01) throw createBizError('分配比例之和需在 (0, 1.0] 范围内');
                    submission.ratios = arr(ratios).map((r) => toNum(r, 0));
                }
                submission.updated_by = operator;
                submission.updated_time = nowIso();
            });

            apiOk(res, req, null, '更新提报单成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '更新提报单失败');
        }
    });

    // Delete submission (soft delete)
    app.delete('/api/demand/channel-submission/:submissionNo', authRequired, (req, res) => {
        try {
            updateDb((db) => {
                ensureSubmissionStructures(db);

                const submission = arr(db.biz.channel_demand_submissions).find(
                    (s) => String(s.submission_no) === String(req.params.submissionNo)
                );
                if (!submission) throw createBizError('提报单不存在', 404);
                if (submission.status === SUBMISSION_STATUS.DISPATCHED) {
                    throw createBizError('已下发的提报单不可删除');
                }

                submission.status = SUBMISSION_STATUS.DELETED;
                submission.updated_time = nowIso();
            });

            apiOk(res, req, null, '删除提报单成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '删除提报单失败');
        }
    });

    // Get allocation lines (paginated)
    app.get('/api/demand/channel-submission/:submissionNo/lines', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSubmissionStructures(db);

            const submission = arr(db.biz.channel_demand_submissions).find(
                (s) => String(s.submission_no) === String(req.params.submissionNo)
            );
            if (!submission) throw createBizError('提报单不存在', 404);

            const { page = 1, pageSize = 20, keyword = '', channel = '', sku = '', week = '', shortage = '' } = req.query || {};
            let lines = arr(db.biz.channel_demand_submission_lines).filter(
                (l) => String(l.submission_no) === String(req.params.submissionNo)
            );

            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                lines = lines.filter((l) =>
                    String(l.sku_code || '').toLowerCase().includes(kw) ||
                    String(l.sku_name || '').toLowerCase().includes(kw) ||
                    String(l.lv2_channel_name || '').toLowerCase().includes(kw)
                );
            }

            if (String(channel).trim()) {
                lines = lines.filter((l) => String(l.lv2_channel_code) === String(channel));
            }
            if (String(sku).trim()) {
                lines = lines.filter((l) => String(l.sku_code) === String(sku));
            }
            if (String(week).trim()) {
                lines = lines.filter((l) => String(l.plan_week) === String(week));
            }
            if (String(shortage).trim() === '1') {
                lines = lines.filter((l) => toNum(l.shortage, 0) > 0);
            }

            const { list, total } = paginate(lines, page, pageSize);

            // Attach warehouse allocations for each line
            const enriched = list.map((line) => {
                const allocs = arr(db.biz.channel_demand_submission_warehouses)
                    .filter((w) => Number(w.line_id) === Number(line.id))
                    .sort((a, b) => toNum(a.sort_order, 0) - toNum(b.sort_order, 0));
                return { ...line, warehouses: allocs };
            });

            apiOk(res, req, { list: enriched, total, submission }, '获取分配明细成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 500, error.message || '获取分配明细失败');
        }
    });

    // Update a line's warehouse allocations manually
    app.put('/api/demand/channel-submission/:submissionNo/lines/:lineId', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { warehouses } = req.body || {};

            if (!Array.isArray(warehouses) || warehouses.length === 0) {
                throw createBizError('请提供仓库分配数据');
            }

            updateDb((db) => {
                ensureSubmissionStructures(db);

                const submission = arr(db.biz.channel_demand_submissions).find(
                    (s) => String(s.submission_no) === String(req.params.submissionNo)
                );
                if (!submission) throw createBizError('提报单不存在', 404);

                const line = arr(db.biz.channel_demand_submission_lines).find(
                    (l) => Number(l.id) === Number(req.params.lineId)
                        && String(l.submission_no) === String(req.params.submissionNo)
                );
                if (!line) throw createBizError('分配行不存在', 404);

                // Remove old allocations
                db.biz.channel_demand_submission_warehouses = arr(db.biz.channel_demand_submission_warehouses).filter(
                    (w) => Number(w.line_id) !== Number(line.id)
                );

                // Insert new allocations
                let totalAllocated = 0;
                warehouses.forEach((wh, i) => {
                    const qty = Math.max(0, toNum(wh.allocation_qty, 0));
                    totalAllocated += qty;

                    // Fetch latest stock snapshot
                    let availableQty = toNum(wh.available_qty, 0);
                    let totalQty = toNum(wh.total_qty, 0);
                    if (!wh.available_qty || !wh.total_qty) {
                        const stock = getSkuWarehouseStock(db, line.sku_code, line.lv2_channel_code);
                        const match = stock.find((s) => s.warehouse_code === wh.warehouse_code);
                        if (match) {
                            availableQty = match.available_qty;
                            totalQty = match.total_qty;
                        }
                    }

                    db.biz.channel_demand_submission_warehouses.push({
                        id: nextId(arr(db.biz.channel_demand_submission_warehouses)),
                        submission_no: req.params.submissionNo,
                        line_id: line.id,
                        warehouse_code: wh.warehouse_code,
                        warehouse_name: wh.warehouse_name,
                        sku_code: line.sku_code,
                        allocation_qty: qty,
                        allocation_ratio: totalAllocated > 0 ? Number((qty / toNum(line.plan_value, 1)).toFixed(4)) : 0,
                        available_qty: availableQty,
                        total_qty: totalQty,
                        is_primary: i === 0,
                        sort_order: i + 1,
                        updated_by: operator,
                        updated_time: nowIso()
                    });
                });

                line.total_allocated = totalAllocated;
                line.shortage = Math.max(0, toNum(line.plan_value, 0) - totalAllocated);
                line.status = line.shortage > 0 ? 0 : 1;
                line.updated_by = operator;
                line.updated_time = nowIso();

                // Update submission status
                const allLines = arr(db.biz.channel_demand_submission_lines).filter(
                    (l) => String(l.submission_no) === String(req.params.submissionNo)
                );
                const allFulfilled = allLines.every((l) => Number(l.status) === 1);
                submission.status = allFulfilled ? SUBMISSION_STATUS.ALLOCATED : SUBMISSION_STATUS.DRAFT;
                submission.updated_time = nowIso();
            });

            apiOk(res, req, null, '更新分配成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '更新分配失败');
        }
    });

    // Auto-allocate all lines
    app.post('/api/demand/channel-submission/:submissionNo/auto-allocate', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { warehouse_count, ratios } = req.body || {};

            const result = updateDb((db) => {
                ensureSubmissionStructures(db);

                const submission = arr(db.biz.channel_demand_submissions).find(
                    (s) => String(s.submission_no) === String(req.params.submissionNo)
                );
                if (!submission) throw createBizError('提报单不存在', 404);
                if (submission.status === SUBMISSION_STATUS.DISPATCHED) {
                    throw createBizError('已下发的提报单不可重新分配');
                }

                const wc = warehouse_count !== undefined ? Number(warehouse_count) : submission.warehouse_count;
                const rt = ratios !== undefined ? arr(ratios).map((r) => toNum(r, 0)) : submission.ratios;

                if (rt.length > 0) {
                    const sum = rt.reduce((s, r) => s + r, 0);
                    if (sum <= 0 || sum > 1.01) throw createBizError('分配比例之和需在 (0, 1.0] 范围内');
                }

                const allocResult = autoAllocateAllLines(db, req.params.submissionNo, wc, rt);

                // Update submission
                submission.warehouse_count = wc;
                submission.ratios = rt;
                submission.status = (allocResult.noStock + allocResult.shortfall === 0)
                    ? SUBMISSION_STATUS.ALLOCATED : SUBMISSION_STATUS.DRAFT;
                submission.updated_by = operator;
                submission.updated_time = nowIso();

                return allocResult;
            });

            if (appendOperationLog) {
                appendOperationLog(req, {
                    logType: 'BUSINESS',
                    moduleCode: 'channel-demand-submission',
                    bizObjectType: 'submission',
                    bizObjectId: req.params.submissionNo,
                    action: 'AUTO_ALLOCATE',
                    detail: `自动分配完成: 足额${result.allocated}行, 缺额${result.shortfall}行, 无库存${result.noStock}行`
                });
            }

            apiOk(res, req, result, '自动分配完成');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '自动分配失败');
        }
    });

    // Confirm submission
    app.post('/api/demand/channel-submission/:submissionNo/confirm', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const warnings = [];

            updateDb((db) => {
                ensureSubmissionStructures(db);

                const submission = arr(db.biz.channel_demand_submissions).find(
                    (s) => String(s.submission_no) === String(req.params.submissionNo)
                );
                if (!submission) throw createBizError('提报单不存在', 404);
                if (submission.status === SUBMISSION_STATUS.DISPATCHED) {
                    throw createBizError('已下发的提报单无需再次确认');
                }

                // Check for shortfall warnings
                const lines = arr(db.biz.channel_demand_submission_lines).filter(
                    (l) => String(l.submission_no) === String(req.params.submissionNo)
                );
                lines.forEach((line) => {
                    const shortage = toNum(line.shortage, 0);
                    if (shortage > 0) {
                        warnings.push({
                            channel: line.lv2_channel_name,
                            sku: `${line.sku_code} ${line.sku_name}`,
                            week: line.plan_week,
                            shortage,
                            message: `${line.lv2_channel_name} ${line.sku_name} ${line.plan_week} 仍有缺口 ${shortage} 件`
                        });
                    }
                });

                submission.status = SUBMISSION_STATUS.CONFIRMED;
                submission.confirmed_by = operator;
                submission.confirmed_time = nowIso();
                submission.updated_time = nowIso();
            });

            if (appendOperationLog) {
                appendOperationLog(req, {
                    logType: 'BUSINESS',
                    moduleCode: 'channel-demand-submission',
                    bizObjectType: 'submission',
                    bizObjectId: req.params.submissionNo,
                    action: 'CONFIRM',
                    detail: `确认提报单，警告数: ${warnings.length}`
                });
            }

            apiOk(res, req, { warnings }, warnings.length > 0 ? '确认成功，但存在库存缺口警告' : '确认成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '确认提报单失败');
        }
    });

    // Dispatch submission (create transfer orders + lock inventory)
    app.post('/api/demand/channel-submission/:submissionNo/dispatch', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';

            const result = updateDb((db) => {
                return dispatchSubmission(db, req.params.submissionNo, operator);
            });

            if (appendOperationLog) {
                appendOperationLog(req, {
                    logType: 'BUSINESS',
                    moduleCode: 'channel-demand-submission',
                    bizObjectType: 'submission',
                    bizObjectId: req.params.submissionNo,
                    action: 'DISPATCH',
                    detail: `下发提报单: 生成 ${result.transferOrders.length} 个调拨单, 锁定 ${result.lockRecords.length} 条库存`
                });
            }

            apiOk(res, req, {
                transferOrderCount: result.transferOrders.length,
                lockCount: result.lockRecords.length
            }, '下发成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '下发失败');
        }
    });

    // Export Excel
    app.get('/api/demand/channel-submission/:submissionNo/export', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSubmissionStructures(db);

            const out = exportSubmissionWorkbook(db, req.params.submissionNo);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
            res.send(out.buffer);
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '导出失败', { details: error.details || null });
        }
    });

    // Get warehouse stock for a specific SKU (for the stock panel)
    app.get('/api/demand/channel-submission/warehouse-stock/:skuCode', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSubmissionStructures(db);

            const { channel_code = '' } = req.query || {};
            const stock = getSkuWarehouseStock(db, req.params.skuCode, String(channel_code));

            apiOk(res, req, stock, '获取仓库库存成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 500, error.message || '获取仓库库存失败');
        }
    });

    // Get submission filter options
    app.get('/api/demand/channel-submission/options/:submissionNo', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSubmissionStructures(db);

            const lines = arr(db.biz.channel_demand_submission_lines).filter(
                (l) => String(l.submission_no) === String(req.params.submissionNo)
            );

            const channels = [...new Map(
                lines.map((l) => [l.lv2_channel_code, { channel_code: l.lv2_channel_code, channel_name: l.lv2_channel_name }])
            ).values()];

            const skus = [...new Map(
                lines.map((l) => [l.sku_code, { sku_code: l.sku_code, sku_name: l.sku_name }])
            ).values()];

            const weeks = [...new Set(lines.map((l) => l.plan_week))].sort();

            apiOk(res, req, { channels, skus, weeks }, '获取筛选选项成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 500, error.message || '获取筛选选项失败');
        }
    });

    // Batch lookup submissions by version codes (for demand plan page cross-reference)
    app.get('/api/demand/channel-submission/lookup-by-versions', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSubmissionStructures(db);

            const versionCodes = String(req.query.version_codes || '')
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);

            const map = {};
            versionCodes.forEach((vc) => {
                const sub = arr(db.biz.channel_demand_submissions).find(
                    (s) => String(s.version_code) === vc && Number(s.status) !== -1
                );
                if (sub) {
                    const fulfilled = arr(db.biz.channel_demand_submission_lines)
                        .filter((l) => String(l.submission_no) === String(sub.submission_no) && Number(l.status) === 1).length;
                    const total = arr(db.biz.channel_demand_submission_lines)
                        .filter((l) => String(l.submission_no) === String(sub.submission_no)).length;
                    map[vc] = {
                        submission_no: sub.submission_no,
                        status: sub.status,
                        fulfilled_count: fulfilled,
                        line_count: total
                    };
                } else {
                    map[vc] = null;
                }
            });

            apiOk(res, req, map, '查询成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 500, error.message || '查询失败');
        }
    });
};

module.exports = {
    ensureSubmissionStructures,
    registerChannelDemandSubmissionRoutes,
    getSkuWarehouseStock,
    autoAllocateAllLines
};
