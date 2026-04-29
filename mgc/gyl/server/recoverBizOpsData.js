const { updateDb, nextId, nowIso, DB_FILE } = require('./localDb');
const { enrichInventoryOpsRealistic } = require('./inventoryOpsSeedScenarios');

const force = process.argv.includes('--force');

const toNum = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);
const dateText = (value) => String(value || '').slice(0, 10);

const addDays = (dayString, offsetDays) => {
    const d = new Date(`${dateText(dayString)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + toNum(offsetDays, 0));
    return d.toISOString().slice(0, 10);
};

const skuFamily = (skuCode = '') => {
    if (skuCode.startsWith('SKU-UHT-')) return 'UHT';
    if (skuCode.startsWith('SKU-FRM-')) return 'FRESH';
    if (skuCode.startsWith('SKU-YOG-') || skuCode.startsWith('SKU-DRK-')) return 'YOGURT';
    if (skuCode.startsWith('SKU-PWD-')) return 'POWDER';
    if (skuCode.startsWith('SKU-CHS-')) return 'CHEESE';
    return 'OTHER';
};

const FAMILY_PRICE = {
    UHT: 68,
    FRESH: 52,
    YOGURT: 61,
    POWDER: 138,
    CHEESE: 88,
    OTHER: 50
};

const ensureBizStructures = (db) => {
    db.biz = db.biz || {};
    db.platform = db.platform || {};
    db.system = db.system || {};
    db.master = db.master || {};

    db.biz.order_headers = ensureArray(db.biz.order_headers);
    db.biz.order_lines = ensureArray(db.biz.order_lines);
    db.biz.order_audit_records = ensureArray(db.biz.order_audit_records);
    db.biz.order_allocation_plans = ensureArray(db.biz.order_allocation_plans);
    db.biz.order_exceptions = ensureArray(db.biz.order_exceptions);
    db.biz.replenishment_suggestions = ensureArray(db.biz.replenishment_suggestions);
    db.biz.fulfillment_tracks = ensureArray(db.biz.fulfillment_tracks);
    db.biz.inventory_stock = ensureArray(db.biz.inventory_stock);
    db.biz.inventory_ledger = ensureArray(db.biz.inventory_ledger);
    db.biz.inventory_transactions = ensureArray(db.biz.inventory_transactions);
    db.biz.transfer_orders = ensureArray(db.biz.transfer_orders);
    db.biz.transfer_tracks = ensureArray(db.biz.transfer_tracks);
    db.biz.inventory_warnings = ensureArray(db.biz.inventory_warnings);
    db.biz.warehouse_capabilities = ensureArray(db.biz.warehouse_capabilities);
    db.biz.inventory_locks = ensureArray(db.biz.inventory_locks);
    if (!db.biz.order_allocation_weights || typeof db.biz.order_allocation_weights !== 'object') {
        db.biz.order_allocation_weights = {
            inventory_weight: 0.32,
            distance_weight: 0.22,
            freshness_weight: 0.2,
            cost_weight: 0.14,
            priority_weight: 0.12,
            updated_by: 'system',
            updated_at: nowIso()
        };
    }

    db.platform.workflow_todos = ensureArray(db.platform.workflow_todos);
    db.platform.workflow_approvals = ensureArray(db.platform.workflow_approvals);
    db.platform.workflow_messages = ensureArray(db.platform.workflow_messages);
    db.platform.workflow_tasks = ensureArray(db.platform.workflow_tasks);
    db.platform.workflow_timeout_rules = ensureArray(db.platform.workflow_timeout_rules);
    db.platform.workflow_reminders = ensureArray(db.platform.workflow_reminders);
};

let summary = {};

updateDb((db) => {
    ensureBizStructures(db);

    const now = nowIso().slice(0, 10);
    const skuMap = new Map(ensureArray(db.master.sku).map((row) => [String(row.sku_code), row]));
    const whMap = new Map(ensureArray(db.master.warehouse).map((row) => [String(row.warehouse_code), row]));
    const resellerMap = new Map(ensureArray(db.master.reseller).map((row) => [String(row.reseller_code), row]));

    const shouldSeedOrders = force || db.biz.order_headers.length === 0;
    const shouldSeedLedger = force || db.biz.inventory_ledger.length === 0;

    const upsertLedger = (warehouseCode, skuCode, qty, safetyQty, remainingDays) => {
        const existed = db.biz.inventory_ledger.find((row) =>
            String(row.warehouse_code) === String(warehouseCode) &&
            String(row.sku_code) === String(skuCode)
        );
        if (existed) return existed;

        const sku = skuMap.get(String(skuCode)) || {};
        const wh = whMap.get(String(warehouseCode)) || {};
        const shelfLife = Math.max(1, toNum(sku.shelf_life_days, 30));
        const remain = Math.max(1, toNum(remainingDays, 60));
        const expiryDate = addDays(now, remain);
        const productionDate = addDays(expiryDate, -shelfLife);
        const batchNo = `${warehouseCode}-${skuCode}-${productionDate.replace(/-/g, '')}`;

        const row = {
            id: nextId(db.biz.inventory_ledger),
            warehouse_code: warehouseCode,
            warehouse_name: wh.warehouse_name || warehouseCode,
            sku_code: skuCode,
            sku_name: sku.sku_name || skuCode,
            batch_no: batchNo,
            production_date: productionDate,
            expiry_date: expiryDate,
            remaining_days: remain,
            total_qty: toNum(qty, 0),
            available_qty: toNum(qty, 0),
            locked_qty: 0,
            in_transit_qty: 0,
            safety_qty: toNum(safetyQty, 0),
            near_expiry_flag: remain <= 7 ? 1 : 0,
            unsellable_flag: remain <= 0 ? 1 : 0,
            last_change_source: 'RECOVERY_INIT',
            updated_at: nowIso()
        };
        db.biz.inventory_ledger.push(row);
        db.biz.inventory_transactions.push({
            id: nextId(db.biz.inventory_transactions),
            tx_type: 'INBOUND',
            source_doc_type: 'RECOVERY',
            source_doc_no: `RECOVERY-${row.id}`,
            warehouse_code: row.warehouse_code,
            warehouse_name: row.warehouse_name,
            sku_code: row.sku_code,
            sku_name: row.sku_name,
            batch_no: row.batch_no,
            qty: row.total_qty,
            before_available_qty: 0,
            after_available_qty: row.available_qty,
            operator: 'system-recovery',
            biz_time: nowIso(),
            remark: 'Recovery script initialized inventory'
        });
        return row;
    };

    if (shouldSeedLedger) {
        upsertLedger('WH-HQ-HZ', 'SKU-UHT-UHT-250ML-24BX-PLN-001', 420, 120, 120);
        upsertLedger('WH-HQ-HZ', 'SKU-UHT-UHT-250ML-12BX-A2N-001', 220, 80, 100);
        upsertLedger('WH-HQ-HZ', 'SKU-PWD-PWD-800G-01CN-HPR-001', 160, 40, 360);
        upsertLedger('WH-DC-SUZHOU', 'SKU-UHT-UHT-250ML-24BX-PLN-001', 140, 48, 90);
        upsertLedger('WH-RDC-NORTH-TJ', 'SKU-PWD-PWD-800G-01CN-HPR-001', 90, 28, 420);
        upsertLedger('WH-RDC-EAST-SH', 'SKU-UHT-UHT-1L-12BX-PLN-001', 110, 36, 130);
        upsertLedger('WH-DC-CHANGSHA', 'SKU-FRM-PAS-950ML-01BT-PLN-001', 72, 28, 4);
    }

    const addOrder = (payload = {}) => {
        const orderNo = String(payload.order_no || '').trim();
        if (!orderNo) return { header: null, lines: [] };

        const existedHeader = db.biz.order_headers.find((row) => String(row.order_no) === orderNo);
        if (existedHeader) {
            const existedLines = db.biz.order_lines.filter((row) => String(row.order_no) === orderNo);
            return { header: existedHeader, lines: existedLines };
        }

        const reseller = resellerMap.get(String(payload.customer_code)) || {};
        const createdAt = payload.created_at || nowIso();
        const createdBy = payload.created_by || 'system-recovery';
        const header = {
            id: nextId(db.biz.order_headers),
            order_no: orderNo,
            customer_code: payload.customer_code || reseller.reseller_code || '',
            customer_name: reseller.reseller_name || payload.customer_code || '',
            channel_code: reseller.lv2_channel_code || '',
            channel_name: reseller.lv2_channel_name || '',
            region: reseller.sale_region_name || '',
            order_source: payload.order_source || 'MANUAL',
            doc_type: payload.doc_type || 'FORMAL',
            order_status: payload.order_status || 'APPROVED',
            review_status: payload.review_status || 'APPROVED',
            fulfillment_status: payload.fulfillment_status || 'WAIT_ALLOCATE',
            total_qty: 0,
            total_amount: 0,
            submitted_at: payload.submitted_at || createdAt,
            reviewed_at: payload.reviewed_at || createdAt,
            reviewed_by: payload.reviewed_by || 'system-recovery',
            review_comment: payload.review_comment || '',
            has_exception: 0,
            current_allocation_version: 0,
            created_by: createdBy,
            created_at: createdAt,
            updated_at: createdAt
        };
        db.biz.order_headers.push(header);

        const lines = ensureArray(payload.lines).map((line, idx) => {
            const skuCode = String(line.sku_code || '').trim();
            const sku = skuMap.get(skuCode) || {};
            const qty = Math.max(0, toNum(line.order_qty, 0));
            const family = skuFamily(skuCode);
            const unitPrice = toNum(line.unit_price, FAMILY_PRICE[family] || 50);
            return {
                id: nextId(db.biz.order_lines),
                order_no: orderNo,
                line_no: idx + 1,
                sku_code: skuCode,
                sku_name: sku.sku_name || skuCode,
                order_qty: qty,
                unit: line.unit || 'box',
                unit_price: unitPrice,
                line_amount: Number((qty * unitPrice).toFixed(2)),
                suggested_warehouse_code: line.suggested_warehouse_code || reseller.default_warehouse_code || '',
                suggested_warehouse_name: whMap.get(String(line.suggested_warehouse_code || reseller.default_warehouse_code || ''))?.warehouse_name || reseller.default_warehouse_name || '',
                allocation_result: [],
                allocated_qty: 0,
                exception_flag: 0,
                exception_types: [],
                created_at: createdAt,
                updated_at: createdAt
            };
        });
        db.biz.order_lines.push(...lines);

        header.total_qty = lines.reduce((sum, row) => sum + toNum(row.order_qty, 0), 0);
        header.total_amount = Number(lines.reduce((sum, row) => sum + toNum(row.line_amount, 0), 0).toFixed(2));

        ensureArray(payload.audits).forEach((row) => {
            db.biz.order_audit_records.push({
                id: nextId(db.biz.order_audit_records),
                order_no: orderNo,
                action: row.action || 'CREATE',
                comment: row.comment || '',
                operator: row.operator || createdBy,
                created_at: row.created_at || createdAt
            });
        });

        ensureArray(payload.tracks).forEach((row) => {
            db.biz.fulfillment_tracks.push({
                id: nextId(db.biz.fulfillment_tracks),
                order_no: orderNo,
                status: row.status || 'WAIT_ALLOCATE',
                operator: row.operator || createdBy,
                action_time: row.action_time || createdAt,
                note: row.note || ''
            });
        });

        const alloc = ensureArray(payload.alloc);
        if (alloc.length) {
            header.current_allocation_version = 1;
            lines.forEach((line, lineIndex) => {
                const selected = ensureArray(alloc[lineIndex]).map((item) => ({
                    warehouse_code: item.warehouse_code,
                    warehouse_name: whMap.get(String(item.warehouse_code || ''))?.warehouse_name || item.warehouse_code || '',
                    qty: toNum(item.qty, 0),
                    score: toNum(item.score, 0.9),
                    reasons: ensureArray(item.reasons),
                    manual: Boolean(item.manual)
                }));
                line.allocation_result = selected;
                line.allocated_qty = selected.reduce((sum, row) => sum + toNum(row.qty, 0), 0);
            });
            db.biz.order_allocation_plans.push({
                id: nextId(db.biz.order_allocation_plans),
                order_no: orderNo,
                version_no: 1,
                weights: { ...db.biz.order_allocation_weights },
                plan_summary: payload.plan_summary || 'Recovery script auto allocation',
                details: lines.map((line) => ({
                    line_id: line.id,
                    line_no: line.line_no,
                    sku_code: line.sku_code,
                    order_qty: line.order_qty,
                    remaining_qty: Math.max(0, toNum(line.order_qty, 0) - toNum(line.allocated_qty, 0)),
                    recommendations: [],
                    selected_allocations: line.allocation_result,
                    allocation_mode: line.allocated_qty >= line.order_qty ? 'FULL' : 'PARTIAL'
                })),
                created_by: createdBy,
                created_at: createdAt
            });
        }

        return { header, lines };
    };

    if (shouldSeedOrders || shouldSeedLedger) {
        enrichInventoryOpsRealistic(db, { addOrder });
    }

    const roleMap = new Map();
    ensureArray(db.system.account_roles).forEach((row) => {
        const accountId = Number(row.account_id);
        const list = roleMap.get(accountId) || [];
        list.push(Number(row.role_id));
        roleMap.set(accountId, list);
    });
    const superAccount = ensureArray(db.system.accounts).find((row) => String(row.login_id) === 'jiaohaoyuan')
        || ensureArray(db.system.accounts).find((row) => (roleMap.get(Number(row.id)) || []).includes(1))
        || ensureArray(db.system.accounts)[0];

    if (superAccount) {
        const userId = Number(superAccount.id);
        const userName = superAccount.nick_name || superAccount.login_id || `user${userId}`;
        const hasPending = db.platform.workflow_todos.some((row) => Number(row.assignee_id) === userId && String(row.status) === 'PENDING');
        if (!hasPending) {
            const approvalId = nextId(db.platform.workflow_approvals);
            db.platform.workflow_approvals.push({
                id: approvalId,
                biz_type: 'ORDER',
                biz_id: 'SO202604090018',
                title: 'Order approval: online peak supply order',
                status: 'PENDING',
                applicant_name: 'system-recovery',
                applicant_id: userId,
                reviewer_id: userId,
                reviewer_name: userName,
                submitted_at: nowIso(),
                reviewed_at: '',
                review_comment: '',
                records: [{ action: 'SUBMIT', operator: 'system-recovery', comment: 'Submit approval', created_at: nowIso() }]
            });
            db.platform.workflow_todos.push({
                id: nextId(db.platform.workflow_todos),
                todo_type: 'APPROVAL',
                title: 'Pending approval: online peak supply order',
                summary: 'Order approval pending',
                biz_type: 'ORDER',
                biz_id: 'SO202604090018',
                priority: 'P1',
                due_at: nowIso(),
                status: 'PENDING',
                assignee_id: userId,
                assignee_name: userName,
                source_path: '/intelligent-closed-loop?orderNo=SO202604090018',
                approval_id: approvalId,
                task_id: null,
                remind_count: 0,
                last_remind_at: '',
                escalated: 0,
                created_at: nowIso(),
                updated_at: nowIso(),
                done_at: '',
                done_comment: ''
            });
            db.platform.workflow_messages.push({
                id: nextId(db.platform.workflow_messages),
                category: 'SYSTEM',
                title: 'Inventory recovery complete',
                content: 'Business operation data has been recovered. Refresh the page to view it.',
                status: 'UNREAD',
                priority: 'P2',
                receiver_id: userId,
                receiver_name: userName,
                link_path: '/workflow-center',
                biz_type: 'TASK',
                biz_id: 'RECOVERY',
                created_at: nowIso(),
                read_at: ''
            });
        }
    }

    db.meta = db.meta || {};
    db.meta.updated_at = nowIso();

    summary = {
        force,
        orders: db.biz.order_headers.length,
        orderLines: db.biz.order_lines.length,
        inventoryLedger: db.biz.inventory_ledger.length,
        inventoryWarnings: db.biz.inventory_warnings.length,
        transfers: db.biz.transfer_orders.length,
        workflowTodos: db.platform.workflow_todos.length,
        workflowApprovals: db.platform.workflow_approvals.length
    };
});

console.log('Business ops recovery finished.');
console.log(JSON.stringify(summary, null, 2));
console.log(`DB_FILE=${DB_FILE}`);
