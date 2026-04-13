const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const TX_TYPES = ['INBOUND', 'OUTBOUND', 'TRANSFER_OUT', 'TRANSFER_IN', 'FREEZE', 'UNFREEZE', 'ADJUST', 'DAMAGE'];
const TRANSFER_STATUS = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'OUTBOUND', 'DONE', 'CANCELED'];
const WARNING_TYPES = ['LOW_STOCK', 'OVER_STOCK', 'NEAR_EXPIRY', 'STOCKOUT'];
const WARNING_LEVEL = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const WARNING_STATUS = ['OPEN', 'PROCESSING', 'CLOSED'];
const OVER_STOCK_COVER_LOW = 5;
const OVER_STOCK_COVER_MEDIUM = 6;
const OVER_STOCK_COVER_HIGH = 7;
const OVER_STOCK_COVER_CRITICAL = 8;
const OVER_STOCK_MIN_EXCESS_QTY = 120;

const normalize = (v) => String(v || '').trim();
const toNum = (v, fb = 0) => {
    const n = Number(v);
    return Number.isNaN(n) ? fb : n;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const dateText = (v) => String(v || '').slice(0, 10);

const calcRemainingDays = (expiryDate) => {
    if (!expiryDate) return 0;
    const now = new Date(dateText(nowIso()));
    const target = new Date(dateText(expiryDate));
    const diff = Math.floor((target.getTime() - now.getTime()) / 86400000);
    return Number.isFinite(diff) ? diff : 0;
};

const updateLedgerFlags = (row) => {
    row.remaining_days = calcRemainingDays(row.expiry_date);
    row.near_expiry_flag = row.remaining_days <= 7 ? 1 : 0;
    row.unsellable_flag = row.remaining_days <= 0 ? 1 : 0;
    row.updated_at = nowIso();
};

const buildTransferNo = (db) => {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const maxSeq = arr(db.biz.transfer_orders)
        .filter((row) => String(row.transfer_no || '').startsWith(`TR${datePart}`))
        .reduce((max, row) => Math.max(max, toNum(String(row.transfer_no || '').slice(-4), 0)), 0);
    return `TR${datePart}${String(maxSeq + 1).padStart(4, '0')}`;
};

const createLedgerRow = (db, payload = {}) => {
    const row = {
        id: nextId(arr(db.biz.inventory_ledger)),
        warehouse_code: normalize(payload.warehouse_code),
        warehouse_name: normalize(payload.warehouse_name),
        sku_code: normalize(payload.sku_code),
        sku_name: normalize(payload.sku_name),
        batch_no: normalize(payload.batch_no),
        production_date: dateText(payload.production_date || nowIso()),
        expiry_date: dateText(payload.expiry_date || nowIso()),
        remaining_days: 0,
        total_qty: Math.max(0, toNum(payload.total_qty, 0)),
        available_qty: Math.max(0, toNum(payload.available_qty, 0)),
        locked_qty: Math.max(0, toNum(payload.locked_qty, 0)),
        in_transit_qty: Math.max(0, toNum(payload.in_transit_qty, 0)),
        safety_qty: Math.max(0, toNum(payload.safety_qty, 0)),
        near_expiry_flag: 0,
        unsellable_flag: 0,
        last_change_source: normalize(payload.last_change_source || ''),
        updated_at: nowIso()
    };
    const sum = toNum(row.available_qty, 0) + toNum(row.locked_qty, 0) + toNum(row.in_transit_qty, 0);
    if (toNum(row.total_qty, 0) < sum) row.total_qty = sum;
    updateLedgerFlags(row);
    return row;
};

const ensureInventoryOpsStructures = (db) => {
    db.biz = db.biz || {};
    db.master = db.master || {};

    db.biz.inventory_stock = arr(db.biz.inventory_stock);
    db.biz.inventory_ledger = arr(db.biz.inventory_ledger);
    db.biz.inventory_transactions = arr(db.biz.inventory_transactions);
    db.biz.transfer_orders = arr(db.biz.transfer_orders);
    db.biz.transfer_tracks = arr(db.biz.transfer_tracks);
    db.biz.inventory_warnings = arr(db.biz.inventory_warnings);
    db.biz.warehouse_capabilities = arr(db.biz.warehouse_capabilities);
    db.biz.inventory_locks = arr(db.biz.inventory_locks);

    if (!db.biz.inventory_ledger.length && db.biz.inventory_stock.length) {
        const now = nowIso();
        const skuMap = new Map(arr(db.master.sku).map((row) => [String(row.sku_code), row]));
        const ledger = [];

        db.biz.inventory_stock.forEach((stock, idx) => {
            const sku = skuMap.get(String(stock.sku_code));
            const shelfLife = Math.max(1, toNum(sku?.shelf_life_days, 30));
            const totalQty = Math.max(0, toNum(stock.available_qty, 0) + toNum(stock.locked_qty, 0) + toNum(stock.in_transit_qty, 0));
            if (totalQty <= 0) return;

            const batchQty1 = Math.max(0, Math.floor(totalQty * 0.58));
            const batchQty2 = Math.max(0, totalQty - batchQty1);
            const prod1 = new Date(Date.now() - (8 + (idx % 5)) * 86400000).toISOString().slice(0, 10);
            const prod2 = new Date(Date.now() - (18 + (idx % 7)) * 86400000).toISOString().slice(0, 10);
            const exp1 = new Date(new Date(prod1).getTime() + shelfLife * 86400000).toISOString().slice(0, 10);
            const exp2 = new Date(new Date(prod2).getTime() + shelfLife * 86400000).toISOString().slice(0, 10);
            const lockRatio = totalQty > 0 ? Math.min(1, toNum(stock.locked_qty, 0) / totalQty) : 0;
            const transitRatio = totalQty > 0 ? Math.min(1, toNum(stock.in_transit_qty, 0) / totalQty) : 0;

            [
                { qty: batchQty1, production_date: prod1, expiry_date: exp1, suffix: 'B1' },
                { qty: batchQty2, production_date: prod2, expiry_date: exp2, suffix: 'B2' }
            ]
                .filter((row) => row.qty > 0)
                .forEach((row) => {
                    const locked = Math.floor(row.qty * lockRatio);
                    const inTransit = Math.floor(row.qty * transitRatio);
                    const available = Math.max(0, row.qty - locked - inTransit);
                    const remain = calcRemainingDays(row.expiry_date);
                    ledger.push({
                        id: nextId(ledger),
                        warehouse_code: stock.warehouse_code,
                        warehouse_name: stock.warehouse_name,
                        sku_code: stock.sku_code,
                        sku_name: stock.sku_name,
                        batch_no: `${stock.warehouse_code}-${stock.sku_code}-${row.suffix}`,
                        production_date: row.production_date,
                        expiry_date: row.expiry_date,
                        remaining_days: remain,
                        total_qty: row.qty,
                        available_qty: available,
                        locked_qty: locked,
                        in_transit_qty: inTransit,
                        safety_qty: Math.max(0, toNum(stock.safety_qty, 0)),
                        near_expiry_flag: remain <= 7 ? 1 : 0,
                        unsellable_flag: remain <= 0 ? 1 : 0,
                        last_change_source: 'INIT_SEED',
                        updated_at: now
                    });
                });
        });

        db.biz.inventory_ledger = ledger;
    }

    if (!db.biz.inventory_transactions.length && db.biz.inventory_ledger.length) {
        const txRows = [];
        db.biz.inventory_ledger.forEach((row) => {
            txRows.push({
                id: nextId(txRows),
                tx_type: 'INBOUND',
                source_doc_type: 'INIT',
                source_doc_no: `INIT-${row.id}`,
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                sku_code: row.sku_code,
                sku_name: row.sku_name,
                batch_no: row.batch_no,
                qty: toNum(row.total_qty, 0),
                before_available_qty: 0,
                after_available_qty: toNum(row.available_qty, 0),
                operator: '系统初始化',
                biz_time: row.updated_at,
                remark: '初始化库存入账'
            });
        });
        db.biz.inventory_transactions = txRows;
    }

    if (!db.biz.warehouse_capabilities.length) {
        const activeSkus = arr(db.master.sku).filter((sku) => Number(sku.status) === 1);
        const supportedSkuCodes = activeSkus.map((sku) => sku.sku_code);
        const supportedCategories = [...new Set(activeSkus.map((sku) => sku.category_code).filter(Boolean))];

        db.biz.warehouse_capabilities = arr(db.master.warehouse)
            .filter((wh) => Number(wh.status) === 1)
            .map((wh, idx) => ({
                id: idx + 1,
                warehouse_code: wh.warehouse_code,
                warehouse_name: wh.warehouse_name,
                service_regions: [wh.province_name, wh.city_name].filter(Boolean),
                daily_capacity: 1500 + idx * 200,
                processing_capacity: 1200 + idx * 180,
                delivery_ttl_hours: wh.warehouse_type === 1 ? 24 : (wh.warehouse_type === 2 ? 36 : 48),
                supported_skus: supportedSkuCodes,
                supported_categories: supportedCategories,
                updated_by: '系统初始化',
                updated_at: nowIso()
            }));
    }

    arr(db.biz.inventory_ledger).forEach((row) => {
        updateLedgerFlags(row);
    });

    if (!db.biz.transfer_orders.length) {
        const whRows = arr(db.master.warehouse).filter((row) => Number(row.status) === 1);
        const skuRow = arr(db.master.sku).find((row) => Number(row.status) === 1);
        if (whRows.length >= 2 && skuRow) {
            const sampleBatch = arr(db.biz.inventory_ledger)
                .find((row) => String(row.warehouse_code) === String(whRows[0].warehouse_code) && String(row.sku_code) === String(skuRow.sku_code));
            const transferNo = `TR${new Date().toISOString().slice(0, 10).replace(/-/g, '')}0001`;
            const now = nowIso();
            db.biz.transfer_orders.push({
                id: 1,
                transfer_no: transferNo,
                out_warehouse_code: whRows[0].warehouse_code,
                out_warehouse_name: whRows[0].warehouse_name,
                in_warehouse_code: whRows[1].warehouse_code,
                in_warehouse_name: whRows[1].warehouse_name,
                sku_code: skuRow.sku_code,
                sku_name: skuRow.sku_name,
                batch_no: sampleBatch?.batch_no || '',
                qty: 60,
                reason: '平衡区域库存',
                status: 'DONE',
                applicant: '系统初始化',
                applied_at: now,
                reviewer: '系统初始化',
                review_comment: '初始化通过',
                reviewed_at: now,
                outbound_confirm_by: '系统初始化',
                outbound_confirm_at: now,
                inbound_confirm_by: '系统初始化',
                inbound_confirm_at: now,
                cancel_reason: '',
                cancelled_at: '',
                updated_at: now
            });
            db.biz.transfer_tracks.push(
                { id: nextId(db.biz.transfer_tracks), transfer_no: transferNo, status: 'PENDING_REVIEW', operator: '系统初始化', comment: '提交审核', action_time: now },
                { id: nextId(db.biz.transfer_tracks), transfer_no: transferNo, status: 'APPROVED', operator: '系统初始化', comment: '审核通过', action_time: now },
                { id: nextId(db.biz.transfer_tracks), transfer_no: transferNo, status: 'OUTBOUND', operator: '系统初始化', comment: '调出确认', action_time: now },
                { id: nextId(db.biz.transfer_tracks), transfer_no: transferNo, status: 'DONE', operator: '系统初始化', comment: '调入完成', action_time: now }
            );
        }
    }
};

const findLedgerRow = (db, query) => arr(db.biz.inventory_ledger).find((row) => (
    String(row.warehouse_code) === String(query.warehouse_code)
    && String(row.sku_code) === String(query.sku_code)
    && String(row.batch_no) === String(query.batch_no)
));

const previewLedgerAfter = (ledgerRow, delta = {}) => {
    const next = {
        total_qty: toNum(ledgerRow.total_qty, 0) + toNum(delta.total, 0),
        available_qty: toNum(ledgerRow.available_qty, 0) + toNum(delta.available, 0),
        locked_qty: toNum(ledgerRow.locked_qty, 0) + toNum(delta.locked, 0),
        in_transit_qty: toNum(ledgerRow.in_transit_qty, 0) + toNum(delta.transit, 0)
    };
    return next;
};

const adjustLedger = (ledgerRow, delta = {}) => {
    const next = previewLedgerAfter(ledgerRow, delta);
    ledgerRow.total_qty = Math.max(0, next.total_qty);
    ledgerRow.available_qty = Math.max(0, next.available_qty);
    ledgerRow.locked_qty = Math.max(0, next.locked_qty);
    ledgerRow.in_transit_qty = Math.max(0, next.in_transit_qty);

    const sum = toNum(ledgerRow.available_qty, 0) + toNum(ledgerRow.locked_qty, 0) + toNum(ledgerRow.in_transit_qty, 0);
    if (toNum(ledgerRow.total_qty, 0) < sum) ledgerRow.total_qty = sum;

    updateLedgerFlags(ledgerRow);
};

const appendInventoryTx = (db, payload) => {
    db.biz.inventory_transactions.push({
        id: nextId(db.biz.inventory_transactions),
        tx_type: payload.tx_type,
        source_doc_type: payload.source_doc_type || '',
        source_doc_no: payload.source_doc_no || '',
        warehouse_code: payload.warehouse_code || '',
        warehouse_name: payload.warehouse_name || '',
        sku_code: payload.sku_code || '',
        sku_name: payload.sku_name || '',
        batch_no: payload.batch_no || '',
        qty: toNum(payload.qty, 0),
        before_available_qty: toNum(payload.before_available_qty, 0),
        after_available_qty: toNum(payload.after_available_qty, 0),
        operator: payload.operator || '系统',
        biz_time: payload.biz_time || nowIso(),
        remark: payload.remark || ''
    });
};

const appendTransferTrack = (db, transferNo, status, operator, comment = '') => {
    db.biz.transfer_tracks.push({
        id: nextId(db.biz.transfer_tracks),
        transfer_no: transferNo,
        status,
        operator: normalize(operator) || '系统',
        comment: normalize(comment),
        action_time: nowIso()
    });
};
const getWarningKey = (row) => `${row.type}:${row.warehouse_code}:${row.sku_code}:${row.batch_no}`;

const refreshWarnings = (db) => {
    const now = nowIso();
    const oldRows = arr(db.biz.inventory_warnings);
    const closedRows = oldRows.filter((row) => String(row.status) === 'CLOSED');
    const nonClosedRows = oldRows.filter((row) => String(row.status) !== 'CLOSED');
    const existedMap = new Map(nonClosedRows.map((row) => [getWarningKey(row), row]));

    const generated = [];

    arr(db.biz.inventory_ledger).forEach((row) => {
        const available = toNum(row.available_qty, 0);
        const total = toNum(row.total_qty, 0);
        const safety = toNum(row.safety_qty, 0);
        const remaining = toNum(row.remaining_days, calcRemainingDays(row.expiry_date));
        const coverRate = safety > 0 ? (available / safety) : 0;
        const excessQty = Math.max(0, total - safety);

        if (available <= 0) {
            generated.push({
                type: 'STOCKOUT',
                level: total <= 0 ? 'CRITICAL' : 'HIGH',
                message: total <= 0 ? '库存已缺货' : '可用库存为0，存在锁定或在途占用',
                related_qty: available,
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                sku_code: row.sku_code,
                sku_name: row.sku_name,
                batch_no: row.batch_no
            });
        }

        if (available > 0 && safety > 0 && available < safety) {
            const level = coverRate <= 0.25
                ? 'CRITICAL'
                : (coverRate <= 0.5 ? 'HIGH' : (coverRate <= 0.8 ? 'MEDIUM' : 'LOW'));
            generated.push({
                type: 'LOW_STOCK',
                level,
                message: `可用库存低于安全库存（覆盖率 ${(coverRate * 100).toFixed(1)}%）`,
                related_qty: available,
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                sku_code: row.sku_code,
                sku_name: row.sku_name,
                batch_no: row.batch_no
            });
        }

        const isOverStock = safety > 0
            && coverRate >= OVER_STOCK_COVER_LOW
            && total >= safety * OVER_STOCK_COVER_LOW
            && excessQty >= Math.max(OVER_STOCK_MIN_EXCESS_QTY, safety * 2);
        if (isOverStock) {
            const level = coverRate >= OVER_STOCK_COVER_CRITICAL
                ? 'CRITICAL'
                : (coverRate >= OVER_STOCK_COVER_HIGH
                    ? 'HIGH'
                    : (coverRate >= OVER_STOCK_COVER_MEDIUM ? 'MEDIUM' : 'LOW'));
            generated.push({
                type: 'OVER_STOCK',
                level,
                message: `库存高于安全上限（覆盖率 ${coverRate.toFixed(1)} 倍）`,
                related_qty: total,
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                sku_code: row.sku_code,
                sku_name: row.sku_name,
                batch_no: row.batch_no
            });
        }

        if (remaining <= 7) {
            const level = remaining <= 0
                ? 'CRITICAL'
                : (remaining <= 2 ? 'HIGH' : (remaining <= 5 ? 'MEDIUM' : 'LOW'));
            generated.push({
                type: 'NEAR_EXPIRY',
                level,
                message: remaining <= 0 ? '库存已过期不可售' : '库存临期预警',
                related_qty: available,
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                sku_code: row.sku_code,
                sku_name: row.sku_name,
                batch_no: row.batch_no
            });
        }
    });

    const dedupMap = new Map();
    generated.forEach((item) => {
        const key = getWarningKey(item);
        if (!dedupMap.has(key)) dedupMap.set(key, item);
    });

    const activeRows = [];
    [...dedupMap.values()].forEach((item) => {
        const key = getWarningKey(item);
        const existed = existedMap.get(key);
        if (existed) {
            existed.level = item.level;
            existed.message = item.message;
            existed.related_qty = item.related_qty;
            existed.updated_at = now;
            activeRows.push(existed);
            return;
        }

        activeRows.push({
            id: nextId(oldRows.concat(activeRows)),
            type: item.type,
            level: item.level,
            status: 'OPEN',
            warehouse_code: item.warehouse_code,
            warehouse_name: item.warehouse_name,
            sku_code: item.sku_code,
            sku_name: item.sku_name,
            batch_no: item.batch_no,
            message: item.message,
            related_qty: item.related_qty,
            generated_at: now,
            handled_by: '',
            handled_at: '',
            handle_comment: '',
            updated_at: now
        });
    });

    const activeKeySet = new Set(activeRows.map((row) => getWarningKey(row)));
    const autoClosed = nonClosedRows
        .filter((row) => !activeKeySet.has(getWarningKey(row)))
        .map((row) => ({
            ...row,
            status: 'CLOSED',
            handled_by: row.handled_by || '系统自动',
            handled_at: row.handled_at || now,
            handle_comment: row.handle_comment || '库存风险恢复，系统自动关闭',
            updated_at: now
        }));

    db.biz.inventory_warnings = [...closedRows, ...autoClosed, ...activeRows];
};

const synchronizeOrderLocks = (db, orderNo, operator, reason = 'ORDER_ALLOCATE') => {
    ensureInventoryOpsStructures(db);

    const oldLocks = arr(db.biz.inventory_locks).filter((row) => String(row.order_no) === String(orderNo) && String(row.status) === 'ACTIVE');
    oldLocks.forEach((lock) => {
        const ledger = findLedgerRow(db, lock);
        if (ledger) {
            const before = toNum(ledger.available_qty, 0);
            adjustLedger(ledger, { available: toNum(lock.lock_qty, 0), locked: -toNum(lock.lock_qty, 0) });
            ledger.last_change_source = `ORDER_UNLOCK:${orderNo}`;
            appendInventoryTx(db, {
                tx_type: 'UNFREEZE',
                source_doc_type: 'ORDER',
                source_doc_no: orderNo,
                warehouse_code: ledger.warehouse_code,
                warehouse_name: ledger.warehouse_name,
                sku_code: ledger.sku_code,
                sku_name: ledger.sku_name,
                batch_no: ledger.batch_no,
                qty: toNum(lock.lock_qty, 0),
                before_available_qty: before,
                after_available_qty: toNum(ledger.available_qty, 0),
                operator,
                remark: '订单重算释放锁定'
            });
        }
        lock.status = 'RELEASED';
        lock.released_at = nowIso();
        lock.release_reason = reason;
        lock.updated_at = nowIso();
    });

    const lines = arr(db.biz.order_lines).filter((line) => String(line.order_no) === String(orderNo));
    lines.forEach((line) => {
        arr(line.allocation_result).forEach((allocation) => {
            let remain = toNum(allocation.qty, 0);
            if (remain <= 0) return;

            const candidates = arr(db.biz.inventory_ledger)
                .filter((row) => String(row.warehouse_code) === String(allocation.warehouse_code)
                    && String(row.sku_code) === String(line.sku_code)
                    && Number(row.unsellable_flag) !== 1)
                .sort((a, b) => dateText(a.expiry_date).localeCompare(dateText(b.expiry_date)) || String(a.batch_no).localeCompare(String(b.batch_no)));

            candidates.forEach((ledger) => {
                if (remain <= 0) return;
                const canUse = Math.max(0, toNum(ledger.available_qty, 0));
                const lockQty = Math.min(remain, canUse);
                if (lockQty <= 0) return;

                const before = toNum(ledger.available_qty, 0);
                adjustLedger(ledger, { available: -lockQty, locked: lockQty });
                ledger.last_change_source = `ORDER_ALLOCATE:${orderNo}`;

                db.biz.inventory_locks.push({
                    id: nextId(db.biz.inventory_locks),
                    order_no: orderNo,
                    line_id: line.id,
                    warehouse_code: ledger.warehouse_code,
                    warehouse_name: ledger.warehouse_name,
                    sku_code: ledger.sku_code,
                    sku_name: ledger.sku_name,
                    batch_no: ledger.batch_no,
                    lock_qty: lockQty,
                    status: 'ACTIVE',
                    reason,
                    created_at: nowIso(),
                    released_at: '',
                    release_reason: '',
                    operator: operator || '系统',
                    updated_at: nowIso()
                });

                appendInventoryTx(db, {
                    tx_type: 'FREEZE',
                    source_doc_type: 'ORDER',
                    source_doc_no: orderNo,
                    warehouse_code: ledger.warehouse_code,
                    warehouse_name: ledger.warehouse_name,
                    sku_code: ledger.sku_code,
                    sku_name: ledger.sku_name,
                    batch_no: ledger.batch_no,
                    qty: lockQty,
                    before_available_qty: before,
                    after_available_qty: toNum(ledger.available_qty, 0),
                    operator,
                    remark: `订单行${line.line_no}锁定`
                });

                remain -= lockQty;
            });
        });
    });

    refreshWarnings(db);
};

const releaseOrderLocks = (db, orderNo, operator, reason = 'ORDER_RELEASE') => {
    ensureInventoryOpsStructures(db);

    arr(db.biz.inventory_locks)
        .filter((row) => String(row.order_no) === String(orderNo) && String(row.status) === 'ACTIVE')
        .forEach((lock) => {
            const ledger = findLedgerRow(db, lock);
            if (ledger) {
                const before = toNum(ledger.available_qty, 0);
                adjustLedger(ledger, { available: toNum(lock.lock_qty, 0), locked: -toNum(lock.lock_qty, 0) });
                ledger.last_change_source = `ORDER_RELEASE:${orderNo}`;
                appendInventoryTx(db, {
                    tx_type: 'UNFREEZE',
                    source_doc_type: 'ORDER',
                    source_doc_no: orderNo,
                    warehouse_code: ledger.warehouse_code,
                    warehouse_name: ledger.warehouse_name,
                    sku_code: ledger.sku_code,
                    sku_name: ledger.sku_name,
                    batch_no: ledger.batch_no,
                    qty: toNum(lock.lock_qty, 0),
                    before_available_qty: before,
                    after_available_qty: toNum(ledger.available_qty, 0),
                    operator,
                    remark: reason
                });
            }
            lock.status = 'RELEASED';
            lock.released_at = nowIso();
            lock.release_reason = reason;
            lock.operator = operator || lock.operator;
            lock.updated_at = nowIso();
        });

    refreshWarnings(db);
};

const buildOptions = (db) => ({
    tx_types: TX_TYPES,
    transfer_status: TRANSFER_STATUS,
    warning_types: WARNING_TYPES,
    warning_level: WARNING_LEVEL,
    warning_status: WARNING_STATUS,
    warehouses: arr(db.master.warehouse)
        .filter((row) => Number(row.status) === 1)
        .map((row) => ({ warehouse_code: row.warehouse_code, warehouse_name: row.warehouse_name })),
    skus: arr(db.master.sku)
        .filter((row) => Number(row.status) === 1)
        .map((row) => ({ sku_code: row.sku_code, sku_name: row.sku_name }))
});

const getTransferByNo = (db, transferNo) => arr(db.biz.transfer_orders).find((row) => String(row.transfer_no) === String(transferNo));
const addDaysText = (baseDate, offset) => {
    const d = new Date(`${dateText(baseDate)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
};

const buildDashboard = (db) => {
    const ledgerRows = arr(db.biz.inventory_ledger);
    const txRows = arr(db.biz.inventory_transactions);
    const transferRows = arr(db.biz.transfer_orders);
    const warningRows = arr(db.biz.inventory_warnings);
    const lockRows = arr(db.biz.inventory_locks);
    const today = dateText(nowIso());
    const recentDates = Array.from({ length: 7 }, (_, idx) => addDaysText(today, idx - 6));
    const trendMap = new Map(recentDates.map((date) => [date, {
        date,
        inbound_qty: 0,
        outbound_qty: 0,
        lock_qty: 0,
        release_qty: 0,
        adjust_qty: 0,
        damage_qty: 0,
        transfer_created: 0,
        transfer_done: 0
    }]));

    txRows.forEach((row) => {
        const point = trendMap.get(dateText(row.biz_time));
        if (!point) return;
        const qty = Math.abs(toNum(row.qty, 0));
        switch (String(row.tx_type)) {
        case 'INBOUND':
        case 'TRANSFER_IN':
            point.inbound_qty += qty;
            break;
        case 'OUTBOUND':
        case 'TRANSFER_OUT':
            point.outbound_qty += qty;
            break;
        case 'FREEZE':
            point.lock_qty += qty;
            break;
        case 'UNFREEZE':
            point.release_qty += qty;
            break;
        case 'ADJUST':
            point.adjust_qty += qty || Math.abs(toNum(row.after_available_qty, 0) - toNum(row.before_available_qty, 0));
            break;
        case 'DAMAGE':
            point.damage_qty += qty;
            break;
        default:
            break;
        }
    });

    transferRows.forEach((row) => {
        const createdPoint = trendMap.get(dateText(row.applied_at));
        if (createdPoint) createdPoint.transfer_created += 1;
        if (String(row.status) === 'DONE' && row.inbound_confirm_at) {
            const donePoint = trendMap.get(dateText(row.inbound_confirm_at));
            if (donePoint) donePoint.transfer_done += 1;
        }
    });

    const summary = ledgerRows.reduce((acc, row) => {
        acc.total_qty += toNum(row.total_qty, 0);
        acc.available_qty += toNum(row.available_qty, 0);
        acc.locked_qty += toNum(row.locked_qty, 0);
        acc.in_transit_qty += toNum(row.in_transit_qty, 0);
        acc.safety_qty += toNum(row.safety_qty, 0);
        return acc;
    }, {
        total_qty: 0,
        available_qty: 0,
        locked_qty: 0,
        in_transit_qty: 0,
        safety_qty: 0
    });

    const openWarnings = warningRows.filter((row) => String(row.status) !== 'CLOSED');
    const processingWarnings = warningRows.filter((row) => String(row.status) === 'PROCESSING');
    const closedWarnings = warningRows.filter((row) => String(row.status) === 'CLOSED');
    const activeLocks = lockRows.filter((row) => String(row.status) === 'ACTIVE');
    const releasedLocks = lockRows.filter((row) => String(row.status) === 'RELEASED');
    const activeTransfers = transferRows.filter((row) => !['DONE', 'CANCELED'].includes(String(row.status)));
    const todayPoint = trendMap.get(today) || {
        inbound_qty: 0,
        outbound_qty: 0,
        lock_qty: 0,
        release_qty: 0,
        adjust_qty: 0,
        damage_qty: 0,
        transfer_created: 0,
        transfer_done: 0
    };

    const warningHotspots = Object.values(openWarnings.reduce((acc, row) => {
        const key = String(row.warehouse_code);
        if (!acc[key]) {
            acc[key] = {
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                count: 0,
                critical_count: 0,
                high_count: 0,
                related_qty: 0,
                affected_skus: new Set()
            };
        }
        acc[key].count += 1;
        if (String(row.level) === 'CRITICAL') acc[key].critical_count += 1;
        if (String(row.level) === 'HIGH') acc[key].high_count += 1;
        acc[key].related_qty += toNum(row.related_qty, 0);
        acc[key].affected_skus.add(String(row.sku_code));
        return acc;
    }, {})).map((item) => ({
        warehouse_code: item.warehouse_code,
        warehouse_name: item.warehouse_name,
        count: item.count,
        critical_count: item.critical_count,
        high_count: item.high_count,
        related_qty: item.related_qty,
        affected_skus: item.affected_skus.size
    })).sort((a, b) => b.critical_count - a.critical_count || b.count - a.count || b.related_qty - a.related_qty).slice(0, 6);

    return {
        summary: {
            ...summary,
            available_rate: summary.total_qty ? Number(((summary.available_qty / summary.total_qty) * 100).toFixed(1)) : 0,
            safety_cover_rate: summary.safety_qty ? Number(((summary.available_qty / summary.safety_qty) * 100).toFixed(1)) : 0,
            open_warning_count: openWarnings.length,
            processing_warning_count: processingWarnings.length,
            closed_warning_count: closedWarnings.length,
            critical_warning_count: openWarnings.filter((row) => String(row.level) === 'CRITICAL').length,
            high_warning_count: openWarnings.filter((row) => String(row.level) === 'HIGH').length,
            active_transfer_count: activeTransfers.length,
            pending_review_count: transferRows.filter((row) => String(row.status) === 'PENDING_REVIEW').length,
            approved_count: transferRows.filter((row) => String(row.status) === 'APPROVED').length,
            outbound_count: transferRows.filter((row) => String(row.status) === 'OUTBOUND').length,
            done_transfer_count: transferRows.filter((row) => String(row.status) === 'DONE').length,
            active_lock_qty: activeLocks.reduce((sum, row) => sum + toNum(row.lock_qty, 0), 0),
            active_lock_orders: new Set(activeLocks.map((row) => String(row.order_no))).size,
            released_lock_count: releasedLocks.length,
            today_inbound_qty: todayPoint.inbound_qty,
            today_outbound_qty: todayPoint.outbound_qty,
            today_lock_qty: todayPoint.lock_qty,
            today_release_qty: todayPoint.release_qty,
            today_exception_qty: todayPoint.adjust_qty + todayPoint.damage_qty,
            today_transfer_created: todayPoint.transfer_created,
            today_transfer_done: todayPoint.transfer_done
        },
        trend: recentDates.map((date) => trendMap.get(date)),
        transfer_status: TRANSFER_STATUS.map((status) => ({
            status,
            count: transferRows.filter((row) => String(row.status) === status).length
        })),
        warning_status: WARNING_STATUS.map((status) => ({
            status,
            count: warningRows.filter((row) => String(row.status) === status).length
        })),
        warning_level: WARNING_LEVEL.map((level) => ({
            level,
            count: warningRows.filter((row) => String(row.level) === level && String(row.status) !== 'CLOSED').length
        })),
        warning_type: WARNING_TYPES.map((type) => ({
            type,
            count: warningRows.filter((row) => String(row.type) === type && String(row.status) !== 'CLOSED').length
        })),
        warning_hotspots: warningHotspots
    };
};

const registerInventoryOpsRoutes = ({ app, authRequired, apiOk, apiErr, paginate, contains }) => {
    app.get('/api/inventory-ops/options', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);
        refreshWarnings(db);
        apiOk(res, req, buildOptions(db), '获取成功');
    });

    app.get('/api/inventory-ops/dashboard', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);
        refreshWarnings(db);
        apiOk(res, req, buildDashboard(db), '获取成功');
    });

    app.get('/api/inventory-ops/ledger/list', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);
        refreshWarnings(db);

        const {
            page = 1,
            pageSize = 20,
            warehouseCode = '',
            skuCode = '',
            batchNo = '',
            keyword = '',
            nearExpiry = '',
            unsellable = '',
            dateField = 'updated_at',
            dateFrom = '',
            dateTo = ''
        } = req.query || {};

        let rows = arr(db.biz.inventory_ledger).map((row) => ({ ...row }));

        if (warehouseCode) rows = rows.filter((row) => String(row.warehouse_code) === String(warehouseCode));
        if (skuCode) rows = rows.filter((row) => String(row.sku_code) === String(skuCode));
        if (batchNo) rows = rows.filter((row) => contains(row.batch_no, batchNo));
        if (keyword) rows = rows.filter((row) => (
            contains(row.warehouse_code, keyword)
            || contains(row.warehouse_name, keyword)
            || contains(row.sku_code, keyword)
            || contains(row.sku_name, keyword)
            || contains(row.batch_no, keyword)
        ));
        if (String(nearExpiry) === '1') rows = rows.filter((row) => Number(row.near_expiry_flag) === 1);
        if (String(unsellable) === '1') rows = rows.filter((row) => Number(row.unsellable_flag) === 1);
        const dateFieldName = ['updated_at', 'production_date', 'expiry_date'].includes(String(dateField)) ? String(dateField) : 'updated_at';
        if (dateFrom) rows = rows.filter((row) => dateText(row[dateFieldName]) >= dateText(dateFrom));
        if (dateTo) rows = rows.filter((row) => dateText(row[dateFieldName]) <= dateText(dateTo));

        rows = rows.sort((a, b) => dateText(a.expiry_date).localeCompare(dateText(b.expiry_date)) || String(a.batch_no).localeCompare(String(b.batch_no)));

        const summary = rows.reduce((acc, row) => {
            acc.total_qty += toNum(row.total_qty, 0);
            acc.available_qty += toNum(row.available_qty, 0);
            acc.locked_qty += toNum(row.locked_qty, 0);
            acc.in_transit_qty += toNum(row.in_transit_qty, 0);
            acc.safety_qty += toNum(row.safety_qty, 0);
            return acc;
        }, {
            total_qty: 0,
            available_qty: 0,
            locked_qty: 0,
            in_transit_qty: 0,
            safety_qty: 0
        });

        apiOk(res, req, { ...paginate(rows, page, pageSize), summary }, '获取成功');
    });

    app.get('/api/inventory-ops/ledger/:id', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const db = readDb();
        ensureInventoryOpsStructures(db);

        const detail = arr(db.biz.inventory_ledger).find((row) => Number(row.id) === id);
        if (!detail) return apiErr(res, req, 404, '库存明细不存在');

        const changes = arr(db.biz.inventory_transactions)
            .filter((row) => String(row.warehouse_code) === String(detail.warehouse_code)
                && String(row.sku_code) === String(detail.sku_code)
                && String(row.batch_no) === String(detail.batch_no))
            .sort((a, b) => String(b.biz_time).localeCompare(String(a.biz_time)));

        apiOk(res, req, { detail, changes }, '获取成功');
    });

    app.get('/api/inventory-ops/transactions/list', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);

        const {
            page = 1,
            pageSize = 20,
            txType = '',
            warehouseCode = '',
            skuCode = '',
            keyword = '',
            dateFrom = '',
            dateTo = ''
        } = req.query || {};

        let rows = arr(db.biz.inventory_transactions);

        if (txType) rows = rows.filter((row) => String(row.tx_type) === String(txType));
        if (warehouseCode) rows = rows.filter((row) => String(row.warehouse_code) === String(warehouseCode));
        if (skuCode) rows = rows.filter((row) => String(row.sku_code) === String(skuCode));
        if (keyword) rows = rows.filter((row) => (
            contains(row.source_doc_no, keyword)
            || contains(row.source_doc_type, keyword)
            || contains(row.warehouse_name, keyword)
            || contains(row.sku_name, keyword)
            || contains(row.batch_no, keyword)
        ));
        if (dateFrom) rows = rows.filter((row) => dateText(row.biz_time) >= dateText(dateFrom));
        if (dateTo) rows = rows.filter((row) => dateText(row.biz_time) <= dateText(dateTo));

        rows = rows.sort((a, b) => String(b.biz_time).localeCompare(String(a.biz_time)));

        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.post('/api/inventory-ops/transactions', authRequired, (req, res) => {
        const body = req.body || {};
        const txType = normalize(body.tx_type).toUpperCase();
        if (!TX_TYPES.includes(txType)) return apiErr(res, req, 400, '交易类型不支持');
        const sourceDocType = normalize(body.source_doc_type || 'MANUAL').toUpperCase() || 'MANUAL';
        const sourceDocNo = normalize(body.source_doc_no || `${sourceDocType}-${txType}-${Date.now()}`);

        const operator = req.user?.nickname || req.user?.username || '系统';
        let created = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);

                let ledger = findLedgerRow(db, body);
                if (!ledger && ['INBOUND', 'TRANSFER_IN'].includes(txType)) {
                    ledger = createLedgerRow(db, {
                        warehouse_code: body.warehouse_code,
                        warehouse_name: body.warehouse_name,
                        sku_code: body.sku_code,
                        sku_name: body.sku_name,
                        batch_no: body.batch_no,
                        production_date: body.production_date,
                        expiry_date: body.expiry_date,
                        safety_qty: body.safety_qty,
                        last_change_source: `CREATE_BY_${txType}`
                    });
                    db.biz.inventory_ledger.push(ledger);
                }

                if (!ledger) throw new Error('未找到对应库存批次，请先完成入库建账');

                const qty = Math.max(0, toNum(body.qty, 0));
                const adjustQty = toNum(body.adjust_qty, 0);
                const beforeAvailable = toNum(ledger.available_qty, 0);
                let delta = { total: 0, available: 0, locked: 0, transit: 0 };

                if (txType === 'INBOUND') delta = { total: qty, available: qty, locked: 0, transit: 0 };
                if (txType === 'OUTBOUND') delta = { total: -qty, available: -qty, locked: 0, transit: 0 };
                if (txType === 'TRANSFER_OUT') delta = { total: -qty, available: -qty, locked: 0, transit: 0 };
                if (txType === 'TRANSFER_IN') delta = { total: qty, available: qty, locked: 0, transit: 0 };
                if (txType === 'FREEZE') delta = { total: 0, available: -qty, locked: qty, transit: 0 };
                if (txType === 'UNFREEZE') delta = { total: 0, available: qty, locked: -qty, transit: 0 };
                if (txType === 'ADJUST') delta = { total: adjustQty, available: adjustQty, locked: 0, transit: 0 };
                if (txType === 'DAMAGE') delta = { total: -qty, available: -qty, locked: 0, transit: 0 };

                const preview = previewLedgerAfter(ledger, delta);
                if (preview.total_qty < 0 || preview.available_qty < 0 || preview.locked_qty < 0 || preview.in_transit_qty < 0) {
                    throw new Error('库存变更后数量非法，请检查变更数量');
                }

                adjustLedger(ledger, delta);
                ledger.last_change_source = `${txType}:${sourceDocNo}`;

                created = {
                    tx_type: txType,
                    source_doc_type: sourceDocType,
                    source_doc_no: sourceDocNo,
                    warehouse_code: ledger.warehouse_code,
                    warehouse_name: ledger.warehouse_name,
                    sku_code: ledger.sku_code,
                    sku_name: ledger.sku_name,
                    batch_no: ledger.batch_no,
                    qty: txType === 'ADJUST' ? Math.abs(adjustQty) : qty,
                    before_available_qty: beforeAvailable,
                    after_available_qty: toNum(ledger.available_qty, 0),
                    operator,
                    biz_time: nowIso(),
                    remark: normalize(body.remark)
                };

                appendInventoryTx(db, created);
                refreshWarnings(db);
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '库存交易登记失败');
        }

        apiOk(res, req, created, '登记成功');
    });
    app.get('/api/inventory-ops/transfers/list', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);

        const { page = 1, pageSize = 20, status = '', keyword = '' } = req.query || {};

        let rows = arr(db.biz.transfer_orders).map((row) => ({ ...row }));
        if (status) rows = rows.filter((row) => String(row.status) === String(status));
        if (keyword) {
            rows = rows.filter((row) => (
                contains(row.transfer_no, keyword)
                || contains(row.sku_name, keyword)
                || contains(row.out_warehouse_name, keyword)
                || contains(row.in_warehouse_name, keyword)
            ));
        }

        rows = rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.post('/api/inventory-ops/transfers', authRequired, (req, res) => {
        const body = req.body || {};
        const outWarehouseCode = normalize(body.out_warehouse_code);
        const inWarehouseCode = normalize(body.in_warehouse_code);
        const skuCode = normalize(body.sku_code);
        const qty = Math.max(0, toNum(body.qty, 0));

        if (!outWarehouseCode || !inWarehouseCode || !skuCode || qty <= 0) {
            return apiErr(res, req, 400, '调拨单参数不完整');
        }
        if (outWarehouseCode === inWarehouseCode) {
            return apiErr(res, req, 400, '调出仓和调入仓不能相同');
        }

        const operator = req.user?.nickname || req.user?.username || '系统';
        let created = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const transferNo = buildTransferNo(db);
                const sourceCandidates = arr(db.biz.inventory_ledger)
                    .filter((row) => String(row.warehouse_code) === outWarehouseCode
                        && String(row.sku_code) === skuCode
                        && Number(row.unsellable_flag) !== 1)
                    .sort((a, b) => dateText(a.expiry_date).localeCompare(dateText(b.expiry_date)) || String(a.batch_no).localeCompare(String(b.batch_no)));

                let batchNo = normalize(body.batch_no);
                let sourceLedger = null;

                if (!batchNo) {
                    sourceLedger = sourceCandidates.find((row) => toNum(row.available_qty, 0) > 0) || null;
                    if (!sourceLedger) throw new Error('调出仓无可用批次库存，无法创建调拨单');
                    batchNo = normalize(sourceLedger.batch_no);
                } else {
                    sourceLedger = sourceCandidates.find((row) => String(row.batch_no) === batchNo) || null;
                    if (!sourceLedger) throw new Error('指定批次不存在、不可售或不属于调出仓');
                }

                if (toNum(sourceLedger.available_qty, 0) <= 0) {
                    throw new Error('调出批次可用库存不足，无法创建调拨单');
                }
                if (qty > toNum(sourceLedger.available_qty, 0)) {
                    throw new Error('申请数量超过调出批次当前可用库存');
                }

                created = {
                    id: nextId(db.biz.transfer_orders),
                    transfer_no: transferNo,
                    out_warehouse_code: outWarehouseCode,
                    out_warehouse_name: normalize(body.out_warehouse_name || sourceLedger.warehouse_name),
                    in_warehouse_code: inWarehouseCode,
                    in_warehouse_name: normalize(body.in_warehouse_name),
                    sku_code: skuCode,
                    sku_name: normalize(body.sku_name || sourceLedger.sku_name),
                    batch_no: batchNo,
                    qty,
                    reason: normalize(body.reason),
                    status: 'DRAFT',
                    applicant: operator,
                    applied_at: nowIso(),
                    reviewer: '',
                    review_comment: '',
                    reviewed_at: '',
                    outbound_confirm_by: '',
                    outbound_confirm_at: '',
                    inbound_confirm_by: '',
                    inbound_confirm_at: '',
                    cancel_reason: '',
                    cancelled_at: '',
                    updated_at: nowIso()
                };

                db.biz.transfer_orders.push(created);
                appendTransferTrack(db, transferNo, 'DRAFT', operator, '创建调拨单');
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '创建失败');
        }

        apiOk(res, req, created, '创建成功');
    });

    app.get('/api/inventory-ops/transfers/:transferNo', authRequired, (req, res) => {
        const transferNo = normalize(req.params.transferNo);
        const db = readDb();
        ensureInventoryOpsStructures(db);

        const detail = getTransferByNo(db, transferNo);
        if (!detail) return apiErr(res, req, 404, '调拨单不存在');

        const tracks = arr(db.biz.transfer_tracks)
            .filter((row) => String(row.transfer_no) === transferNo)
            .sort((a, b) => String(a.action_time).localeCompare(String(b.action_time)));

        apiOk(res, req, { detail, tracks }, '获取成功');
    });

    app.get('/api/inventory-ops/transfers/:transferNo/tracks', authRequired, (req, res) => {
        const transferNo = normalize(req.params.transferNo);
        const db = readDb();
        ensureInventoryOpsStructures(db);

        const tracks = arr(db.biz.transfer_tracks)
            .filter((row) => String(row.transfer_no) === transferNo)
            .sort((a, b) => String(a.action_time).localeCompare(String(b.action_time)));

        apiOk(res, req, tracks, '获取成功');
    });

    app.post('/api/inventory-ops/transfers/:transferNo/submit', authRequired, (req, res) => {
        const transferNo = normalize(req.params.transferNo);
        const operator = req.user?.nickname || req.user?.username || '系统';
        let out = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const row = getTransferByNo(db, transferNo);
                if (!row) throw new Error('调拨单不存在');
                if (String(row.status) !== 'DRAFT') throw new Error('仅草稿状态可提交审核');
                if (!normalize(row.batch_no)) throw new Error('调拨单缺少批次信息，无法提交审核');

                const sourceLedger = findLedgerRow(db, {
                    warehouse_code: row.out_warehouse_code,
                    sku_code: row.sku_code,
                    batch_no: row.batch_no
                });
                if (!sourceLedger) throw new Error('调出批次库存不存在，无法提交审核');
                if (Number(sourceLedger.unsellable_flag) === 1) throw new Error('调出批次已不可售，无法提交审核');
                if (toNum(sourceLedger.available_qty, 0) < toNum(row.qty, 0)) throw new Error('调出批次可用库存不足，无法提交审核');

                row.status = 'PENDING_REVIEW';
                row.updated_at = nowIso();
                appendTransferTrack(db, transferNo, 'PENDING_REVIEW', operator, '提交审核');
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '提交失败');
        }

        apiOk(res, req, out, '提交成功');
    });

    app.post('/api/inventory-ops/transfers/:transferNo/review', authRequired, (req, res) => {
        const transferNo = normalize(req.params.transferNo);
        const body = req.body || {};
        const action = normalize(body.action).toUpperCase();
        const operator = req.user?.nickname || req.user?.username || '系统';
        if (!['APPROVE', 'REJECT'].includes(action)) return apiErr(res, req, 400, 'action 仅支持 APPROVE/REJECT');

        let out = null;
        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const row = getTransferByNo(db, transferNo);
                if (!row) throw new Error('调拨单不存在');
                if (String(row.status) !== 'PENDING_REVIEW') throw new Error('调拨单不在待审核状态');

                row.reviewer = operator;
                row.review_comment = normalize(body.comment);
                row.reviewed_at = nowIso();
                row.updated_at = nowIso();

                if (action === 'APPROVE') {
                    row.status = 'APPROVED';
                    appendTransferTrack(db, transferNo, 'APPROVED', operator, row.review_comment || '审核通过');
                } else {
                    row.status = 'CANCELED';
                    row.cancel_reason = row.review_comment || '审核驳回';
                    row.cancelled_at = nowIso();
                    appendTransferTrack(db, transferNo, 'CANCELED', operator, row.cancel_reason);
                }
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '审核失败');
        }

        apiOk(res, req, out, '审核完成');
    });

    app.post('/api/inventory-ops/transfers/:transferNo/outbound', authRequired, (req, res) => {
        const transferNo = normalize(req.params.transferNo);
        const operator = req.user?.nickname || req.user?.username || '系统';
        let out = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const row = getTransferByNo(db, transferNo);
                if (!row) throw new Error('调拨单不存在');
                if (String(row.status) !== 'APPROVED') throw new Error('仅已审核调拨单可调出确认');

                const sourceLedger = findLedgerRow(db, {
                    warehouse_code: row.out_warehouse_code,
                    sku_code: row.sku_code,
                    batch_no: row.batch_no
                });
                if (!sourceLedger) throw new Error('调出批次库存不存在');
                if (toNum(sourceLedger.available_qty, 0) < toNum(row.qty, 0)) throw new Error('调出仓可用库存不足');

                const beforeAvailable = toNum(sourceLedger.available_qty, 0);
                adjustLedger(sourceLedger, { available: -toNum(row.qty, 0), transit: toNum(row.qty, 0) });
                sourceLedger.last_change_source = `TRANSFER_OUT:${transferNo}`;

                appendInventoryTx(db, {
                    tx_type: 'TRANSFER_OUT',
                    source_doc_type: 'TRANSFER',
                    source_doc_no: transferNo,
                    warehouse_code: sourceLedger.warehouse_code,
                    warehouse_name: sourceLedger.warehouse_name,
                    sku_code: sourceLedger.sku_code,
                    sku_name: sourceLedger.sku_name,
                    batch_no: sourceLedger.batch_no,
                    qty: toNum(row.qty, 0),
                    before_available_qty: beforeAvailable,
                    after_available_qty: toNum(sourceLedger.available_qty, 0),
                    operator,
                    remark: '调拨调出确认'
                });

                row.status = 'OUTBOUND';
                row.outbound_confirm_by = operator;
                row.outbound_confirm_at = nowIso();
                row.updated_at = nowIso();
                appendTransferTrack(db, transferNo, 'OUTBOUND', operator, '调出确认');

                refreshWarnings(db);
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '调出确认失败');
        }

        apiOk(res, req, out, '调出确认成功');
    });

    app.post('/api/inventory-ops/transfers/:transferNo/inbound', authRequired, (req, res) => {
        const transferNo = normalize(req.params.transferNo);
        const operator = req.user?.nickname || req.user?.username || '系统';
        let out = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const row = getTransferByNo(db, transferNo);
                if (!row) throw new Error('调拨单不存在');
                if (String(row.status) !== 'OUTBOUND') throw new Error('仅调出中调拨单可确认调入');

                const sourceLedger = findLedgerRow(db, {
                    warehouse_code: row.out_warehouse_code,
                    sku_code: row.sku_code,
                    batch_no: row.batch_no
                });
                if (!sourceLedger) throw new Error('调出批次库存不存在');
                if (toNum(sourceLedger.in_transit_qty, 0) < toNum(row.qty, 0)) throw new Error('在途库存不足，无法调入');

                adjustLedger(sourceLedger, { total: -toNum(row.qty, 0), transit: -toNum(row.qty, 0) });
                sourceLedger.last_change_source = `TRANSFER_DONE:${transferNo}`;

                let targetLedger = findLedgerRow(db, {
                    warehouse_code: row.in_warehouse_code,
                    sku_code: row.sku_code,
                    batch_no: row.batch_no
                });
                if (!targetLedger) {
                    targetLedger = createLedgerRow(db, {
                        warehouse_code: row.in_warehouse_code,
                        warehouse_name: row.in_warehouse_name,
                        sku_code: row.sku_code,
                        sku_name: row.sku_name,
                        batch_no: row.batch_no,
                        production_date: sourceLedger.production_date,
                        expiry_date: sourceLedger.expiry_date,
                        safety_qty: sourceLedger.safety_qty,
                        last_change_source: `TRANSFER_CREATE:${transferNo}`
                    });
                    db.biz.inventory_ledger.push(targetLedger);
                }

                const beforeTargetAvailable = toNum(targetLedger.available_qty, 0);
                adjustLedger(targetLedger, { total: toNum(row.qty, 0), available: toNum(row.qty, 0) });
                targetLedger.last_change_source = `TRANSFER_IN:${transferNo}`;

                appendInventoryTx(db, {
                    tx_type: 'TRANSFER_IN',
                    source_doc_type: 'TRANSFER',
                    source_doc_no: transferNo,
                    warehouse_code: targetLedger.warehouse_code,
                    warehouse_name: targetLedger.warehouse_name,
                    sku_code: targetLedger.sku_code,
                    sku_name: targetLedger.sku_name,
                    batch_no: targetLedger.batch_no,
                    qty: toNum(row.qty, 0),
                    before_available_qty: beforeTargetAvailable,
                    after_available_qty: toNum(targetLedger.available_qty, 0),
                    operator,
                    remark: '调拨调入确认'
                });

                row.status = 'DONE';
                row.inbound_confirm_by = operator;
                row.inbound_confirm_at = nowIso();
                row.updated_at = nowIso();
                appendTransferTrack(db, transferNo, 'DONE', operator, '调入完成');

                refreshWarnings(db);
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '调入确认失败');
        }

        apiOk(res, req, out, '调入确认成功');
    });

    app.post('/api/inventory-ops/transfers/:transferNo/cancel', authRequired, (req, res) => {
        const transferNo = normalize(req.params.transferNo);
        const body = req.body || {};
        const operator = req.user?.nickname || req.user?.username || '系统';
        let out = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const row = getTransferByNo(db, transferNo);
                if (!row) throw new Error('调拨单不存在');
                if (!['DRAFT', 'PENDING_REVIEW', 'APPROVED'].includes(String(row.status))) {
                    throw new Error('当前状态不可取消');
                }

                row.status = 'CANCELED';
                row.cancel_reason = normalize(body.reason) || '主动取消';
                row.cancelled_at = nowIso();
                row.updated_at = nowIso();
                appendTransferTrack(db, transferNo, 'CANCELED', operator, row.cancel_reason);
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '取消失败');
        }

        apiOk(res, req, out, '取消成功');
    });

    app.get('/api/inventory-ops/warnings/list', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);
        refreshWarnings(db);

        const {
            page = 1,
            pageSize = 20,
            type = '',
            level = '',
            status = '',
            keyword = ''
        } = req.query || {};

        let rows = arr(db.biz.inventory_warnings).map((row) => ({ ...row }));
        if (type) rows = rows.filter((row) => String(row.type) === String(type));
        if (level) rows = rows.filter((row) => String(row.level) === String(level));
        if (status) rows = rows.filter((row) => String(row.status) === String(status));
        if (keyword) {
            rows = rows.filter((row) => (
                contains(row.warehouse_name, keyword)
                || contains(row.sku_name, keyword)
                || contains(row.batch_no, keyword)
                || contains(row.message, keyword)
            ));
        }

        rows = rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.post('/api/inventory-ops/warnings/:id/handle', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const body = req.body || {};
        const nextStatus = normalize(body.status || body.action).toUpperCase();
        if (!WARNING_STATUS.includes(nextStatus)) return apiErr(res, req, 400, '处理状态不支持');

        const operator = req.user?.nickname || req.user?.username || '系统';
        let out = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const row = arr(db.biz.inventory_warnings).find((item) => Number(item.id) === id);
                if (!row) throw new Error('预警记录不存在');

                row.status = nextStatus;
                row.handled_by = operator;
                row.handle_comment = normalize(body.comment || row.handle_comment);
                if (nextStatus === 'CLOSED') row.handled_at = nowIso();
                row.updated_at = nowIso();
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '处理失败');
        }

        apiOk(res, req, out, '处理成功');
    });
    app.get('/api/inventory-ops/capabilities/list', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);

        const { page = 1, pageSize = 20, warehouseCode = '', keyword = '' } = req.query || {};

        let rows = arr(db.biz.warehouse_capabilities).map((row) => ({ ...row }));
        if (warehouseCode) rows = rows.filter((row) => String(row.warehouse_code) === String(warehouseCode));
        if (keyword) {
            rows = rows.filter((row) => (
                contains(row.warehouse_code, keyword)
                || contains(row.warehouse_name, keyword)
                || arr(row.service_regions).some((name) => contains(name, keyword))
            ));
        }

        rows = rows.sort((a, b) => String(a.warehouse_code).localeCompare(String(b.warehouse_code)));
        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.put('/api/inventory-ops/capabilities/:id', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const body = req.body || {};
        const operator = req.user?.nickname || req.user?.username || '系统';
        let out = null;

        try {
            updateDb((db) => {
                ensureInventoryOpsStructures(db);
                const row = arr(db.biz.warehouse_capabilities).find((item) => Number(item.id) === id);
                if (!row) throw new Error('仓配能力记录不存在');

                if (body.service_regions !== undefined) {
                    row.service_regions = Array.isArray(body.service_regions)
                        ? body.service_regions.map((item) => normalize(item)).filter(Boolean)
                        : normalize(body.service_regions).split(',').map((item) => normalize(item)).filter(Boolean);
                }
                if (body.daily_capacity !== undefined) row.daily_capacity = Math.max(0, toNum(body.daily_capacity, row.daily_capacity));
                if (body.processing_capacity !== undefined) row.processing_capacity = Math.max(0, toNum(body.processing_capacity, row.processing_capacity));
                if (body.delivery_ttl_hours !== undefined) row.delivery_ttl_hours = Math.max(1, toNum(body.delivery_ttl_hours, row.delivery_ttl_hours));
                if (body.supported_skus !== undefined) {
                    row.supported_skus = Array.isArray(body.supported_skus)
                        ? body.supported_skus.map((item) => normalize(item)).filter(Boolean)
                        : normalize(body.supported_skus).split(',').map((item) => normalize(item)).filter(Boolean);
                }
                if (body.supported_categories !== undefined) {
                    row.supported_categories = Array.isArray(body.supported_categories)
                        ? body.supported_categories.map((item) => normalize(item)).filter(Boolean)
                        : normalize(body.supported_categories).split(',').map((item) => normalize(item)).filter(Boolean);
                }

                row.updated_by = operator;
                row.updated_at = nowIso();
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '更新失败');
        }

        apiOk(res, req, out, '更新成功');
    });

    app.get('/api/inventory-ops/locks/list', authRequired, (req, res) => {
        const db = readDb();
        ensureInventoryOpsStructures(db);

        const {
            page = 1,
            pageSize = 20,
            orderNo = '',
            warehouseCode = '',
            skuCode = '',
            status = '',
            keyword = ''
        } = req.query || {};

        let rows = arr(db.biz.inventory_locks).map((row) => ({ ...row }));
        if (orderNo) rows = rows.filter((row) => String(row.order_no) === String(orderNo));
        if (warehouseCode) rows = rows.filter((row) => String(row.warehouse_code) === String(warehouseCode));
        if (skuCode) rows = rows.filter((row) => String(row.sku_code) === String(skuCode));
        if (status) rows = rows.filter((row) => String(row.status) === String(status));
        if (keyword) {
            rows = rows.filter((row) => (
                contains(row.order_no, keyword)
                || contains(row.sku_name, keyword)
                || contains(row.batch_no, keyword)
                || contains(row.warehouse_name, keyword)
            ));
        }

        rows = rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.post('/api/inventory-ops/locks/release-order', authRequired, (req, res) => {
        const body = req.body || {};
        const orderNo = normalize(body.order_no);
        if (!orderNo) return apiErr(res, req, 400, 'order_no不能为空');

        const operator = req.user?.nickname || req.user?.username || '系统';

        updateDb((db) => {
            ensureInventoryOpsStructures(db);
            releaseOrderLocks(db, orderNo, operator, normalize(body.reason) || 'MANUAL_RELEASE');
        });

        apiOk(res, req, { order_no: orderNo }, '释放成功');
    });
};

module.exports = {
    registerInventoryOpsRoutes,
    ensureInventoryOpsStructures,
    synchronizeOrderLocks,
    releaseOrderLocks
};
