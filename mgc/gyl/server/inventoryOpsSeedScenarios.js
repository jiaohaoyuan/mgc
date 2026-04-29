const { nextId } = require('./localDb');
const { ensureInventoryOpsStructures, releaseOrderLocks } = require('./inventoryOps');

const toNum = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
};
const uniq = (list) => [...new Set((list || []).filter(Boolean))];
const dateText = (value) => String(value || '').slice(0, 10);

const buildClock = () => {
    const d0 = new Date(Date.UTC(2026, 3, 10, 1, 30, 0));
    const iso = (dd = 0, h = 9, m = 0) => {
        const d = new Date(d0.getTime());
        d.setUTCDate(d.getUTCDate() + dd);
        d.setUTCHours(h - 8, m, 0, 0);
        return d.toISOString();
    };
    const day = (dd = 0) => iso(dd, 8, 0).slice(0, 10);
    const add = (dayString, offset) => {
        const d = new Date(`${dayString}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
    };
    return { iso, day, add, now: day(0) };
};

const family = (skuCode = '') => {
    if (skuCode.startsWith('SKU-UHT-')) return 'UHT';
    if (skuCode.startsWith('SKU-FRM-')) return 'FRESH';
    if (skuCode.startsWith('SKU-YOG-') || skuCode.startsWith('SKU-DRK-')) return 'YOGURT';
    if (skuCode.startsWith('SKU-PWD-')) return 'POWDER';
    if (skuCode.startsWith('SKU-CHS-')) return 'CHEESE';
    return 'OTHER';
};

const regionOfWarehouse = (warehouse = {}) => {
    const text = `${warehouse.province_name || ''}${warehouse.city_name || ''}`;
    if (/上海|江苏|浙江|安徽/.test(text)) return '华东';
    if (/广东|广西|福建|海南/.test(text)) return '华南';
    if (/湖北|河南|湖南|江西/.test(text)) return '华中';
    if (/四川|重庆|云南|贵州/.test(text)) return '西南';
    if (/陕西|甘肃|宁夏|青海|新疆|西藏/.test(text)) return '西北';
    if (/辽宁|吉林|黑龙江/.test(text)) return '东北';
    return '华北';
};

const factors = (warehouse = {}) => {
    const type = Number(warehouse.warehouse_type);
    if (type === 1) return { distance_factor: 0.76, cost_factor: 0.95, priority_factor: 0.88 };
    if (type === 2) return { distance_factor: 0.91, cost_factor: 0.9, priority_factor: 0.93 };
    return { distance_factor: 0.97, cost_factor: 0.82, priority_factor: 0.96 };
};

const calcRemainingDays = (expiryDate, now) => {
    if (!expiryDate) return 0;
    const diff = new Date(`${dateText(expiryDate)}T00:00:00Z`).getTime() - new Date(`${now}T00:00:00Z`).getTime();
    return Math.floor(diff / 86400000);
};

const enrichInventoryOpsRealistic = (db, options = {}) => {
    ensureInventoryOpsStructures(db);

    db.platform = db.platform || {};
    db.platform.operation_logs = Array.isArray(db.platform.operation_logs) ? db.platform.operation_logs : [];
    db.platform.notifications = Array.isArray(db.platform.notifications) ? db.platform.notifications : [];
    db.platform.export_tasks = Array.isArray(db.platform.export_tasks) ? db.platform.export_tasks : [];
    db.platform.task_runs = Array.isArray(db.platform.task_runs) ? db.platform.task_runs : [];

    const clock = buildClock();
    const iso = typeof options.iso === 'function' ? options.iso : clock.iso;
    const add = typeof options.add === 'function' ? options.add : clock.add;
    const now = options.now || clock.now;
    const addOrder = typeof options.addOrder === 'function' ? options.addOrder : null;

    const whMap = new Map((db.master.warehouse || []).filter((row) => Number(row.status) === 1).map((row) => [String(row.warehouse_code), row]));
    const skuMap = new Map((db.master.sku || []).filter((row) => Number(row.status) === 1).map((row) => [String(row.sku_code), row]));
    const accountMap = new Map((db.system?.accounts || []).map((row) => [String(row.nick_name), row]));

    const batchNo = (warehouseCode, skuCode, productionDate) => `${warehouseCode}-${skuCode}-${String(productionDate || '').replace(/-/g, '')}`;
    const accountId = (name) => Number(accountMap.get(String(name))?.id || 0);

    const touchLedger = (row, source = row.last_change_source || '') => {
        row.remaining_days = calcRemainingDays(row.expiry_date, now);
        row.near_expiry_flag = row.remaining_days <= 7 ? 1 : 0;
        row.unsellable_flag = row.remaining_days <= 0 ? 1 : 0;
        if (source) row.last_change_source = source;
        row.updated_at = iso();
    };

    const findLedger = (warehouseCode, skuCode, batch = '') => (db.biz.inventory_ledger || []).find((row) => (
        String(row.warehouse_code) === String(warehouseCode)
        && String(row.sku_code) === String(skuCode)
        && (!batch || String(row.batch_no) === String(batch))
    ));

    const ensureLedger = (payload = {}) => {
        let row = findLedger(payload.warehouse_code, payload.sku_code, payload.batch_no || '');
        if (!row) {
            row = {
                id: nextId(db.biz.inventory_ledger),
                warehouse_code: payload.warehouse_code,
                warehouse_name: payload.warehouse_name || whMap.get(String(payload.warehouse_code))?.warehouse_name || payload.warehouse_code,
                sku_code: payload.sku_code,
                sku_name: payload.sku_name || skuMap.get(String(payload.sku_code))?.sku_name || payload.sku_code,
                batch_no: payload.batch_no || batchNo(payload.warehouse_code, payload.sku_code, payload.production_date),
                production_date: payload.production_date || now,
                expiry_date: payload.expiry_date || now,
                remaining_days: 0,
                total_qty: 0,
                available_qty: 0,
                locked_qty: 0,
                in_transit_qty: 0,
                safety_qty: toNum(payload.safety_qty, 0),
                near_expiry_flag: 0,
                unsellable_flag: 0,
                last_change_source: payload.last_change_source || '',
                updated_at: iso()
            };
            db.biz.inventory_ledger.push(row);
        }
        if (payload.warehouse_name) row.warehouse_name = payload.warehouse_name;
        if (payload.sku_name) row.sku_name = payload.sku_name;
        if (payload.production_date) row.production_date = payload.production_date;
        if (payload.expiry_date) row.expiry_date = payload.expiry_date;
        if (payload.safety_qty !== undefined) row.safety_qty = toNum(payload.safety_qty, row.safety_qty);
        touchLedger(row, payload.last_change_source || row.last_change_source);
        return row;
    };

    const adjustLedger = (row, diff = {}, source = '') => {
        row.total_qty = Math.max(0, toNum(row.total_qty, 0) + toNum(diff.total, 0));
        row.available_qty = Math.max(0, toNum(row.available_qty, 0) + toNum(diff.available, 0));
        row.locked_qty = Math.max(0, toNum(row.locked_qty, 0) + toNum(diff.locked, 0));
        row.in_transit_qty = Math.max(0, toNum(row.in_transit_qty, 0) + toNum(diff.transit, 0));
        const occupied = toNum(row.available_qty, 0) + toNum(row.locked_qty, 0) + toNum(row.in_transit_qty, 0);
        if (toNum(row.total_qty, 0) < occupied) row.total_qty = occupied;
        touchLedger(row, source);
    };

    const appendTx = (payload = {}) => {
        db.biz.inventory_transactions.push({
            id: nextId(db.biz.inventory_transactions),
            tx_type: payload.tx_type,
            source_doc_type: payload.source_doc_type || '',
            source_doc_no: payload.source_doc_no || '',
            warehouse_code: payload.warehouse_code,
            warehouse_name: payload.warehouse_name || whMap.get(String(payload.warehouse_code))?.warehouse_name || payload.warehouse_code,
            sku_code: payload.sku_code,
            sku_name: payload.sku_name || skuMap.get(String(payload.sku_code))?.sku_name || payload.sku_code,
            batch_no: payload.batch_no || '',
            qty: toNum(payload.qty, 0),
            before_available_qty: toNum(payload.before_available_qty, 0),
            after_available_qty: toNum(payload.after_available_qty, 0),
            operator: payload.operator || '系统',
            biz_time: payload.biz_time || iso(),
            remark: payload.remark || ''
        });
    };

    const appendTrack = (payload = {}) => {
        db.biz.transfer_tracks.push({
            id: nextId(db.biz.transfer_tracks),
            transfer_no: payload.transfer_no,
            status: payload.status,
            operator: payload.operator || '系统',
            comment: payload.comment || '',
            action_time: payload.action_time || iso()
        });
    };
    const seedPositiveLedger = (payload = {}) => {
        const row = ensureLedger(payload);
        const currentTotal = toNum(row.total_qty, 0) + toNum(row.available_qty, 0) + toNum(row.locked_qty, 0) + toNum(row.in_transit_qty, 0);
        const qty = toNum(payload.qty, 0);
        if (currentTotal === 0 && qty > 0) {
            adjustLedger(row, { total: qty, available: qty }, payload.last_change_source || 'SCENE_INIT');
            appendTx({
                tx_type: 'INBOUND',
                source_doc_type: payload.source_doc_type || 'SCENE',
                source_doc_no: payload.source_doc_no || '',
                warehouse_code: row.warehouse_code,
                warehouse_name: row.warehouse_name,
                sku_code: row.sku_code,
                sku_name: row.sku_name,
                batch_no: row.batch_no,
                qty,
                before_available_qty: 0,
                after_available_qty: row.available_qty,
                operator: payload.operator || '系统初始化',
                biz_time: payload.biz_time || iso(),
                remark: payload.remark || '场景补数入账'
            });
        }
        return row;
    };

    const createTransfer = (payload = {}) => {
        const row = {
            id: nextId(db.biz.transfer_orders),
            transfer_no: payload.transfer_no,
            out_warehouse_code: payload.out_warehouse_code,
            out_warehouse_name: payload.out_warehouse_name || whMap.get(String(payload.out_warehouse_code))?.warehouse_name || payload.out_warehouse_code,
            in_warehouse_code: payload.in_warehouse_code,
            in_warehouse_name: payload.in_warehouse_name || whMap.get(String(payload.in_warehouse_code))?.warehouse_name || payload.in_warehouse_code,
            sku_code: payload.sku_code,
            sku_name: payload.sku_name || skuMap.get(String(payload.sku_code))?.sku_name || payload.sku_code,
            batch_no: payload.batch_no || '',
            qty: toNum(payload.qty, 0),
            reason: payload.reason || '',
            status: payload.status || 'DRAFT',
            applicant: payload.applicant || '李强',
            applied_at: payload.applied_at || iso(),
            reviewer: payload.reviewer || '',
            review_comment: payload.review_comment || '',
            reviewed_at: payload.reviewed_at || '',
            outbound_confirm_by: payload.outbound_confirm_by || '',
            outbound_confirm_at: payload.outbound_confirm_at || '',
            inbound_confirm_by: payload.inbound_confirm_by || '',
            inbound_confirm_at: payload.inbound_confirm_at || '',
            cancel_reason: payload.cancel_reason || '',
            cancelled_at: payload.cancelled_at || '',
            updated_at: payload.updated_at || iso()
        };
        db.biz.transfer_orders.push(row);
        (payload.tracks || []).forEach((track) => appendTrack({ transfer_no: row.transfer_no, ...track }));
        return row;
    };

    const rebuildStock = () => {
        const grouped = new Map();
        db.biz.inventory_ledger.forEach((row) => {
            const key = `${row.warehouse_code}::${row.sku_code}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(row);
        });
        db.biz.inventory_stock = [...grouped.entries()].map(([key, rows], index) => {
            const warehouseCode = key.split('::')[0];
            const warehouse = whMap.get(String(warehouseCode)) || {};
            return {
                id: index + 1,
                warehouse_code: warehouseCode,
                warehouse_name: warehouse.warehouse_name || warehouseCode,
                sku_code: rows[0].sku_code,
                sku_name: rows[0].sku_name,
                total_qty: rows.reduce((sum, row) => sum + toNum(row.total_qty, 0), 0),
                available_qty: rows.reduce((sum, row) => sum + toNum(row.available_qty, 0), 0),
                locked_qty: rows.reduce((sum, row) => sum + toNum(row.locked_qty, 0), 0),
                in_transit_qty: rows.reduce((sum, row) => sum + toNum(row.in_transit_qty, 0), 0),
                safety_qty: Math.max(...rows.map((row) => toNum(row.safety_qty, 0)), 0),
                shelf_life_days_remaining: Math.min(...rows.map((row) => toNum(row.remaining_days, 0))),
                ...factors(warehouse),
                region_name: regionOfWarehouse(warehouse),
                updated_at: iso()
            };
        });
    };

    const rebuildWarnings = () => {
        const rows = [];
        const keys = new Set();
        db.biz.inventory_ledger.forEach((row) => {
            const available = toNum(row.available_qty, 0);
            const total = toNum(row.total_qty, 0);
            const safety = toNum(row.safety_qty, 0);
            const remaining = toNum(row.remaining_days, calcRemainingDays(row.expiry_date, now));
            const candidates = [
                available <= 0 ? { type: 'STOCKOUT', level: 'CRITICAL', message: '库存已缺货', related_qty: available } : null,
                available > 0 && safety > 0 && available < safety ? { type: 'LOW_STOCK', level: available < safety * 0.5 ? 'HIGH' : 'MEDIUM', message: '可用库存低于安全库存', related_qty: available } : null,
                safety > 0 && total > safety * 3.2 ? { type: 'OVER_STOCK', level: total > safety * 5 ? 'HIGH' : 'LOW', message: '库存高于安全库存上限', related_qty: total } : null,
                remaining <= 7 ? { type: 'NEAR_EXPIRY', level: remaining <= 2 ? 'CRITICAL' : 'HIGH', message: remaining <= 0 ? '库存已过期不可售' : '库存临期预警', related_qty: available } : null
            ].filter(Boolean);
            candidates.forEach((warning) => {
                const key = `${warning.type}:${row.warehouse_code}:${row.sku_code}:${row.batch_no}`;
                if (keys.has(key)) return;
                keys.add(key);
                rows.push({
                    id: nextId(rows),
                    type: warning.type,
                    level: warning.level,
                    status: 'OPEN',
                    warehouse_code: row.warehouse_code,
                    warehouse_name: row.warehouse_name,
                    sku_code: row.sku_code,
                    sku_name: row.sku_name,
                    batch_no: row.batch_no,
                    message: warning.message,
                    related_qty: warning.related_qty,
                    generated_at: iso(),
                    handled_by: '',
                    handled_at: '',
                    handle_comment: '',
                    updated_at: iso()
                });
            });
        });
        db.biz.inventory_warnings = rows;
    };

    const rebuildCapabilities = () => {
        db.biz.warehouse_capabilities = [...whMap.values()].map((warehouse, index) => ({
            id: index + 1,
            warehouse_code: warehouse.warehouse_code,
            warehouse_name: warehouse.warehouse_name,
            service_regions: uniq([warehouse.province_name, warehouse.city_name, regionOfWarehouse(warehouse)]),
            daily_capacity: Number(warehouse.warehouse_type) === 1 ? 6200 : (Number(warehouse.warehouse_type) === 2 ? 4200 : 2600),
            processing_capacity: Number(warehouse.warehouse_type) === 1 ? 5200 : (Number(warehouse.warehouse_type) === 2 ? 3400 : 1800),
            delivery_ttl_hours: Number(warehouse.warehouse_type) === 1 ? 24 : (Number(warehouse.warehouse_type) === 2 ? 18 : 8),
            supported_skus: db.biz.inventory_stock.filter((row) => String(row.warehouse_code) === String(warehouse.warehouse_code) && toNum(row.total_qty, 0) > 0).map((row) => row.sku_code),
            supported_categories: uniq(db.biz.inventory_stock.filter((row) => String(row.warehouse_code) === String(warehouse.warehouse_code) && toNum(row.total_qty, 0) > 0).map((row) => skuMap.get(String(row.sku_code))?.category_code).filter(Boolean)),
            updated_by: '库存场景补数',
            updated_at: iso()
        }));
    };

    const hqUht24 = findLedger('WH-HQ-HZ', 'SKU-UHT-UHT-250ML-24BX-PLN-001');
    const hqA2 = findLedger('WH-HQ-HZ', 'SKU-UHT-UHT-250ML-12BX-A2N-001');
    const hqPowder = findLedger('WH-HQ-HZ', 'SKU-PWD-PWD-800G-01CN-HPR-001');
    const suzhouUht = findLedger('WH-DC-SUZHOU', 'SKU-UHT-UHT-250ML-24BX-PLN-001');
    const northPowder = findLedger('WH-RDC-NORTH-TJ', 'SKU-PWD-PWD-800G-01CN-HPR-001');
    const eastUht1L = findLedger('WH-RDC-EAST-SH', 'SKU-UHT-UHT-1L-12BX-PLN-001');
    const changshaFresh = findLedger('WH-DC-CHANGSHA', 'SKU-FRM-PAS-950ML-01BT-PLN-001');

    const beijingA2 = seedPositiveLedger({
        warehouse_code: 'WH-DC-BEIJING',
        sku_code: 'SKU-UHT-UHT-250ML-12BX-A2N-001',
        production_date: add(now, -84),
        expiry_date: add(now, 96),
        batch_no: batchNo('WH-DC-BEIJING', 'SKU-UHT-UHT-250ML-12BX-A2N-001', add(now, -84)),
        safety_qty: 90,
        qty: 36,
        source_doc_type: 'PURCHASE',
        source_doc_no: 'PO202604010018',
        operator: '李强',
        biz_time: iso(-9, 8, 20),
        remark: '华北A2常温补货入仓',
        last_change_source: 'PO_RECEIPT:PO202604010018'
    });

    const shenzhenYog = seedPositiveLedger({
        warehouse_code: 'WH-DC-SHENZHEN',
        sku_code: 'SKU-YOG-CHL-200G-10CP-ZSG-001',
        production_date: add(now, -4),
        expiry_date: add(now, 17),
        batch_no: batchNo('WH-DC-SHENZHEN', 'SKU-YOG-CHL-200G-10CP-ZSG-001', add(now, -4)),
        safety_qty: 80,
        qty: 28,
        source_doc_type: 'PURCHASE',
        source_doc_no: 'PO202604080033',
        operator: '李强',
        biz_time: iso(-2, 7, 40),
        remark: '深圳低温酸奶到货入仓',
        last_change_source: 'PO_RECEIPT:PO202604080033'
    });
    const westCheese = seedPositiveLedger({
        warehouse_code: 'WH-RDC-WEST-CD',
        sku_code: 'SKU-CHS-CRM-180G-01BX-PLN-001',
        production_date: add(now, -115),
        expiry_date: add(now, 5),
        batch_no: batchNo('WH-RDC-WEST-CD', 'SKU-CHS-CRM-180G-01BX-PLN-001', add(now, -115)),
        safety_qty: 18,
        qty: 24,
        source_doc_type: 'PURCHASE',
        source_doc_no: 'PO202604030021',
        operator: '李强',
        biz_time: iso(-7, 16, 12),
        remark: '西南RDC奶油芝士到货入仓',
        last_change_source: 'PO_RECEIPT:PO202604030021'
    });

    const gzYogNew = seedPositiveLedger({
        warehouse_code: 'WH-RDC-SOUTH-GZ',
        sku_code: 'SKU-YOG-CHL-200G-10CP-ZSG-001',
        production_date: add(now, -1),
        expiry_date: add(now, 20),
        batch_no: batchNo('WH-RDC-SOUTH-GZ', 'SKU-YOG-CHL-200G-10CP-ZSG-001', add(now, -1)),
        safety_qty: 72,
        qty: 180,
        source_doc_type: 'PURCHASE',
        source_doc_no: 'PO202604090001',
        operator: '李强',
        biz_time: iso(-1, 7, 30),
        remark: '华南低温酸奶补货入仓',
        last_change_source: 'PO_RECEIPT:PO202604090001'
    });

    const qingdaoPowder = seedPositiveLedger({
        warehouse_code: 'WH-DC-QINGDAO',
        sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001',
        production_date: add(now, -152),
        expiry_date: add(now, 388),
        batch_no: batchNo('WH-DC-QINGDAO', 'SKU-PWD-PWD-800G-01CN-HPR-001', add(now, -152)),
        safety_qty: 42,
        qty: 18,
        source_doc_type: 'PURCHASE',
        source_doc_no: 'PO202603260019',
        operator: '李强',
        biz_time: iso(-15, 8, 46),
        remark: '青岛仓成人奶粉到货入仓',
        last_change_source: 'PO_RECEIPT:PO202603260019'
    });

    const foshanYog = seedPositiveLedger({
        warehouse_code: 'WH-DC-FOSHAN',
        sku_code: 'SKU-YOG-CHL-200G-10CP-ZSG-001',
        production_date: add(now, -5),
        expiry_date: add(now, 14),
        batch_no: batchNo('WH-DC-FOSHAN', 'SKU-YOG-CHL-200G-10CP-ZSG-001', add(now, -5)),
        safety_qty: 56,
        qty: 16,
        source_doc_type: 'PURCHASE',
        source_doc_no: 'PO202604070017',
        operator: '李强',
        biz_time: iso(-3, 7, 52),
        remark: '佛山低温酸奶到货入仓',
        last_change_source: 'PO_RECEIPT:PO202604070017'
    });

    const xianPowder = seedPositiveLedger({
        warehouse_code: 'WH-DC-XIAN',
        sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001',
        production_date: add(now, -148),
        expiry_date: add(now, 392),
        batch_no: batchNo('WH-DC-XIAN', 'SKU-PWD-PWD-800G-01CN-HPR-001', add(now, -148)),
        safety_qty: 36,
        qty: 12,
        source_doc_type: 'PURCHASE',
        source_doc_no: 'PO202603280024',
        operator: '李强',
        biz_time: iso(-13, 9, 6),
        remark: '西安仓成人奶粉到货入仓',
        last_change_source: 'PO_RECEIPT:PO202603280024'
    });

    if (suzhouUht && toNum(suzhouUht.available_qty, 0) >= 32) {
        const before = toNum(suzhouUht.available_qty, 0);
        adjustLedger(suzhouUht, { total: -32, available: -32 }, 'CYCLE_COUNT:CC202604090001');
        appendTx({
            tx_type: 'ADJUST',
            source_doc_type: 'CYCLE_COUNT',
            source_doc_no: 'CC202604090001',
            warehouse_code: suzhouUht.warehouse_code,
            warehouse_name: suzhouUht.warehouse_name,
            sku_code: suzhouUht.sku_code,
            sku_name: suzhouUht.sku_name,
            batch_no: suzhouUht.batch_no,
            qty: -32,
            before_available_qty: before,
            after_available_qty: suzhouUht.available_qty,
            operator: '李强',
            biz_time: iso(-1, 18, 20),
            remark: '月度盘点差异，实盘少32箱'
        });
    }

    if (shenzhenYog && toNum(shenzhenYog.available_qty, 0) >= 10) {
        const before = toNum(shenzhenYog.available_qty, 0);
        adjustLedger(shenzhenYog, { total: -10, available: -10 }, 'DAMAGE:DM202604090001');
        appendTx({
            tx_type: 'DAMAGE',
            source_doc_type: 'DAMAGE',
            source_doc_no: 'DM202604090001',
            warehouse_code: shenzhenYog.warehouse_code,
            warehouse_name: shenzhenYog.warehouse_name,
            sku_code: shenzhenYog.sku_code,
            sku_name: shenzhenYog.sku_name,
            batch_no: shenzhenYog.batch_no,
            qty: 10,
            before_available_qty: before,
            after_available_qty: shenzhenYog.available_qty,
            operator: '李强',
            biz_time: iso(-1, 9, 18),
            remark: '冷链温层异常报损10箱'
        });
    }

    if (addOrder && hqUht24 && toNum(hqUht24.available_qty, 0) >= 120) {
        const shipped = addOrder({
            order_no: 'SO202604090018',
            customer_code: 'RS-OWN-JD',
            order_source: 'MANUAL',
            doc_type: 'FORMAL',
            order_status: 'APPROVED',
            review_status: 'APPROVED',
            fulfillment_status: 'ALLOCATED',
            submitted_at: iso(-1, 12, 46),
            reviewed_at: iso(-1, 13, 5),
            reviewed_by: '林文超',
            review_comment: '线上波峰单优先释放',
            created_by: '陈建国',
            created_at: iso(-1, 12, 40),
            lines: [{ sku_code: 'SKU-UHT-UHT-250ML-24BX-PLN-001', order_qty: 120, suggested_warehouse_code: 'WH-HQ-HZ' }],
            audits: [
                { action: 'CREATE', comment: '京东波峰单创建', operator: '陈建国', created_at: iso(-1, 12, 40) },
                { action: 'SUBMIT', comment: '提交审核', operator: '陈建国', created_at: iso(-1, 12, 46) },
                { action: 'APPROVE', comment: '审核通过', operator: '林文超', created_at: iso(-1, 13, 5) }
            ],
            tracks: [
                { status: 'WAIT_ALLOCATE', operator: '陈建国', action_time: iso(-1, 12, 46), note: '订单提交审核' },
                { status: 'ALLOCATED', operator: '陈建国', action_time: iso(-1, 13, 20), note: '杭州总部仓承接履约' }
            ],
            alloc: [[{ warehouse_code: 'WH-HQ-HZ', qty: 120, reasons: ['总部中央仓现货充足', '京东自营全国订单统一履约'] }]],
            lock: false
        });
        shipped.header.fulfillment_status = 'SHIPPED';
        shipped.header.updated_at = iso(-1, 18, 35);
        db.biz.order_audit_records.push({ id: nextId(db.biz.order_audit_records), order_no: 'SO202604090018', action: 'SHIP', comment: '电商波峰单完成出库', operator: '李强', created_at: iso(-1, 18, 35) });
        db.biz.fulfillment_tracks.push({ id: nextId(db.biz.fulfillment_tracks), order_no: 'SO202604090018', status: 'PICKED', operator: '李强', action_time: iso(-1, 17, 55), note: '完成拣货复核' });
        db.biz.fulfillment_tracks.push({ id: nextId(db.biz.fulfillment_tracks), order_no: 'SO202604090018', status: 'SHIPPED', operator: '李强', action_time: iso(-1, 18, 35), note: '京东自营订单已出库' });

        const before = toNum(hqUht24.available_qty, 0);
        adjustLedger(hqUht24, { total: -120, available: -120 }, 'ORDER_OUTBOUND:SO202604090018');
        appendTx({
            tx_type: 'OUTBOUND',
            source_doc_type: 'ORDER',
            source_doc_no: 'SO202604090018',
            warehouse_code: hqUht24.warehouse_code,
            warehouse_name: hqUht24.warehouse_name,
            sku_code: hqUht24.sku_code,
            sku_name: hqUht24.sku_name,
            batch_no: hqUht24.batch_no,
            qty: 120,
            before_available_qty: before,
            after_available_qty: hqUht24.available_qty,
            operator: '李强',
            biz_time: iso(-1, 18, 35),
            remark: '京东自营订单出库'
        });
    }

    if (addOrder && beijingA2 && toNum(beijingA2.available_qty, 0) >= 24) {
        const canceled = addOrder({
            order_no: 'SO202604080017',
            customer_code: 'RS-NORTH-HY',
            order_source: 'MANUAL',
            doc_type: 'FORMAL',
            order_status: 'APPROVED',
            review_status: 'APPROVED',
            fulfillment_status: 'ALLOCATED',
            submitted_at: iso(-2, 13, 28),
            reviewed_at: iso(-2, 13, 42),
            reviewed_by: '林文超',
            review_comment: '华北临时补货订单',
            created_by: '陈建国',
            created_at: iso(-2, 13, 20),
            lines: [{ sku_code: 'SKU-UHT-UHT-250ML-12BX-A2N-001', order_qty: 24, suggested_warehouse_code: 'WH-DC-BEIJING' }],
            audits: [
                { action: 'CREATE', comment: '客户追单创建', operator: '陈建国', created_at: iso(-2, 13, 20) },
                { action: 'SUBMIT', comment: '提交审核', operator: '陈建国', created_at: iso(-2, 13, 28) },
                { action: 'APPROVE', comment: '审核通过', operator: '林文超', created_at: iso(-2, 13, 42) }
            ],
            tracks: [
                { status: 'WAIT_ALLOCATE', operator: '陈建国', action_time: iso(-2, 13, 28), note: '待分配' },
                { status: 'ALLOCATED', operator: '陈建国', action_time: iso(-2, 13, 55), note: '北京仓锁定24箱' }
            ],
            alloc: [[{ warehouse_code: 'WH-DC-BEIJING', qty: 24, reasons: ['北京仓小批量现货可用', '华北就近履约'] }]],
            lock: true
        });
        releaseOrderLocks(db, 'SO202604080017', '陈建国', '客户取消订单，释放锁定');
        canceled.header.order_status = 'CANCELED';
        canceled.header.fulfillment_status = 'CANCELED';
        canceled.header.updated_at = iso(-2, 15, 5);
        db.biz.order_audit_records.push({ id: nextId(db.biz.order_audit_records), order_no: 'SO202604080017', action: 'CANCEL', comment: '客户取消订单，释放锁定', operator: '陈建国', created_at: iso(-2, 15, 5) });
        db.biz.fulfillment_tracks.push({ id: nextId(db.biz.fulfillment_tracks), order_no: 'SO202604080017', status: 'CANCELED', operator: '陈建国', action_time: iso(-2, 15, 5), note: '客户取消，库存锁定已释放' });
    }

    if (gzYogNew) {
        createTransfer({
            transfer_no: 'TR202604090002',
            out_warehouse_code: 'WH-RDC-SOUTH-GZ',
            in_warehouse_code: 'WH-DC-SHENZHEN',
            sku_code: 'SKU-YOG-CHL-200G-10CP-ZSG-001',
            batch_no: gzYogNew.batch_no,
            qty: 90,
            reason: '深圳低温酸奶库存跌破安全值，申请同城补位',
            status: 'PENDING_REVIEW',
            applicant: '李强',
            applied_at: iso(-1, 10, 2),
            updated_at: iso(-1, 10, 8),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨单', action_time: iso(-1, 10, 2) },
                { status: 'PENDING_REVIEW', operator: '李强', comment: '提交供应链审核', action_time: iso(-1, 10, 8) }
            ]
        });
    }

    if (hqA2) {
        createTransfer({
            transfer_no: 'TR202604090003',
            out_warehouse_code: 'WH-HQ-HZ',
            in_warehouse_code: 'WH-DC-BEIJING',
            sku_code: 'SKU-UHT-UHT-250ML-12BX-A2N-001',
            batch_no: hqA2.batch_no,
            qty: 120,
            reason: '北京仓A2常温库存低于安全值，周末会员店促销前补货',
            status: 'APPROVED',
            applicant: '李强',
            applied_at: iso(-1, 13, 48),
            reviewer: '林文超',
            review_comment: '允许总部仓先补华北需求',
            reviewed_at: iso(-1, 14, 12),
            updated_at: iso(-1, 14, 12),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨单', action_time: iso(-1, 13, 48) },
                { status: 'PENDING_REVIEW', operator: '李强', comment: '提交审核', action_time: iso(-1, 13, 55) },
                { status: 'APPROVED', operator: '林文超', comment: '审核通过，待总部仓出库', action_time: iso(-1, 14, 12) }
            ]
        });
    }

    if (hqUht24 && toNum(hqUht24.available_qty, 0) >= 180) {
        createTransfer({
            transfer_no: 'TR202604090004',
            out_warehouse_code: 'WH-HQ-HZ',
            in_warehouse_code: 'WH-DC-SUZHOU',
            sku_code: 'SKU-UHT-UHT-250ML-24BX-PLN-001',
            batch_no: hqUht24.batch_no,
            qty: 180,
            reason: '华东电商次日达波峰备货，提前前置常温库存',
            status: 'OUTBOUND',
            applicant: '李强',
            applied_at: iso(-1, 14, 20),
            reviewer: '林文超',
            review_comment: '华东活动备货通过',
            reviewed_at: iso(-1, 14, 42),
            outbound_confirm_by: '李强',
            outbound_confirm_at: iso(-1, 16, 10),
            updated_at: iso(-1, 16, 10),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨单', action_time: iso(-1, 14, 20) },
                { status: 'PENDING_REVIEW', operator: '李强', comment: '提交审核', action_time: iso(-1, 14, 26) },
                { status: 'APPROVED', operator: '林文超', comment: '审核通过', action_time: iso(-1, 14, 42) },
                { status: 'OUTBOUND', operator: '李强', comment: '总部仓完成出库', action_time: iso(-1, 16, 10) }
            ]
        });
        const before = toNum(hqUht24.available_qty, 0);
        adjustLedger(hqUht24, { available: -180, transit: 180 }, 'TRANSFER_OUT:TR202604090004');
        appendTx({
            tx_type: 'TRANSFER_OUT',
            source_doc_type: 'TRANSFER',
            source_doc_no: 'TR202604090004',
            warehouse_code: hqUht24.warehouse_code,
            warehouse_name: hqUht24.warehouse_name,
            sku_code: hqUht24.sku_code,
            sku_name: hqUht24.sku_name,
            batch_no: hqUht24.batch_no,
            qty: 180,
            before_available_qty: before,
            after_available_qty: hqUht24.available_qty,
            operator: '李强',
            biz_time: iso(-1, 16, 10),
            remark: '华东波峰备货调出确认'
        });
    }

    if (westCheese) {
        createTransfer({
            transfer_no: 'TR202604090005',
            out_warehouse_code: 'WH-RDC-WEST-CD',
            in_warehouse_code: 'WH-DC-CHANGSHA',
            sku_code: 'SKU-CHS-CRM-180G-01BX-PLN-001',
            batch_no: westCheese.batch_no,
            qty: 18,
            reason: '原计划跨区补位长沙门店试吃活动',
            status: 'CANCELED',
            applicant: '李强',
            applied_at: iso(-1, 11, 12),
            reviewer: '林文超',
            review_comment: '临期批次不建议跨区调拨',
            reviewed_at: iso(-1, 11, 24),
            cancel_reason: '改为西南本地临促处理，避免跨区运输损耗',
            cancelled_at: iso(-1, 11, 26),
            updated_at: iso(-1, 11, 26),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨单', action_time: iso(-1, 11, 12) },
                { status: 'PENDING_REVIEW', operator: '李强', comment: '提交审核', action_time: iso(-1, 11, 18) },
                { status: 'CANCELED', operator: '林文超', comment: '临期批次取消跨区调拨', action_time: iso(-1, 11, 26) }
            ]
        });
    }

    if (hqPowder) {
        createTransfer({
            transfer_no: 'TR202604100001',
            out_warehouse_code: 'WH-HQ-HZ',
            in_warehouse_code: 'WH-DC-NANJING',
            sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001',
            batch_no: hqPowder.batch_no,
            qty: 60,
            reason: '华东会员日奶粉礼盒预热备货',
            status: 'DRAFT',
            applicant: '李强',
            applied_at: iso(0, 8, 42),
            updated_at: iso(0, 8, 42),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨草稿', action_time: iso(0, 8, 42) }
            ]
        });
    }

    if (northPowder && qingdaoPowder && toNum(northPowder.available_qty, 0) >= 48) {
        createTransfer({
            transfer_no: 'TR202604090006',
            out_warehouse_code: 'WH-RDC-NORTH-TJ',
            in_warehouse_code: 'WH-DC-QINGDAO',
            sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001',
            batch_no: northPowder.batch_no,
            qty: 48,
            reason: '青岛仓成人奶粉低库存，北区RDC紧急补位',
            status: 'DONE',
            applicant: '李强',
            applied_at: iso(-1, 8, 26),
            reviewer: '林文超',
            review_comment: '北区库存充足，可跨仓补位',
            reviewed_at: iso(-1, 8, 42),
            outbound_confirm_by: '李强',
            outbound_confirm_at: iso(-1, 9, 18),
            inbound_confirm_by: '李强',
            inbound_confirm_at: iso(-1, 17, 36),
            updated_at: iso(-1, 17, 36),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨单', action_time: iso(-1, 8, 26) },
                { status: 'PENDING_REVIEW', operator: '李强', comment: '提交审核', action_time: iso(-1, 8, 30) },
                { status: 'APPROVED', operator: '林文超', comment: '审核通过', action_time: iso(-1, 8, 42) },
                { status: 'OUTBOUND', operator: '李强', comment: '天津RDC完成出库', action_time: iso(-1, 9, 18) },
                { status: 'DONE', operator: '李强', comment: '青岛仓已完成入库', action_time: iso(-1, 17, 36) }
            ]
        });

        const northBefore = toNum(northPowder.available_qty, 0);
        adjustLedger(northPowder, { available: -48, transit: 48 }, 'TRANSFER_OUT:TR202604090006');
        appendTx({
            tx_type: 'TRANSFER_OUT',
            source_doc_type: 'TRANSFER',
            source_doc_no: 'TR202604090006',
            warehouse_code: northPowder.warehouse_code,
            warehouse_name: northPowder.warehouse_name,
            sku_code: northPowder.sku_code,
            sku_name: northPowder.sku_name,
            batch_no: northPowder.batch_no,
            qty: 48,
            before_available_qty: northBefore,
            after_available_qty: northPowder.available_qty,
            operator: '李强',
            biz_time: iso(-1, 9, 18),
            remark: '青岛成人奶粉补位调出'
        });
        adjustLedger(northPowder, { total: -48, transit: -48 }, 'TRANSFER_DONE:TR202604090006');

        const qingdaoTransferBatch = ensureLedger({
            warehouse_code: 'WH-DC-QINGDAO',
            sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001',
            batch_no: northPowder.batch_no,
            production_date: northPowder.production_date,
            expiry_date: northPowder.expiry_date,
            safety_qty: qingdaoPowder.safety_qty,
            last_change_source: 'TRANSFER_CREATE:TR202604090006'
        });
        const qingdaoBefore = toNum(qingdaoTransferBatch.available_qty, 0);
        adjustLedger(qingdaoTransferBatch, { total: 48, available: 48 }, 'TRANSFER_IN:TR202604090006');
        appendTx({
            tx_type: 'TRANSFER_IN',
            source_doc_type: 'TRANSFER',
            source_doc_no: 'TR202604090006',
            warehouse_code: qingdaoTransferBatch.warehouse_code,
            warehouse_name: qingdaoTransferBatch.warehouse_name,
            sku_code: qingdaoTransferBatch.sku_code,
            sku_name: qingdaoTransferBatch.sku_name,
            batch_no: qingdaoTransferBatch.batch_no,
            qty: 48,
            before_available_qty: qingdaoBefore,
            after_available_qty: qingdaoTransferBatch.available_qty,
            operator: '李强',
            biz_time: iso(-1, 17, 36),
            remark: '青岛成人奶粉补位调入'
        });
    }

    if (gzYogNew && foshanYog) {
        createTransfer({
            transfer_no: 'TR202604090007',
            out_warehouse_code: 'WH-RDC-SOUTH-GZ',
            in_warehouse_code: 'WH-DC-FOSHAN',
            sku_code: 'SKU-YOG-CHL-200G-10CP-ZSG-001',
            batch_no: gzYogNew.batch_no,
            qty: 72,
            reason: '佛山便利系统周末促销，低温酸奶需提前前置',
            status: 'APPROVED',
            applicant: '李强',
            applied_at: iso(-1, 15, 6),
            reviewer: '林文超',
            review_comment: '佛山活动门店数增长，允许补位',
            reviewed_at: iso(-1, 15, 28),
            updated_at: iso(-1, 15, 28),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨单', action_time: iso(-1, 15, 6) },
                { status: 'PENDING_REVIEW', operator: '李强', comment: '提交审核', action_time: iso(-1, 15, 12) },
                { status: 'APPROVED', operator: '林文超', comment: '审核通过，待广州RDC出库', action_time: iso(-1, 15, 28) }
            ]
        });
    }

    if (hqPowder && xianPowder) {
        createTransfer({
            transfer_no: 'TR202604100002',
            out_warehouse_code: 'WH-HQ-HZ',
            in_warehouse_code: 'WH-DC-XIAN',
            sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001',
            batch_no: hqPowder.batch_no,
            qty: 54,
            reason: '西安仓会员店团购奶粉备货，申请总部补位',
            status: 'PENDING_REVIEW',
            applicant: '李强',
            applied_at: iso(0, 8, 56),
            updated_at: iso(0, 9, 4),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '创建调拨单', action_time: iso(0, 8, 56) },
                { status: 'PENDING_REVIEW', operator: '李强', comment: '提交供应链审核', action_time: iso(0, 9, 4) }
            ]
        });
    }

    if (eastUht1L) {
        createTransfer({
            transfer_no: 'TR202604100003',
            out_warehouse_code: 'WH-RDC-EAST-SH',
            in_warehouse_code: 'WH-DC-NANJING',
            sku_code: 'SKU-UHT-UHT-1L-12BX-PLN-001',
            batch_no: eastUht1L.batch_no,
            qty: 96,
            reason: '华东直播预热场次增加，先建草稿调拨单评估库存前置',
            status: 'DRAFT',
            applicant: '李强',
            applied_at: iso(0, 9, 18),
            updated_at: iso(0, 9, 18),
            tracks: [
                { status: 'DRAFT', operator: '李强', comment: '直播预热备货草稿', action_time: iso(0, 9, 18) }
            ]
        });
    }

    if (addOrder && qingdaoPowder) {
        addOrder({
            order_no: 'SO202604100006',
            customer_code: 'RS-NORTH-QD',
            order_source: 'MANUAL',
            doc_type: 'FORMAL',
            order_status: 'APPROVED',
            review_status: 'APPROVED',
            fulfillment_status: 'ALLOCATED',
            submitted_at: iso(0, 9, 36),
            reviewed_at: iso(0, 9, 48),
            reviewed_by: '林文超',
            review_comment: '青岛门店促销保供',
            created_by: '陈建国',
            created_at: iso(0, 9, 28),
            lines: [{ sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001', order_qty: 24, suggested_warehouse_code: 'WH-DC-QINGDAO' }],
            audits: [
                { action: 'CREATE', comment: '门店周末促销加单', operator: '陈建国', created_at: iso(0, 9, 28) },
                { action: 'SUBMIT', comment: '提交审核', operator: '陈建国', created_at: iso(0, 9, 36) },
                { action: 'APPROVE', comment: '审核通过', operator: '林文超', created_at: iso(0, 9, 48) }
            ],
            tracks: [
                { status: 'WAIT_ALLOCATE', operator: '陈建国', action_time: iso(0, 9, 36), note: '待分配' },
                { status: 'ALLOCATED', operator: '陈建国', action_time: iso(0, 10, 2), note: '青岛仓已锁定24罐' }
            ],
            alloc: [[{ warehouse_code: 'WH-DC-QINGDAO', qty: 24, reasons: ['北区调拨已到仓', '周末促销门店保供'] }]],
            lock: true
        });
    }

    if (addOrder && changshaFresh && toNum(changshaFresh.available_qty, 0) >= 36) {
        addOrder({
            order_no: 'SO202604100007',
            customer_code: 'RS-CENTRAL-XY',
            order_source: 'MANUAL',
            doc_type: 'FORMAL',
            order_status: 'APPROVED',
            review_status: 'APPROVED',
            fulfillment_status: 'ALLOCATED',
            submitted_at: iso(0, 10, 6),
            reviewed_at: iso(0, 10, 16),
            reviewed_by: '林文超',
            review_comment: '长沙门店鲜奶补货加急履约',
            created_by: '陈建国',
            created_at: iso(0, 9, 58),
            lines: [{ sku_code: 'SKU-FRM-PAS-950ML-01BT-PLN-001', order_qty: 36, suggested_warehouse_code: 'WH-DC-CHANGSHA' }],
            audits: [
                { action: 'CREATE', comment: '长沙门店鲜奶追单', operator: '陈建国', created_at: iso(0, 9, 58) },
                { action: 'SUBMIT', comment: '提交审核', operator: '陈建国', created_at: iso(0, 10, 6) },
                { action: 'APPROVE', comment: '审核通过', operator: '林文超', created_at: iso(0, 10, 16) }
            ],
            tracks: [
                { status: 'WAIT_ALLOCATE', operator: '陈建国', action_time: iso(0, 10, 6), note: '待分配' },
                { status: 'ALLOCATED', operator: '陈建国', action_time: iso(0, 10, 20), note: '长沙仓已锁定36箱鲜奶' }
            ],
            alloc: [[{ warehouse_code: 'WH-DC-CHANGSHA', qty: 36, reasons: ['本地仓临期鲜奶优先出库', '门店加急订单优先'] }]],
            lock: true
        });
    }

    if (addOrder && westCheese && toNum(westCheese.available_qty, 0) >= 12) {
        const canceledCheese = addOrder({
            order_no: 'SO202604090019',
            customer_code: 'RS-WEST-YM',
            order_source: 'MANUAL',
            doc_type: 'FORMAL',
            order_status: 'APPROVED',
            review_status: 'APPROVED',
            fulfillment_status: 'ALLOCATED',
            submitted_at: iso(-1, 12, 18),
            reviewed_at: iso(-1, 12, 26),
            reviewed_by: '林文超',
            review_comment: '西南门店试吃活动临时加单',
            created_by: '陈建国',
            created_at: iso(-1, 12, 10),
            lines: [{ sku_code: 'SKU-CHS-CRM-180G-01BX-PLN-001', order_qty: 12, suggested_warehouse_code: 'WH-RDC-WEST-CD' }],
            audits: [
                { action: 'CREATE', comment: '试吃活动临时加单', operator: '陈建国', created_at: iso(-1, 12, 10) },
                { action: 'SUBMIT', comment: '提交审核', operator: '陈建国', created_at: iso(-1, 12, 18) },
                { action: 'APPROVE', comment: '审核通过', operator: '林文超', created_at: iso(-1, 12, 26) }
            ],
            tracks: [
                { status: 'WAIT_ALLOCATE', operator: '陈建国', action_time: iso(-1, 12, 18), note: '待分配' },
                { status: 'ALLOCATED', operator: '陈建国', action_time: iso(-1, 12, 32), note: '西南RDC已锁定12盒奶酪' }
            ],
            alloc: [[{ warehouse_code: 'WH-RDC-WEST-CD', qty: 12, reasons: ['西南本地库存临期优先处置', '活动试吃需求'] }]],
            lock: true
        });
        releaseOrderLocks(db, 'SO202604090019', '陈建国', '门店试吃活动取消，释放锁定');
        canceledCheese.header.order_status = 'CANCELED';
        canceledCheese.header.fulfillment_status = 'CANCELED';
        canceledCheese.header.updated_at = iso(-1, 13, 4);
        db.biz.order_audit_records.push({ id: nextId(db.biz.order_audit_records), order_no: 'SO202604090019', action: 'CANCEL', comment: '门店试吃活动取消，释放锁定', operator: '陈建国', created_at: iso(-1, 13, 4) });
        db.biz.fulfillment_tracks.push({ id: nextId(db.biz.fulfillment_tracks), order_no: 'SO202604090019', status: 'CANCELED', operator: '陈建国', action_time: iso(-1, 13, 4), note: '活动取消，库存锁定已释放' });
    }

    const shippedOrder = db.biz.order_headers.find((row) => String(row.order_no) === 'SO202604090018');
    if (shippedOrder) {
        shippedOrder.fulfillment_status = 'SHIPPED';
        shippedOrder.current_allocation_version = 1;
        shippedOrder.updated_at = iso(-1, 18, 35);
    }

    rebuildStock();
    rebuildWarnings();
    rebuildCapabilities();

    const markWarning = (predicate, patch = {}) => {
        const row = db.biz.inventory_warnings.find(predicate);
        if (!row) return;
        Object.assign(row, patch);
        row.updated_at = patch.updated_at || iso();
    };

    markWarning((row) => row.type === 'LOW_STOCK' && row.warehouse_code === 'WH-DC-SHENZHEN' && row.sku_code === 'SKU-YOG-CHL-200G-10CP-ZSG-001', {
        status: 'PROCESSING',
        handled_by: '李强',
        handled_at: iso(-1, 10, 12),
        handle_comment: '已提交调拨申请 TR202604090002，待供应链经理审核',
        updated_at: iso(-1, 10, 12)
    });
    markWarning((row) => row.type === 'LOW_STOCK' && row.warehouse_code === 'WH-DC-BEIJING' && row.sku_code === 'SKU-UHT-UHT-250ML-12BX-A2N-001', {
        status: 'PROCESSING',
        handled_by: '林文超',
        handled_at: iso(-1, 14, 15),
        handle_comment: '已审批调拨 TR202604090003，待总部仓出库',
        updated_at: iso(-1, 14, 15)
    });
    markWarning((row) => row.type === 'OVER_STOCK' && row.warehouse_code === 'WH-HQ-HZ' && row.sku_code === 'SKU-UHT-UHT-250ML-24BX-PLN-001', {
        status: 'PROCESSING',
        handled_by: '林文超',
        handled_at: iso(-1, 16, 15),
        handle_comment: '已通过直营网销出库和区域调拨分流库存',
        updated_at: iso(-1, 16, 15)
    });
    markWarning((row) => row.type === 'NEAR_EXPIRY' && row.warehouse_code === 'WH-RDC-WEST-CD' && row.sku_code === 'SKU-CHS-CRM-180G-01BX-PLN-001', {
        status: 'PROCESSING',
        handled_by: '李强',
        handled_at: iso(-1, 11, 30),
        handle_comment: '改为西南本地临促处理，跨区调拨单 TR202604090005 已取消',
        updated_at: iso(-1, 11, 30)
    });
    markWarning((row) => row.type === 'LOW_STOCK' && row.warehouse_code === 'WH-DC-FOSHAN' && row.sku_code === 'SKU-YOG-CHL-200G-10CP-ZSG-001', {
        status: 'PROCESSING',
        handled_by: '林文超',
        handled_at: iso(-1, 15, 30),
        handle_comment: '佛山活动备货调拨 TR202604090007 已审核通过，待广州RDC出库',
        updated_at: iso(-1, 15, 30)
    });
    markWarning((row) => row.type === 'LOW_STOCK' && row.warehouse_code === 'WH-DC-XIAN' && row.sku_code === 'SKU-PWD-PWD-800G-01CN-HPR-001', {
        status: 'PROCESSING',
        handled_by: '李强',
        handled_at: iso(0, 9, 6),
        handle_comment: '已提交调拨申请 TR202604100002，等待供应链审核',
        updated_at: iso(0, 9, 6)
    });
    markWarning((row) => row.type === 'NEAR_EXPIRY' && row.warehouse_code === 'WH-DC-CHANGSHA' && row.sku_code === 'SKU-FRM-PAS-950ML-01BT-PLN-001', {
        status: 'PROCESSING',
        handled_by: '李强',
        handled_at: iso(0, 10, 22),
        handle_comment: '长沙鲜奶急单 SO202604100007 已锁定，优先当日发运',
        updated_at: iso(0, 10, 22)
    });

    db.biz.inventory_warnings.push({
        id: nextId(db.biz.inventory_warnings),
        type: 'LOW_STOCK',
        level: 'HIGH',
        status: 'CLOSED',
        warehouse_code: 'WH-DC-ZHENGZHOU',
        warehouse_name: whMap.get('WH-DC-ZHENGZHOU')?.warehouse_name || '郑州城市分拨仓',
        sku_code: 'SKU-FRM-PAS-950ML-01BT-PLN-001',
        sku_name: skuMap.get('SKU-FRM-PAS-950ML-01BT-PLN-001')?.sku_name || '巴氏鲜奶950ml',
        batch_no: '',
        message: '华中鲜奶缺口已通过跨仓调拨补齐',
        related_qty: 80,
        generated_at: iso(-2, 9, 25),
        handled_by: '李强',
        handled_at: iso(-1, 6, 55),
        handle_comment: 'TR202604080001 已完成郑州仓入库，预警关闭',
        updated_at: iso(-1, 6, 55)
    });
    db.biz.inventory_warnings.push({
        id: nextId(db.biz.inventory_warnings),
        type: 'LOW_STOCK',
        level: 'HIGH',
        status: 'CLOSED',
        warehouse_code: 'WH-DC-QINGDAO',
        warehouse_name: whMap.get('WH-DC-QINGDAO')?.warehouse_name || '青岛城市分拨仓',
        sku_code: 'SKU-PWD-PWD-800G-01CN-HPR-001',
        sku_name: skuMap.get('SKU-PWD-PWD-800G-01CN-HPR-001')?.sku_name || '成人高蛋白奶粉800g',
        batch_no: '',
        message: '青岛仓成人奶粉低库存已通过北区调拨补齐',
        related_qty: 48,
        generated_at: iso(-1, 8, 24),
        handled_by: '李强',
        handled_at: iso(-1, 17, 36),
        handle_comment: 'TR202604090006 已完成青岛仓入库，预警关闭',
        updated_at: iso(-1, 17, 36)
    });
    db.biz.inventory_warnings
        .filter((row) => row.type === 'LOW_STOCK'
            && row.warehouse_code === 'WH-DC-QINGDAO'
            && row.sku_code === 'SKU-PWD-PWD-800G-01CN-HPR-001'
            && row.status === 'OPEN')
        .forEach((row) => {
            row.status = 'CLOSED';
            row.handled_by = '李强';
            row.handled_at = iso(-1, 17, 38);
            row.handle_comment = '北区调拨完成后按批次复核关闭低库存预警';
            row.updated_at = iso(-1, 17, 38);
        });

    const addLog = (payload = {}) => {
        db.platform.operation_logs.push({
            id: nextId(db.platform.operation_logs),
            log_type: 'BUSINESS',
            module_code: 'inventory-ops',
            biz_object_type: payload.biz_object_type,
            biz_object_id: payload.biz_object_id,
            action_type: payload.action_type,
            operator_id: payload.operator_id,
            operator_name: payload.operator_name,
            operator_roles: payload.operator_roles,
            operator_ip: payload.operator_ip || '10.8.4.22',
            user_agent: payload.user_agent || 'Chrome/122',
            request_path: payload.request_path,
            request_method: payload.request_method || 'POST',
            trace_id: payload.trace_id,
            result_status: 'SUCCESS',
            message: payload.message,
            request_summary: payload.request_summary || {},
            before_snapshot: payload.before_snapshot || null,
            after_snapshot: payload.after_snapshot || null,
            created_at: payload.created_at || iso()
        });
    };

    addLog({
        biz_object_type: 'inventory_adjust',
        biz_object_id: 'CC202604090001',
        action_type: 'ADJUST',
        operator_id: accountId('李强'),
        operator_name: '李强',
        operator_roles: ['仓配运营主管'],
        request_path: '/api/inventory-ops/transactions',
        trace_id: 'trace-inv-adjust-0001',
        message: '苏州仓常温奶盘点差异已调整',
        request_summary: { warehouse_code: 'WH-DC-SUZHOU', sku_code: 'SKU-UHT-UHT-250ML-24BX-PLN-001', qty: -32 },
        after_snapshot: { source_doc_no: 'CC202604090001' },
        created_at: iso(-1, 18, 20)
    });
    addLog({
        biz_object_type: 'inventory_damage',
        biz_object_id: 'DM202604090001',
        action_type: 'DAMAGE',
        operator_id: accountId('李强'),
        operator_name: '李强',
        operator_roles: ['仓配运营主管'],
        request_path: '/api/inventory-ops/transactions',
        trace_id: 'trace-inv-damage-0001',
        message: '深圳低温酸奶冷链异常报损已登记',
        request_summary: { warehouse_code: 'WH-DC-SHENZHEN', sku_code: 'SKU-YOG-CHL-200G-10CP-ZSG-001', qty: 10 },
        after_snapshot: { source_doc_no: 'DM202604090001' },
        created_at: iso(-1, 9, 18)
    });
    addLog({
        biz_object_type: 'transfer',
        biz_object_id: 'TR202604090004',
        action_type: 'OUTBOUND',
        operator_id: accountId('李强'),
        operator_name: '李强',
        operator_roles: ['仓配运营主管'],
        request_path: '/api/inventory-ops/transfers/TR202604090004/outbound',
        trace_id: 'trace-transfer-0004',
        message: '华东活动备货调拨已完成总部仓出库',
        request_summary: { transfer_no: 'TR202604090004' },
        after_snapshot: { status: 'OUTBOUND' },
        created_at: iso(-1, 16, 10)
    });
    addLog({
        biz_object_type: 'transfer',
        biz_object_id: 'TR202604090006',
        action_type: 'INBOUND',
        operator_id: accountId('李强'),
        operator_name: '李强',
        operator_roles: ['仓配运营主管'],
        request_path: '/api/inventory-ops/transfers/TR202604090006/inbound',
        trace_id: 'trace-transfer-0006',
        message: '青岛仓成人奶粉补位调拨已完成入库',
        request_summary: { transfer_no: 'TR202604090006' },
        after_snapshot: { status: 'DONE' },
        created_at: iso(-1, 17, 36)
    });
    addLog({
        biz_object_type: 'transfer',
        biz_object_id: 'TR202604090007',
        action_type: 'APPROVE',
        operator_id: accountId('林文超'),
        operator_name: '林文超',
        operator_roles: ['业务运营经理'],
        request_path: '/api/inventory-ops/transfers/TR202604090007/review',
        trace_id: 'trace-transfer-0007',
        message: '佛山酸奶活动备货调拨已审核通过',
        request_summary: { transfer_no: 'TR202604090007' },
        after_snapshot: { status: 'APPROVED' },
        created_at: iso(-1, 15, 28)
    });
    addLog({
        biz_object_type: 'order',
        biz_object_id: 'SO202604090019',
        action_type: 'UNFREEZE',
        operator_id: accountId('陈建国'),
        operator_name: '陈建国',
        operator_roles: ['业务运营经理'],
        request_path: '/api/inventory-ops/locks/release',
        trace_id: 'trace-lock-release-0002',
        message: '西南奶酪活动单取消后已释放锁定库存',
        request_summary: { order_no: 'SO202604090019' },
        after_snapshot: { status: 'RELEASED' },
        created_at: iso(-1, 13, 4)
    });

    const addNotice = (payload = {}) => {
        db.platform.notifications.push({
            id: nextId(db.platform.notifications),
            title: payload.title,
            content: payload.content,
            biz_type: payload.biz_type,
            biz_id: payload.biz_id,
            status: payload.status || 'UNREAD',
            receiver_id: payload.receiver_id || 0,
            receiver_name: payload.receiver_name || '',
            created_at: payload.created_at || iso()
        });
    };

    addNotice({
        title: '华南低温库存待审核',
        content: 'TR202604090002 已提交，深圳低温酸奶库存低于安全库存，请尽快审核。',
        biz_type: 'TRANSFER',
        biz_id: 'TR202604090002',
        receiver_id: accountId('林文超'),
        receiver_name: '林文超',
        created_at: iso(-1, 10, 14)
    });
    addNotice({
        title: '北京A2调拨待出库',
        content: 'TR202604090003 已审核通过，等待杭州总部仓出库执行。',
        biz_type: 'TRANSFER',
        biz_id: 'TR202604090003',
        receiver_id: accountId('李强'),
        receiver_name: '李强',
        created_at: iso(-1, 14, 18)
    });
    addNotice({
        title: '西南临期奶酪转本地处置',
        content: 'TR202604090005 已取消跨区调拨，改为西南本地临促清仓。',
        biz_type: 'TRANSFER',
        biz_id: 'TR202604090005',
        receiver_id: accountId('李强'),
        receiver_name: '李强',
        created_at: iso(-1, 11, 32)
    });
    addNotice({
        title: '青岛奶粉已补位到仓',
        content: 'TR202604090006 已完成入库，青岛仓成人奶粉可恢复正常履约。',
        biz_type: 'TRANSFER',
        biz_id: 'TR202604090006',
        receiver_id: accountId('李强'),
        receiver_name: '李强',
        status: 'READ',
        created_at: iso(-1, 17, 40)
    });
    addNotice({
        title: '佛山酸奶备货待出库',
        content: 'TR202604090007 已审核通过，请广州RDC尽快安排低温出库。',
        biz_type: 'TRANSFER',
        biz_id: 'TR202604090007',
        receiver_id: accountId('李强'),
        receiver_name: '李强',
        created_at: iso(-1, 15, 32)
    });
    addNotice({
        title: '西安奶粉补位待审核',
        content: 'TR202604100002 已提交，西安仓奶粉库存低于安全值，请尽快审核。',
        biz_type: 'TRANSFER',
        biz_id: 'TR202604100002',
        receiver_id: accountId('林文超'),
        receiver_name: '林文超',
        created_at: iso(0, 9, 8)
    });
    addNotice({
        title: '长沙鲜奶急单待发运',
        content: 'SO202604100007 已锁定36箱鲜奶，请优先安排当日冷链配送。',
        biz_type: 'ORDER',
        biz_id: 'SO202604100007',
        receiver_id: accountId('李强'),
        receiver_name: '李强',
        created_at: iso(0, 10, 24)
    });

    db.platform.export_tasks.forEach((task) => {
        if (String(task.biz_type) === 'INVENTORY_LEDGER') {
            task.total_count = db.biz.inventory_ledger.length;
            task.success_count = db.biz.inventory_ledger.length;
            task.result_payload = { ...(task.result_payload || {}), rows: db.biz.inventory_ledger.length };
        }
    });

    db.platform.export_tasks.push({
        id: nextId(db.platform.export_tasks),
        task_type: 'EXPORT',
        biz_type: 'TRANSFER_ORDERS',
        task_name: '仓配调拨监控导出',
        file_name: 'inventory_transfer_monitor_20260410.xlsx',
        operator_id: accountId('李强'),
        operator_name: '李强',
        request_path: '/api/inventory-ops/transfers/list',
        query_snapshot: { status: '', keyword: '' },
        status: 'SUCCESS',
        total_count: db.biz.transfer_orders.length,
        success_count: db.biz.transfer_orders.length,
        fail_count: 0,
        result_message: '调拨监控导出完成',
        result_payload: { rows: db.biz.transfer_orders.length },
        created_at: iso(0, 9, 12),
        finished_at: iso(0, 9, 13)
    });

    db.platform.task_runs.push({
        id: nextId(db.platform.task_runs),
        task_code: 'transfer_aging_watch',
        task_name: '调拨在途时效巡检',
        run_status: 'SUCCESS',
        last_run_at: iso(0, 9, 10),
        next_run_at: iso(0, 13, 0),
        remark: '识别1单调出中、2单待审核、2单待出库风险'
    });
};

module.exports = { enrichInventoryOpsRealistic };
