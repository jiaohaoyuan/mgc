
const { readDb, updateDb, nextId, nowIso } = require('./localDb');
const { synchronizeOrderLocks, releaseOrderLocks } = require('./inventoryOps');

const ORDER_SOURCE_TYPES = ['MANUAL', 'IMPORT', 'SYSTEM_RECOMMEND'];
const ORDER_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CLOSED'];
const FULFILLMENT_STATUSES = ['WAIT_ALLOCATE', 'ALLOCATED', 'WAIT_OUTBOUND', 'OUTBOUND', 'IN_TRANSIT', 'SIGNED', 'ABNORMAL', 'CLOSED'];
const EXCEPTION_REASON = {
  OUT_OF_STOCK: '库存不足',
  EXPIRY_RISK: '效期不足',
  SAFETY_STOCK_BREACH: '安全库存透支风险',
  LOCKED_STOCK_OCCUPIED: '锁定库存不可重复占用',
  OUT_OF_REGION_AUTH: '超区域授权',
  OUT_OF_RESELLER_AUTH: '超经销授权',
  NO_DEFAULT_WAREHOUSE: '无默认仓',
  NO_MATCH_RELATION: '无匹配关系'
};

const normalize = (v) => String(v || '').trim();
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
const arr = (v) => Array.isArray(v) ? v : [];
const dateText = (v) => String(v || '').slice(0, 10);
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

const ensure = (db) => {
  db.biz = db.biz || {};
  db.biz.order_headers = arr(db.biz.order_headers);
  db.biz.order_lines = arr(db.biz.order_lines);
  db.biz.order_audit_records = arr(db.biz.order_audit_records);
  db.biz.order_allocation_plans = arr(db.biz.order_allocation_plans);
  db.biz.inventory_stock = arr(db.biz.inventory_stock);
  db.biz.order_exceptions = arr(db.biz.order_exceptions);
  db.biz.replenishment_suggestions = arr(db.biz.replenishment_suggestions);
  db.biz.fulfillment_tracks = arr(db.biz.fulfillment_tracks);
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
};

const customerRow = (db, code) => arr(db.master?.reseller).find((r) => String(r.reseller_code) === String(code) && Number(r.status) === 1);
const skuRow = (db, code) => arr(db.master?.sku).find((r) => String(r.sku_code) === String(code) && Number(r.status) === 1 && String(r.lifecycle_status).toUpperCase() === 'ACTIVE');
const relationValid = (db, customerCode, skuCode, bizDate = nowIso()) => {
  const d = dateText(bizDate);
  return arr(db.master?.reseller_relation).some((r) => String(r.reseller_code) === String(customerCode)
    && String(r.sku_code) === String(skuCode)
    && Number(r.status) === 1
    && dateText(r.begin_date || '1900-01-01') <= d
    && dateText(r.end_date || '2999-12-31') >= d);
};

const genOrderNo = (db) => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const maxSeq = db.biz.order_headers.filter((h) => String(h.order_no).startsWith(`SO${d}`)).reduce((m, h) => Math.max(m, toNum(String(h.order_no).slice(-4), 0)), 0);
  return `SO${d}${String(maxSeq + 1).padStart(4, '0')}`;
};

const recalc = (db, orderNo) => {
  const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
  if (!h) return;
  const lines = db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo));
  h.total_qty = lines.reduce((s, l) => s + toNum(l.order_qty, 0), 0);
  h.total_amount = Number(lines.reduce((s, l) => s + toNum(l.line_amount, 0), 0).toFixed(2));
  h.updated_at = nowIso();
};

const appendAudit = (db, orderNo, action, comment, operator) => {
  db.biz.order_audit_records.push({ id: nextId(db.biz.order_audit_records), order_no: orderNo, action, comment: normalize(comment), operator: normalize(operator) || '系统', created_at: nowIso() });
};

const appendTrack = (db, orderNo, status, operator, note = '') => {
  db.biz.fulfillment_tracks.push({ id: nextId(db.biz.fulfillment_tracks), order_no: orderNo, status, operator: normalize(operator) || '系统', action_time: nowIso(), note: normalize(note) });
};

const summarize = (db, h) => {
  const lines = db.biz.order_lines.filter((x) => String(x.order_no) === String(h.order_no));
  const allocated = lines.reduce((s, l) => s + toNum(l.allocated_qty, 0), 0);
  return { ...h, line_count: lines.length, allocated_qty: allocated, allocation_rate: h.total_qty > 0 ? Number((allocated / h.total_qty).toFixed(4)) : 0 };
};

const validatePayload = (db, payload) => {
  const errors = [];
  const c = customerRow(db, normalize(payload.customer_code));
  if (!c) errors.push({ type: 'INVALID_CUSTOMER', reason: '客户无效' });
  const source = normalize(payload.order_source || 'MANUAL');
  if (!ORDER_SOURCE_TYPES.includes(source)) errors.push({ type: 'INVALID_SOURCE', reason: '订单来源不支持' });
  const incoming = arr(payload.lines);
  if (!incoming.length) errors.push({ type: 'EMPTY_LINES', reason: '订单行不能为空' });

  const lines = incoming.map((line, idx) => {
    const skuCode = normalize(line.sku_code);
    const sku = skuRow(db, skuCode);
    const qty = toNum(line.order_qty, 0);
    const price = toNum(line.unit_price, 0);
    if (!sku) errors.push({ type: 'INVALID_SKU', line_no: idx + 1, reason: `SKU ${skuCode} 无效` });
    if (qty <= 0) errors.push({ type: 'INVALID_QTY', line_no: idx + 1, reason: '订货数量必须大于0' });
    if (c && skuCode && !relationValid(db, c.reseller_code, skuCode)) errors.push({ type: 'OUT_OF_RESELLER_AUTH', line_no: idx + 1, reason: EXCEPTION_REASON.OUT_OF_RESELLER_AUTH });
    return {
      line_no: idx + 1,
      sku_code: skuCode,
      sku_name: sku?.sku_name || normalize(line.sku_name),
      order_qty: qty,
      unit: normalize(line.unit || '箱') || '箱',
      unit_price: price,
      line_amount: Number((qty * price).toFixed(2)),
      suggested_warehouse_code: normalize(line.suggested_warehouse_code || c?.default_warehouse_code),
      suggested_warehouse_name: normalize(line.suggested_warehouse_name || c?.default_warehouse_name),
      allocation_result: [],
      allocated_qty: 0,
      exception_flag: 0,
      exception_types: []
    };
  });

  if (c && !normalize(c.default_warehouse_code)) errors.push({ type: 'NO_DEFAULT_WAREHOUSE', reason: EXCEPTION_REASON.NO_DEFAULT_WAREHOUSE });
  return { errors, customer: c, source, lines };
};
const lineIssues = (db, header, line) => {
  const issues = [];
  const stocks = db.biz.inventory_stock.filter((s) => String(s.sku_code) === String(line.sku_code));
  if (!stocks.length) {
    issues.push({ type: 'NO_MATCH_RELATION', reason: EXCEPTION_REASON.NO_MATCH_RELATION });
    return issues;
  }
  const target = stocks.find((s) => String(s.warehouse_code) === String(line.suggested_warehouse_code)) || stocks[0];
  const avail = toNum(target.available_qty, 0);
  const lock = toNum(target.locked_qty, 0);
  const safety = toNum(target.safety_qty, 0);
  const usable = avail - lock;
  if (usable < toNum(line.order_qty, 0)) issues.push({ type: 'OUT_OF_STOCK', reason: EXCEPTION_REASON.OUT_OF_STOCK });
  if (toNum(target.shelf_life_days_remaining, 0) <= 2) issues.push({ type: 'EXPIRY_RISK', reason: EXCEPTION_REASON.EXPIRY_RISK });
  if (usable - toNum(line.order_qty, 0) < safety) issues.push({ type: 'SAFETY_STOCK_BREACH', reason: EXCEPTION_REASON.SAFETY_STOCK_BREACH });
  if (lock > avail * 0.85) issues.push({ type: 'LOCKED_STOCK_OCCUPIED', reason: EXCEPTION_REASON.LOCKED_STOCK_OCCUPIED });
  if (!relationValid(db, header.customer_code, line.sku_code)) issues.push({ type: 'OUT_OF_REGION_AUTH', reason: EXCEPTION_REASON.OUT_OF_REGION_AUTH });
  return issues;
};

const pickIssues = (db, orderNo) => {
  const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
  if (!h) return [];
  const lines = db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo));
  const out = [];
  lines.forEach((line) => lineIssues(db, h, line).forEach((i) => out.push({ order_no: orderNo, line_id: line.id, line_no: line.line_no, exception_type: i.type, reason: i.reason })));
  return out;
};

const syncExceptions = (db, orderNo, issues) => {
  const now = nowIso();
  const keys = new Set();
  issues.forEach((i) => {
    const key = `${orderNo}:${i.line_id}:${i.exception_type}`;
    keys.add(key);
    const existed = db.biz.order_exceptions.find((x) => String(x.order_no) === String(orderNo) && Number(x.line_id) === Number(i.line_id) && String(x.exception_type) === String(i.exception_type) && String(x.status) !== 'CLOSED');
    if (existed) { existed.reason = i.reason; existed.updated_at = now; return; }
    db.biz.order_exceptions.push({ id: nextId(db.biz.order_exceptions), order_no: orderNo, line_id: i.line_id, line_no: i.line_no, exception_type: i.exception_type, reason: i.reason, status: 'OPEN', claimed_by: '', claimed_at: '', handled_by: '', handle_comment: '', closed_at: '', created_at: now, updated_at: now });
  });

  db.biz.order_exceptions.forEach((x) => {
    if (String(x.order_no) !== String(orderNo) || String(x.status) === 'CLOSED') return;
    const key = `${orderNo}:${x.line_id}:${x.exception_type}`;
    if (!keys.has(key)) { x.status = 'CLOSED'; x.closed_at = now; x.updated_at = now; }
  });

  const lineMap = new Map();
  db.biz.order_exceptions.filter((x) => String(x.order_no) === String(orderNo) && String(x.status) !== 'CLOSED').forEach((x) => {
    const list = lineMap.get(x.line_id) || [];
    list.push(x.exception_type);
    lineMap.set(x.line_id, list);
  });

  db.biz.order_lines.forEach((l) => {
    if (String(l.order_no) !== String(orderNo)) return;
    const types = lineMap.get(l.id) || [];
    l.exception_flag = types.length ? 1 : 0;
    l.exception_types = [...new Set(types)];
    l.updated_at = now;
  });

  const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
  if (h) {
    const hasOpen = db.biz.order_exceptions.some((x) => String(x.order_no) === String(orderNo) && String(x.status) !== 'CLOSED');
    h.has_exception = hasOpen ? 1 : 0;
    if (hasOpen && h.fulfillment_status !== 'CLOSED') h.fulfillment_status = 'ABNORMAL';
    h.updated_at = now;
  }
};

const recommend = (db, line, weights) => {
  const stocks = db.biz.inventory_stock.filter((s) => String(s.sku_code) === String(line.sku_code));
  const sku = skuRow(db, line.sku_code);
  const shelf = Math.max(1, toNum(sku?.shelf_life_days, 1));
  const qty = Math.max(1, toNum(line.order_qty, 1));
  return stocks.map((s) => {
    const avail = toNum(s.available_qty, 0);
    const lock = toNum(s.locked_qty, 0);
    const safety = toNum(s.safety_qty, 0);
    const inv = clamp((avail - lock - safety) / qty, 0, 1);
    const dis = clamp(toNum(s.distance_factor, 0.9), 0, 1);
    const fresh = clamp(toNum(s.shelf_life_days_remaining, 0) / shelf, 0, 1);
    const cost = clamp(toNum(s.cost_factor, 0.9), 0, 1);
    const pri = clamp(toNum(s.priority_factor, 0.9), 0, 1);
    const score = Number((inv * toNum(weights.inventory_weight, 0) + dis * toNum(weights.distance_weight, 0) + fresh * toNum(weights.freshness_weight, 0) + cost * toNum(weights.cost_weight, 0) + pri * toNum(weights.priority_weight, 0)).toFixed(4));
    return { warehouse_code: s.warehouse_code, warehouse_name: s.warehouse_name, available_qty: avail, locked_qty: lock, safety_qty: safety, score, reasons: [`库存:${inv.toFixed(2)}`, `距离:${dis.toFixed(2)}`, `鲜度:${fresh.toFixed(2)}`, `成本:${cost.toFixed(2)}`, `优先级:${pri.toFixed(2)}`] };
  }).sort((a, b) => b.score - a.score);
};

const applyAutoAllocate = (db, orderNo, operator, customWeights = null) => {
  const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
  if (!h) throw new Error('订单不存在');
  if (!['APPROVED', 'CLOSED'].includes(String(h.order_status))) throw new Error('仅审核通过订单允许分配');
  const weights = { ...db.biz.order_allocation_weights, ...(customWeights || {}) };
  const lines = db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo));
  const detail = [];
  lines.forEach((line) => {
    const recs = recommend(db, line, weights);
    let left = toNum(line.order_qty, 0);
    const selected = [];
    recs.forEach((r) => {
      if (left <= 0) return;
      const can = Math.max(0, toNum(r.available_qty, 0) - toNum(r.locked_qty, 0) - toNum(r.safety_qty, 0));
      const q = Math.min(left, can);
      if (q <= 0) return;
      selected.push({ warehouse_code: r.warehouse_code, warehouse_name: r.warehouse_name, qty: q, score: r.score, reasons: r.reasons, manual: false });
      left -= q;
    });
    line.suggested_warehouse_code = selected[0]?.warehouse_code || line.suggested_warehouse_code;
    line.suggested_warehouse_name = selected[0]?.warehouse_name || line.suggested_warehouse_name;
    line.allocated_qty = selected.reduce((s, a) => s + toNum(a.qty, 0), 0);
    line.allocation_result = selected;
    line.updated_at = nowIso();
    detail.push({ line_id: line.id, line_no: line.line_no, sku_code: line.sku_code, order_qty: line.order_qty, remaining_qty: left, recommendations: recs.slice(0, 5), selected_allocations: selected, allocation_mode: selected.length > 1 ? 'SPLIT' : (left > 0 ? 'PARTIAL' : 'FULL') });
  });
  const ver = toNum(h.current_allocation_version, 0) + 1;
  h.current_allocation_version = ver;
  h.fulfillment_status = detail.every((d) => toNum(d.remaining_qty, 0) <= 0) ? 'ALLOCATED' : 'ABNORMAL';
  h.updated_at = nowIso();
  db.biz.order_allocation_plans.push({ id: nextId(db.biz.order_allocation_plans), order_no: orderNo, version_no: ver, weights: clone(weights), plan_summary: `智能分配 V${ver}`, details: detail, created_by: normalize(operator) || '系统', created_at: nowIso() });
  syncExceptions(db, orderNo, pickIssues(db, orderNo));
  return { order_no: orderNo, version_no: ver, fulfillment_status: h.fulfillment_status, details: detail };
};

const applyManualAllocate = (db, orderNo, lineId, allocations, operator, comment) => {
  const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
  if (!h) throw new Error('订单不存在');
  const line = db.biz.order_lines.find((x) => String(x.order_no) === String(orderNo) && Number(x.id) === Number(lineId));
  if (!line) throw new Error('订单行不存在');
  const selected = arr(allocations).map((a) => ({ warehouse_code: normalize(a.warehouse_code), warehouse_name: normalize(a.warehouse_name), qty: toNum(a.qty, 0), score: toNum(a.score, 1), reasons: arr(a.reasons), manual: true })).filter((a) => a.warehouse_code && a.qty > 0);
  if (!selected.length) throw new Error('人工分配明细不能为空');
  line.allocation_result = selected;
  line.allocated_qty = selected.reduce((s, a) => s + toNum(a.qty, 0), 0);
  line.suggested_warehouse_code = selected[0].warehouse_code;
  line.suggested_warehouse_name = selected[0].warehouse_name || line.suggested_warehouse_name;
  line.updated_at = nowIso();
  const ver = toNum(h.current_allocation_version, 0) + 1;
  h.current_allocation_version = ver;
  const allLines = db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo));
  h.fulfillment_status = allLines.some((x) => toNum(x.allocated_qty, 0) < toNum(x.order_qty, 0)) ? 'ABNORMAL' : 'ALLOCATED';
  h.updated_at = nowIso();
  db.biz.order_allocation_plans.push({ id: nextId(db.biz.order_allocation_plans), order_no: orderNo, version_no: ver, weights: clone(db.biz.order_allocation_weights), plan_summary: `人工覆盖 V${ver}${comment ? ` - ${comment}` : ''}`, details: [{ line_id: line.id, line_no: line.line_no, sku_code: line.sku_code, order_qty: line.order_qty, remaining_qty: Math.max(0, toNum(line.order_qty, 0) - toNum(line.allocated_qty, 0)), recommendations: [], selected_allocations: selected, allocation_mode: 'MANUAL' }], created_by: normalize(operator) || '系统', created_at: nowIso() });
  syncExceptions(db, orderNo, pickIssues(db, orderNo));
  return { order_no: orderNo, line_id: line.id, version_no: ver, fulfillment_status: h.fulfillment_status, line };
};

const orderDetail = (db, orderNo) => {
  const header = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
  if (!header) return null;
  return {
    header,
    lines: db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => toNum(a.line_no, 0) - toNum(b.line_no, 0)),
    audit_records: db.biz.order_audit_records.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    allocation_plans: db.biz.order_allocation_plans.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => toNum(b.version_no, 0) - toNum(a.version_no, 0)),
    exceptions: db.biz.order_exceptions.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => toNum(b.id, 0) - toNum(a.id, 0)),
    replenishment_suggestions: db.biz.replenishment_suggestions.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => toNum(b.id, 0) - toNum(a.id, 0)),
    fulfillment_tracks: db.biz.fulfillment_tracks.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => String(a.action_time).localeCompare(String(b.action_time)))
  };
};
const registerOrderPhase2Routes = ({ app, authRequired, apiOk, apiErr, appendOperationLog, paginate, contains, safeClone }) => {
  const safe = safeClone || clone;

  app.get('/api/orders/phase2/config', authRequired, (req, res) => {
    const db = readDb(); ensure(db);
    apiOk(res, req, {
      enums: { orderSourceTypes: ORDER_SOURCE_TYPES, orderStatuses: ORDER_STATUSES, fulfillmentStatuses: FULFILLMENT_STATUSES, exceptionTypes: Object.keys(EXCEPTION_REASON) },
      customers: arr(db.master?.reseller).filter((r) => Number(r.status) === 1).map((r) => ({ customer_code: r.reseller_code, customer_name: r.reseller_name, channel_code: r.lv2_channel_code, channel_name: r.lv2_channel_name, region: r.sale_region_name, default_warehouse_code: r.default_warehouse_code, default_warehouse_name: r.default_warehouse_name })),
      skus: arr(db.master?.sku).filter((r) => Number(r.status) === 1).map((r) => ({ sku_code: r.sku_code, sku_name: r.sku_name, lifecycle_status: r.lifecycle_status, shelf_life_days: toNum(r.shelf_life_days, 0) })),
      warehouses: arr(db.master?.warehouse).filter((r) => Number(r.status) === 1).map((r) => ({ warehouse_code: r.warehouse_code, warehouse_name: r.warehouse_name, warehouse_type: r.warehouse_type, region: r.city_name }))
    }, '获取成功');
  });

  app.get('/api/orders/phase2/allocation/weights', authRequired, (req, res) => { const db = readDb(); ensure(db); apiOk(res, req, db.biz.order_allocation_weights, '获取成功'); });
  app.put('/api/orders/phase2/allocation/weights', authRequired, (req, res) => {
    const b = req.body || {}; let out = null;
    updateDb((db) => {
      ensure(db);
      out = {
        inventory_weight: clamp(toNum(b.inventory_weight, db.biz.order_allocation_weights.inventory_weight || 0.32), 0, 1),
        distance_weight: clamp(toNum(b.distance_weight, db.biz.order_allocation_weights.distance_weight || 0.22), 0, 1),
        freshness_weight: clamp(toNum(b.freshness_weight, db.biz.order_allocation_weights.freshness_weight || 0.2), 0, 1),
        cost_weight: clamp(toNum(b.cost_weight, db.biz.order_allocation_weights.cost_weight || 0.14), 0, 1),
        priority_weight: clamp(toNum(b.priority_weight, db.biz.order_allocation_weights.priority_weight || 0.12), 0, 1),
        updated_by: req.user?.nickname || req.user?.username || '系统',
        updated_at: nowIso()
      };
      db.biz.order_allocation_weights = out;
    });
    apiOk(res, req, out, '保存成功');
  });

  app.get('/api/orders/phase2/dashboard', authRequired, (req, res) => {
    const db = readDb(); ensure(db);
    const q = req.query || {};
    let headers = db.biz.order_headers.map((h) => summarize(db, h));
    if (normalize(q.keyword)) headers = headers.filter((h) => contains(h.order_no, q.keyword) || contains(h.customer_name, q.keyword));
    if (normalize(q.region)) headers = headers.filter((h) => String(h.region) === String(q.region));
    if (normalize(q.channel)) headers = headers.filter((h) => String(h.channel_code) === String(q.channel) || String(h.channel_name) === String(q.channel));
    if (normalize(q.startDate || q.beginDate)) headers = headers.filter((h) => dateText(h.created_at) >= dateText(q.startDate || q.beginDate));
    if (normalize(q.endDate)) headers = headers.filter((h) => dateText(h.created_at) <= dateText(q.endDate));
    let lines = db.biz.order_lines.filter((l) => headers.some((h) => String(h.order_no) === String(l.order_no)));
    if (normalize(q.skuCode)) lines = lines.filter((l) => String(l.sku_code) === String(q.skuCode));
    const totalOrders = headers.length;
    const totalLines = lines.length;
    const allocated = headers.filter((h) => ['ALLOCATED', 'WAIT_OUTBOUND', 'OUTBOUND', 'IN_TRANSIT', 'SIGNED', 'CLOSED'].includes(String(h.fulfillment_status))).length;
    const abnormal = headers.filter((h) => Number(h.has_exception) === 1 || String(h.fulfillment_status) === 'ABNORMAL').length;
    const closed = headers.filter((h) => ['SIGNED', 'CLOSED'].includes(String(h.fulfillment_status)) || String(h.order_status) === 'CLOSED').length;
    const stockout = db.biz.order_exceptions.filter((e) => headers.some((h) => String(h.order_no) === String(e.order_no)) && String(e.status) !== 'CLOSED' && String(e.exception_type) === 'OUT_OF_STOCK').length;
    const byRegion = headers.reduce((a, h) => { const k = h.region || '未知'; a[k] = (a[k] || 0) + 1; return a; }, {});
    const byChannel = headers.reduce((a, h) => { const k = h.channel_name || h.channel_code || '未知'; a[k] = (a[k] || 0) + 1; return a; }, {});
    const byStatus = headers.reduce((a, h) => { const k = h.order_status || 'UNKNOWN'; a[k] = (a[k] || 0) + 1; return a; }, {});
    apiOk(res, req, { total_orders: totalOrders, total_lines: totalLines, allocation_success_rate: totalOrders ? Number((allocated / totalOrders).toFixed(4)) : 0, exception_rate: totalOrders ? Number((abnormal / totalOrders).toFixed(4)) : 0, fulfillment_rate: totalOrders ? Number((closed / totalOrders).toFixed(4)) : 0, stockout_rate: totalLines ? Number((stockout / totalLines).toFixed(4)) : 0, by_region: byRegion, by_channel: byChannel, by_status: byStatus, drilldown_orders: headers.slice(0, 100) }, '获取成功');
  });

  app.get('/api/orders/phase2/dashboard/drilldown', authRequired, (req, res) => {
    const metric = normalize(req.query.metric || 'all');
    const db = readDb(); ensure(db);
    let list = db.biz.order_headers.map((h) => summarize(db, h));
    if (metric === 'allocation_success_rate') list = list.filter((h) => ['ALLOCATED', 'WAIT_OUTBOUND', 'OUTBOUND', 'IN_TRANSIT', 'SIGNED', 'CLOSED'].includes(String(h.fulfillment_status)));
    if (metric === 'exception_rate') list = list.filter((h) => Number(h.has_exception) === 1 || String(h.fulfillment_status) === 'ABNORMAL');
    if (metric === 'fulfillment_rate') list = list.filter((h) => ['SIGNED', 'CLOSED'].includes(String(h.fulfillment_status)) || String(h.order_status) === 'CLOSED');
    apiOk(res, req, list.slice(0, 200), '获取成功');
  });

  app.get('/api/orders/phase2/exceptions/list', authRequired, (req, res) => {
    const db = readDb(); ensure(db);
    const { page = 1, pageSize = 20, status = '', exceptionType = '', keyword = '' } = req.query || {};
    let rows = db.biz.order_exceptions.map((e) => {
      const h = db.biz.order_headers.find((x) => String(x.order_no) === String(e.order_no));
      const l = db.biz.order_lines.find((x) => Number(x.id) === Number(e.line_id));
      return { ...e, customer_name: h?.customer_name || '', region: h?.region || '', sku_code: l?.sku_code || '', sku_name: l?.sku_name || '', order_qty: l?.order_qty || 0 };
    });
    if (normalize(status)) rows = rows.filter((r) => String(r.status) === String(status));
    if (normalize(exceptionType)) rows = rows.filter((r) => String(r.exception_type) === String(exceptionType));
    if (normalize(keyword)) rows = rows.filter((r) => contains(r.order_no, keyword) || contains(r.customer_name, keyword) || contains(r.sku_name, keyword));
    rows = rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
  });

  app.get('/api/orders/phase2/exceptions/stats', authRequired, (req, res) => {
    const db = readDb(); ensure(db);
    const stats = db.biz.order_exceptions.reduce((a, r) => {
      const k = r.exception_type || 'UNKNOWN';
      if (!a[k]) a[k] = { total: 0, open: 0, claimed: 0, closed: 0 };
      a[k].total += 1;
      if (String(r.status) === 'OPEN') a[k].open += 1;
      if (String(r.status) === 'CLAIMED') a[k].claimed += 1;
      if (String(r.status) === 'CLOSED') a[k].closed += 1;
      return a;
    }, {});
    apiOk(res, req, stats, '获取成功');
  });

  app.get('/api/orders/phase2/exceptions/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const db = readDb(); ensure(db);
    const detail = db.biz.order_exceptions.find((x) => Number(x.id) === id);
    if (!detail) return apiErr(res, req, 404, '异常不存在');
    apiOk(res, req, { detail, order: orderDetail(db, detail.order_no) }, '获取成功');
  });

  app.post('/api/orders/phase2/exceptions/:id/claim', authRequired, (req, res) => {
    const id = toNum(req.params.id, 0); let out = null;
    updateDb((db) => { ensure(db); const row = db.biz.order_exceptions.find((x) => Number(x.id) === id); if (!row) throw new Error('异常不存在'); row.status = 'CLAIMED'; row.claimed_by = req.user?.nickname || req.user?.username || '系统'; row.claimed_at = nowIso(); row.updated_at = nowIso(); out = row; });
    apiOk(res, req, out, '认领成功');
  });

  app.post('/api/orders/phase2/exceptions/:id/handle', authRequired, (req, res) => {
    const id = toNum(req.params.id, 0); const b = req.body || {}; let out = null;
    updateDb((db) => {
      ensure(db);
      const row = db.biz.order_exceptions.find((x) => Number(x.id) === id);
      if (!row) throw new Error('异常不存在');
      row.handle_comment = normalize(b.comment || row.handle_comment || '已处理');
      row.handled_by = req.user?.nickname || req.user?.username || '系统';
      row.status = 'CLOSED';
      row.closed_at = nowIso();
      row.updated_at = nowIso();
      out = row;
    });
    apiOk(res, req, out, '处理成功');
  });

  app.post('/api/orders/phase2/replenishment/:id/decision', authRequired, (req, res) => {
    const id = toNum(req.params.id, 0); const b = req.body || {}; const action = normalize(b.action || b.status).toUpperCase();
    if (!['EXECUTED', 'REJECTED'].includes(action)) return apiErr(res, req, 400, 'action 仅支持 EXECUTED/REJECTED');
    let out = null;
    updateDb((db) => {
      ensure(db);
      const row = db.biz.replenishment_suggestions.find((x) => Number(x.id) === id);
      if (!row) throw new Error('建议不存在');
      row.status = action;
      row.decided_by = req.user?.nickname || req.user?.username || '系统';
      row.decided_at = nowIso();
      row.decision_comment = normalize(b.comment);
      row.updated_at = nowIso();
      out = row;
    });
    apiOk(res, req, out, '处理成功');
  });

  app.get('/api/orders/phase2/list', authRequired, (req, res) => {
    const db = readDb(); ensure(db);
    const q = req.query || {};
    let rows = db.biz.order_headers.map((h) => summarize(db, h));
    if (normalize(q.keyword)) rows = rows.filter((h) => contains(h.order_no, q.keyword) || contains(h.customer_name, q.keyword) || contains(h.customer_code, q.keyword) || contains(h.region, q.keyword));
    if (normalize(q.status)) rows = rows.filter((h) => String(h.order_status) === String(q.status));
    if (normalize(q.reviewStatus)) rows = rows.filter((h) => String(h.review_status) === String(q.reviewStatus));
    if (normalize(q.source)) rows = rows.filter((h) => String(h.order_source) === String(q.source));
    if (normalize(q.region)) rows = rows.filter((h) => String(h.region) === String(q.region));
    if (normalize(q.channel)) rows = rows.filter((h) => String(h.channel_code) === String(q.channel) || String(h.channel_name) === String(q.channel));
    if (normalize(q.hasException) === '1') rows = rows.filter((h) => Number(h.has_exception) === 1);
    if (normalize(q.hasException) === '0') rows = rows.filter((h) => Number(h.has_exception) !== 1);
    if (normalize(q.startDate || q.beginDate)) rows = rows.filter((h) => dateText(h.created_at) >= dateText(q.startDate || q.beginDate));
    if (normalize(q.endDate)) rows = rows.filter((h) => dateText(h.created_at) <= dateText(q.endDate));
    rows = rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    apiOk(res, req, paginate(rows, q.page || 1, q.pageSize || q.limit || 20), '获取成功');
  });
  app.post('/api/orders/phase2/import', authRequired, (req, res) => {
    const rows = arr(req.body?.rows);
    if (!rows.length) return apiErr(res, req, 400, '导入数据为空');
    const result = { total: rows.length, success: 0, fail: 0, failed_rows: [], order_nos: [] };
    updateDb((db) => {
      ensure(db);
      const groups = new Map();
      rows.forEach((row, idx) => {
        const k = normalize(row.external_order_no || row.group_no || `ROW-${idx + 1}`);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ ...row, __rowNo: idx + 1 });
      });
      groups.forEach((items) => {
        const first = items[0] || {};
        const payload = { customer_code: normalize(first.customer_code), order_source: 'IMPORT', lines: items.map((r) => ({ sku_code: normalize(r.sku_code), order_qty: toNum(r.order_qty, 0), unit: normalize(r.unit || '箱'), unit_price: toNum(r.unit_price, 0), suggested_warehouse_code: normalize(r.suggested_warehouse_code) })) };
        const check = validatePayload(db, payload);
        if (check.errors.length) { result.fail += items.length; result.failed_rows.push({ rows: items.map((r) => r.__rowNo), errors: check.errors }); return; }
        const orderNo = genOrderNo(db); const createdAt = nowIso();
        db.biz.order_headers.push({ id: nextId(db.biz.order_headers), order_no: orderNo, customer_code: check.customer.reseller_code, customer_name: check.customer.reseller_name, channel_code: check.customer.lv2_channel_code, channel_name: check.customer.lv2_channel_name, region: check.customer.sale_region_name, order_source: 'IMPORT', doc_type: 'DRAFT', order_status: 'DRAFT', review_status: 'UNREVIEWED', fulfillment_status: 'WAIT_ALLOCATE', total_qty: 0, total_amount: 0, submitted_at: '', reviewed_at: '', reviewed_by: '', review_comment: '', has_exception: 0, current_allocation_version: 0, created_by: req.user?.nickname || req.user?.username || '系统', created_at: createdAt, updated_at: createdAt });
        check.lines.forEach((line) => db.biz.order_lines.push({ id: nextId(db.biz.order_lines), order_no: orderNo, ...line, created_at: createdAt, updated_at: createdAt }));
        recalc(db, orderNo);
        result.success += items.length;
        result.order_nos.push(orderNo);
      });
    });
    apiOk(res, req, result, '导入完成');
  });

  app.post('/api/orders/phase2', authRequired, (req, res) => {
    const body = req.body || {};
    const db = readDb(); ensure(db);
    const check = validatePayload(db, body);
    if (check.errors.length) return apiErr(res, req, 400, '参数校验失败', { details: check.errors });
    let orderNo = '';
    updateDb((raw) => {
      ensure(raw);
      orderNo = genOrderNo(raw);
      const createdAt = nowIso();
      raw.biz.order_headers.push({ id: nextId(raw.biz.order_headers), order_no: orderNo, customer_code: check.customer.reseller_code, customer_name: check.customer.reseller_name, channel_code: check.customer.lv2_channel_code, channel_name: check.customer.lv2_channel_name, region: check.customer.sale_region_name, order_source: check.source, doc_type: normalize(body.doc_type || 'DRAFT').toUpperCase() === 'FORMAL' ? 'FORMAL' : 'DRAFT', order_status: 'DRAFT', review_status: 'UNREVIEWED', fulfillment_status: 'WAIT_ALLOCATE', total_qty: 0, total_amount: 0, submitted_at: '', reviewed_at: '', reviewed_by: '', review_comment: '', has_exception: 0, current_allocation_version: 0, created_by: req.user?.nickname || req.user?.username || '系统', created_at: createdAt, updated_at: createdAt });
      check.lines.forEach((line) => raw.biz.order_lines.push({ id: nextId(raw.biz.order_lines), order_no: orderNo, ...line, created_at: createdAt, updated_at: createdAt }));
      recalc(raw, orderNo);
      appendOperationLog(req, { moduleCode: 'order-phase2', bizObjectType: 'order', bizObjectId: orderNo, actionType: 'CREATE', message: `新增订单 ${orderNo}`, requestSummary: body });
    });
    apiOk(res, req, { order_no: orderNo }, '创建成功');
  });

  app.post('/api/orders/phase2/:orderNo/copy', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); let newNo = ''; let detail = null;
    try {
      updateDb((db) => {
        ensure(db);
        const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
        if (!h) throw new Error('源订单不存在');
        const lines = db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo));
        if (!lines.length) throw new Error('源订单无明细');
        newNo = genOrderNo(db); const createdAt = nowIso();
        db.biz.order_headers.push({ ...safe(h), id: nextId(db.biz.order_headers), order_no: newNo, doc_type: 'DRAFT', order_status: 'DRAFT', review_status: 'UNREVIEWED', fulfillment_status: 'WAIT_ALLOCATE', submitted_at: '', reviewed_at: '', reviewed_by: '', review_comment: '', has_exception: 0, current_allocation_version: 0, created_by: req.user?.nickname || req.user?.username || '系统', created_at: createdAt, updated_at: createdAt });
        lines.forEach((l, idx) => db.biz.order_lines.push({ ...safe(l), id: nextId(db.biz.order_lines), order_no: newNo, line_no: idx + 1, allocation_result: [], allocated_qty: 0, exception_flag: 0, exception_types: [], created_at: createdAt, updated_at: createdAt }));
        recalc(db, newNo);
        detail = orderDetail(db, newNo);
      });
    } catch (e) { return apiErr(res, req, 400, e.message || '复制失败'); }
    apiOk(res, req, detail, '复制成功');
  });

  app.put('/api/orders/phase2/:orderNo', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); const body = req.body || {}; let detail = null;
    try {
      updateDb((db) => {
        ensure(db);
        const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
        if (!h) throw new Error('订单不存在');
        if (!['DRAFT', 'REJECTED'].includes(String(h.order_status))) throw new Error('仅草稿或已驳回订单可编辑');
        const merge = { customer_code: normalize(body.customer_code || h.customer_code), order_source: normalize(body.order_source || h.order_source), lines: Array.isArray(body.lines) ? body.lines : db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo)).map((x) => ({ sku_code: x.sku_code, order_qty: x.order_qty, unit: x.unit, unit_price: x.unit_price, suggested_warehouse_code: x.suggested_warehouse_code })) };
        const check = validatePayload(db, merge);
        if (check.errors.length) { const er = new Error('参数校验失败'); er.details = check.errors; throw er; }
        h.customer_code = check.customer.reseller_code;
        h.customer_name = check.customer.reseller_name;
        h.channel_code = check.customer.lv2_channel_code;
        h.channel_name = check.customer.lv2_channel_name;
        h.region = check.customer.sale_region_name;
        h.order_source = check.source;
        h.review_comment = '';
        h.updated_at = nowIso();
        db.biz.order_lines = db.biz.order_lines.filter((x) => String(x.order_no) !== String(orderNo));
        check.lines.forEach((line) => db.biz.order_lines.push({ id: nextId(db.biz.order_lines), order_no: orderNo, ...line, created_at: nowIso(), updated_at: nowIso() }));
        recalc(db, orderNo);
        syncExceptions(db, orderNo, pickIssues(db, orderNo));
        detail = orderDetail(db, orderNo);
      });
    } catch (e) { return apiErr(res, req, 400, e.message || '保存失败', { details: e.details || null }); }
    apiOk(res, req, detail, '保存成功');
  });

  app.post('/api/orders/phase2/:orderNo/submit', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); let detail = null;
    try {
      updateDb((db) => {
        ensure(db);
        const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
        if (!h) throw new Error('订单不存在');
        if (!['DRAFT', 'REJECTED'].includes(String(h.order_status))) throw new Error('当前状态不可提交');
        const lines = db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo));
        if (!lines.length) throw new Error('订单行不能为空');
        const check = validatePayload(db, { customer_code: h.customer_code, order_source: h.order_source, lines: lines.map((l) => ({ sku_code: l.sku_code, order_qty: l.order_qty, unit: l.unit, unit_price: l.unit_price, suggested_warehouse_code: l.suggested_warehouse_code })) });
        if (check.errors.length) { const er = new Error('提交校验失败'); er.details = check.errors; throw er; }
        h.doc_type = 'FORMAL'; h.order_status = 'PENDING_REVIEW'; h.review_status = 'PENDING'; h.submitted_at = nowIso(); h.updated_at = nowIso();
        appendAudit(db, orderNo, 'SUBMIT', '提交审核', req.user?.nickname || req.user?.username || '系统');
        syncExceptions(db, orderNo, pickIssues(db, orderNo));
        detail = orderDetail(db, orderNo);
      });
    } catch (e) { return apiErr(res, req, 400, e.message || '提交失败', { details: e.details || null }); }
    apiOk(res, req, detail, '提交成功');
  });

  app.post('/api/orders/phase2/:orderNo/audit', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); const b = req.body || {}; const action = normalize(b.action).toUpperCase(); const comment = normalize(b.comment || '');
    if (!['APPROVE', 'REJECT'].includes(action)) return apiErr(res, req, 400, 'action 仅支持 APPROVE/REJECT');
    let detail = null;
    try {
      updateDb((db) => {
        ensure(db);
        const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
        if (!h) throw new Error('订单不存在');
        if (String(h.order_status) !== 'PENDING_REVIEW') throw new Error('订单不在待审核状态');
        if (action === 'REJECT') {
          h.order_status = 'REJECTED';
          h.review_status = 'REJECTED';
          h.review_comment = comment || '驳回';
          releaseOrderLocks(db, orderNo, req.user?.nickname || req.user?.username || '系统', 'ORDER_REJECT');
        }
        else { h.order_status = 'APPROVED'; h.review_status = 'PASSED'; h.review_comment = comment || '审核通过'; h.fulfillment_status = 'WAIT_ALLOCATE'; }
        h.reviewed_by = req.user?.nickname || req.user?.username || '系统'; h.reviewed_at = nowIso(); h.updated_at = nowIso();
        appendAudit(db, orderNo, action, h.review_comment, h.reviewed_by);
        syncExceptions(db, orderNo, pickIssues(db, orderNo));
        detail = orderDetail(db, orderNo);
      });
    } catch (e) { return apiErr(res, req, 400, e.message || '审核失败'); }
    apiOk(res, req, detail, '审核完成');
  });

  app.post('/api/orders/phase2/:orderNo/allocate/auto', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); const b = req.body || {}; let out = null;
    try {
      updateDb((db) => {
        ensure(db);
        const operator = req.user?.nickname || req.user?.username || '系统';
        out = applyAutoAllocate(db, orderNo, operator, b.weights || null);
        synchronizeOrderLocks(db, orderNo, operator, 'ORDER_ALLOCATE_AUTO');
      });
    }
    catch (e) { return apiErr(res, req, 400, e.message || '分配失败'); }
    apiOk(res, req, out, '分配成功');
  });

  app.post('/api/orders/phase2/:orderNo/allocate/manual', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); const b = req.body || {}; const lineId = toNum(b.line_id, 0);
    if (!lineId) return apiErr(res, req, 400, 'line_id 必填');
    let out = null;
    try {
      updateDb((db) => {
        ensure(db);
        const operator = req.user?.nickname || req.user?.username || '系统';
        out = applyManualAllocate(db, orderNo, lineId, b.allocations, operator, normalize(b.comment));
        synchronizeOrderLocks(db, orderNo, operator, 'ORDER_ALLOCATE_MANUAL');
      });
    }
    catch (e) { return apiErr(res, req, 400, e.message || '人工分配失败'); }
    apiOk(res, req, out, '人工分配成功');
  });

  app.post('/api/orders/phase2/:orderNo/replenishment/generate', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); let out = [];
    try {
      updateDb((db) => {
        ensure(db);
        const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
        if (!h) throw new Error('订单不存在');
        const lines = db.biz.order_lines.filter((x) => String(x.order_no) === String(orderNo));
        const created = [];
        lines.forEach((line) => {
          const lack = Math.max(0, toNum(line.order_qty, 0) - toNum(line.allocated_qty, 0));
          if (lack <= 0) return;
          const stocks = db.biz.inventory_stock.filter((s) => String(s.sku_code) === String(line.sku_code)).sort((a, b) => toNum(b.available_qty, 0) - toNum(a.available_qty, 0));
          const source = stocks[0] || null;
          const c = customerRow(db, h.customer_code);
          const row = { id: nextId(db.biz.replenishment_suggestions), order_no: orderNo, line_id: line.id, line_no: line.line_no, sku_code: line.sku_code, sku_name: line.sku_name, suggestion_type: source && source.warehouse_code !== normalize(line.suggested_warehouse_code || c?.default_warehouse_code) ? 'TRANSFER' : 'REPLENISH', source_warehouse_code: source?.warehouse_code || 'FACTORY-PLAN', source_warehouse_name: source?.warehouse_name || '工厂补货', target_warehouse_code: normalize(line.suggested_warehouse_code || c?.default_warehouse_code), target_warehouse_name: normalize(line.suggested_warehouse_name || c?.default_warehouse_name), suggest_qty: lack, suggest_eta_hours: source ? 24 : 48, status: 'PENDING', created_by: req.user?.nickname || req.user?.username || '系统', created_at: nowIso(), updated_at: nowIso() };
          db.biz.replenishment_suggestions.push(row);
          created.push(row);
        });
        out = created;
      });
    } catch (e) { return apiErr(res, req, 400, e.message || '生成建议失败'); }
    apiOk(res, req, out, '生成成功');
  });

  app.get('/api/orders/phase2/:orderNo/fulfillment', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); const db = readDb(); ensure(db);
    const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
    if (!h) return apiErr(res, req, 404, '订单不存在');
    const tracks = db.biz.fulfillment_tracks.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => String(a.action_time).localeCompare(String(b.action_time)));
    apiOk(res, req, { order_no: orderNo, current_status: h.fulfillment_status, tracks }, '获取成功');
  });

  app.post('/api/orders/phase2/:orderNo/fulfillment', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); const b = req.body || {}; const status = normalize(b.status).toUpperCase();
    if (!FULFILLMENT_STATUSES.includes(status)) return apiErr(res, req, 400, `状态非法，允许值: ${FULFILLMENT_STATUSES.join(', ')}`);
    let out = null;
    try {
      updateDb((db) => {
        ensure(db);
        const h = db.biz.order_headers.find((x) => String(x.order_no) === String(orderNo));
        if (!h) throw new Error('订单不存在');
        h.fulfillment_status = status;
        if (status === 'CLOSED') {
          h.order_status = 'CLOSED';
          h.review_status = 'PASSED';
          releaseOrderLocks(db, orderNo, req.user?.nickname || req.user?.username || '系统', 'ORDER_CLOSE');
        }
        h.updated_at = nowIso();
        appendTrack(db, orderNo, status, req.user?.nickname || req.user?.username || '系统', normalize(b.note || ''));
        out = { order_no: orderNo, current_status: status, tracks: db.biz.fulfillment_tracks.filter((x) => String(x.order_no) === String(orderNo)).sort((a, b) => String(a.action_time).localeCompare(String(b.action_time))) };
      });
    } catch (e) { return apiErr(res, req, 400, e.message || '更新失败'); }
    apiOk(res, req, out, '更新成功');
  });

  app.get('/api/orders/phase2/:orderNo', authRequired, (req, res) => {
    const orderNo = normalize(req.params.orderNo); const db = readDb(); ensure(db);
    const detail = orderDetail(db, orderNo);
    if (!detail) return apiErr(res, req, 404, '订单不存在');
    apiOk(res, req, detail, '获取成功');
  });
};

module.exports = { registerOrderPhase2Routes };
