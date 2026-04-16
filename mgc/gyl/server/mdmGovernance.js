const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const { SKU_RULE_REGEX_SOURCE } = require('./skuRules');

const REQUEST_STATUS = ['DRAFT', 'PENDING', 'REJECTED', 'EFFECTIVE'];
const REQUEST_ACTION = ['CREATE', 'UPDATE', 'DISABLE'];
const REVIEW_ACTION = ['APPROVE', 'REJECT'];
const QUALITY_RULE_TYPES = ['UNIQUE', 'FORMAT', 'REQUIRED', 'REFERENCE', 'TIME_RANGE', 'CROSS_OBJECT'];
const EFFECTIVE_STATES = ['UPCOMING', 'ACTIVE', 'NEAR_EXPIRY', 'EXPIRED'];
const CONFLICT_STATUS = ['OPEN', 'PROCESSING', 'RESOLVED'];
const CONFLICT_TASK_STATUS = ['RUNNING', 'DONE'];
const QUALITY_ISSUE_STATUS = ['OPEN', 'RESOLVED'];
const OBJECT_ITEMS_MAX_LIMIT = 200;

const OBJECT_CONFIG = {
  SKU: { label: 'SKU', table: 'sku', codeField: 'sku_code', nameField: 'sku_name', relation: false },
  RESELLER: { label: '经销商', table: 'reseller', codeField: 'reseller_code', nameField: 'reseller_name', relation: false },
  WAREHOUSE: { label: '仓库', table: 'warehouse', codeField: 'warehouse_code', nameField: 'warehouse_name', relation: false },
  FACTORY: { label: '工厂', table: 'factory', codeField: 'factory_code', nameField: 'factory_name', relation: false },
  CHANNEL: { label: '渠道', table: 'channel', codeField: 'channel_code', nameField: 'channel_name', relation: false },
  ORG: { label: '组织', table: 'org', codeField: 'org_code', nameField: 'org_name', relation: false },
  RESELLER_RLTN: { label: 'SKU-经销关系', table: 'reseller_relation', codeField: 'id', nameField: 'reseller_name', relation: true },
  RLTN_WAREHOUSE_SKU: { label: '仓库-SKU关系', table: 'rltn_warehouse_sku', codeField: 'id', nameField: 'warehouse_name', relation: true },
  RLTN_ORG_RESELLER: { label: '组织-经销关系', table: 'rltn_org_reseller', codeField: 'id', nameField: 'org_name', relation: true },
  RLTN_PRODUCT_SKU: { label: '产品-SKU关系', table: 'rltn_product_sku', codeField: 'id', nameField: 'product_name', relation: true }
};

const RELATION_OBJECT_TYPES = ['RESELLER_RLTN', 'RLTN_WAREHOUSE_SKU', 'RLTN_ORG_RESELLER', 'RLTN_PRODUCT_SKU'];

const DEFAULT_QUALITY_RULES = [
  { id: 1, rule_code: 'SKU_UNIQUE_CODE', rule_name: 'SKU编码唯一性', rule_type: 'UNIQUE', object_type: 'SKU', config: { fields: ['sku_code'] }, status: 1 },
  { id: 2, rule_code: 'SKU_REQUIRED_NAME', rule_name: 'SKU名称必填', rule_type: 'REQUIRED', object_type: 'SKU', config: { fields: ['sku_name'] }, status: 1 },
  { id: 3, rule_code: 'SKU_FORMAT_STANDARD', rule_name: 'SKU标准编码格式校验', rule_type: 'FORMAT', object_type: 'SKU', config: { field: 'sku_code', pattern: SKU_RULE_REGEX_SOURCE }, status: 1 },
  { id: 4, rule_code: 'RESELLER_RLTN_TIME_RANGE', rule_name: '经销关系时间区间校验', rule_type: 'TIME_RANGE', object_type: 'RESELLER_RLTN', config: { begin_field: 'begin_date', end_field: 'end_date' }, status: 1 },
  { id: 5, rule_code: 'RESELLER_RLTN_REFERENCE', rule_name: '经销关系引用校验', rule_type: 'REFERENCE', object_type: 'RESELLER_RLTN', config: { field: 'sku_code', ref_object_type: 'SKU', ref_field: 'sku_code' }, status: 1 },
  { id: 6, rule_code: 'CROSS_WH_SKU_COVERAGE', rule_name: '在售SKU仓库覆盖校验', rule_type: 'CROSS_OBJECT', object_type: 'SKU', config: { kind: 'WAREHOUSE_SKU_COVERAGE' }, status: 1 }
];

const normalize = (v) => String(v || '').trim();
const toNum = (v, fb = 0) => {
  const n = Number(v);
  return Number.isNaN(n) ? fb : n;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const dateText = (v) => String(v || '').slice(0, 10);
const containsText = (src, key) => String(src || '').toLowerCase().includes(String(key || '').trim().toLowerCase());
const normalizeStringList = (list) => arr(list).map((item) => normalize(item)).filter(Boolean);
const normalizeAttachmentList = (items) => arr(items)
  .map((item) => {
    if (typeof item === 'string') {
      const url = normalize(item);
      if (!url) return null;
      return { name: url, url };
    }
    if (!item || typeof item !== 'object') return null;
    const name = normalize(item.name || item.file_name || item.label || item.url);
    const url = normalize(item.url || item.link || item.path);
    if (!url) return null;
    return { name: name || url, url };
  })
  .filter(Boolean);

const paginateRows = (rows, page = 1, pageSize = 20) => {
  const p = Math.max(1, toNum(page, 1));
  const ps = Math.max(1, toNum(pageSize, 20));
  const start = (p - 1) * ps;
  return { list: rows.slice(start, start + ps), total: rows.length };
};

const buildNo = (prefix, rows, field = 'request_no') => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const maxSeq = arr(rows)
    .map((row) => String(row[field] || ''))
    .filter((code) => code.startsWith(`${prefix}${datePart}`))
    .reduce((acc, code) => Math.max(acc, toNum(code.slice(-4), 0)), 0);
  return `${prefix}${datePart}${String(maxSeq + 1).padStart(4, '0')}`;
};

const getOperatorName = (req) => req?.user?.nickname || req?.user?.username || '系统';
const getNowDate = () => new Date().toISOString().slice(0, 10);
const isActiveRow = (row) => Number(row?.status ?? 1) !== 0;

const ensureMdmGovernanceStructures = (db) => {
  db.platform = db.platform || {};
  db.master = db.master || {};
  db.biz = db.biz || {};

  db.platform.mdm_change_requests = arr(db.platform.mdm_change_requests);
  db.platform.mdm_request_logs = arr(db.platform.mdm_request_logs);
  db.platform.mdm_versions = arr(db.platform.mdm_versions);
  db.platform.mdm_quality_rules = arr(db.platform.mdm_quality_rules);
  db.platform.mdm_quality_runs = arr(db.platform.mdm_quality_runs);
  db.platform.mdm_quality_issues = arr(db.platform.mdm_quality_issues);
  db.platform.mdm_conflict_tasks = arr(db.platform.mdm_conflict_tasks);
  db.platform.mdm_conflicts = arr(db.platform.mdm_conflicts);

  Object.values(OBJECT_CONFIG).forEach((cfg) => {
    db.master[cfg.table] = arr(db.master[cfg.table]);
  });

  db.biz.order_headers = arr(db.biz.order_headers);
  db.biz.order_lines = arr(db.biz.order_lines);
  db.biz.inventory_stock = arr(db.biz.inventory_stock);
  db.biz.inventory_ledger = arr(db.biz.inventory_ledger);
  db.biz.transfer_orders = arr(db.biz.transfer_orders);

  DEFAULT_QUALITY_RULES.forEach((rule) => {
    if (db.platform.mdm_quality_rules.some((row) => String(row.rule_code) === String(rule.rule_code))) return;
    db.platform.mdm_quality_rules.push({
      ...rule,
      id: nextId(db.platform.mdm_quality_rules),
      created_by: '系统初始化',
      created_at: nowIso(),
      updated_at: nowIso()
    });
  });
};

const getObjectConfig = (objectType) => OBJECT_CONFIG[normalize(objectType).toUpperCase()] || null;

const getObjectRows = (db, objectType) => {
  const cfg = getObjectConfig(objectType);
  if (!cfg) return [];
  return arr(db.master[cfg.table]);
};

const getRowCode = (cfg, row) => {
  if (!row) return '';
  if (cfg.codeField === 'id') {
    if (cfg.table === 'reseller_relation') return `${row.reseller_code || ''}|${row.sku_code || ''}|${row.begin_date || ''}|${row.end_date || ''}`;
    if (cfg.table === 'rltn_warehouse_sku') return `${row.warehouse_code || ''}|${row.sku_code || ''}`;
    if (cfg.table === 'rltn_org_reseller') return `${row.org_code || ''}|${row.reseller_code || ''}`;
    if (cfg.table === 'rltn_product_sku') return `${row.product_code || ''}|${row.sku_code || ''}`;
    return String(row.id || '');
  }
  return String(row[cfg.codeField] || '');
};

const getRowName = (cfg, row) => {
  if (!row) return '';
  if (cfg.nameField === 'id') return String(row.id || '');
  return String(row[cfg.nameField] || '');
};

const findTargetRow = (db, objectType, targetId, targetCode) => {
  const cfg = getObjectConfig(objectType);
  if (!cfg) return null;
  const rows = getObjectRows(db, objectType);
  if (targetId) return rows.find((row) => Number(row.id) === Number(targetId)) || null;
  if (!targetCode) return null;
  return rows.find((row) => String(getRowCode(cfg, row)) === String(targetCode) || String(row[cfg.codeField] || '') === String(targetCode)) || null;
};

const buildChangedFields = (before, after) => {
  const a = before && typeof before === 'object' ? before : {};
  const b = after && typeof after === 'object' ? after : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => ({ field: k, before: a[k], after: b[k] }));
};

const appendRequestLog = (db, payload) => {
  db.platform.mdm_request_logs.push({
    id: nextId(db.platform.mdm_request_logs),
    request_id: payload.request_id,
    request_no: payload.request_no,
    action: payload.action,
    operator: payload.operator || '系统',
    comment: payload.comment || '',
    snapshot: clone(payload.snapshot),
    created_at: nowIso()
  });
};
const relationState = (row) => {
  const today = getNowDate();
  const begin = dateText(row?.begin_date);
  const end = dateText(row?.end_date);
  if (!begin || !end) return 'ACTIVE';
  if (today < begin) return 'UPCOMING';
  if (today > end) return 'EXPIRED';
  const gap = Math.floor((new Date(end).getTime() - new Date(today).getTime()) / 86400000);
  if (gap <= 7) return 'NEAR_EXPIRY';
  return 'ACTIVE';
};

const overlapDateRange = (aBegin, aEnd, bBegin, bEnd) => {
  const beginA = dateText(aBegin || '1900-01-01');
  const endA = dateText(aEnd || '2999-12-31');
  const beginB = dateText(bBegin || '1900-01-01');
  const endB = dateText(bEnd || '2999-12-31');
  return beginA <= endB && beginB <= endA;
};

const findVersionNo = (versions, objectType, targetCode) => {
  const max = arr(versions)
    .filter((row) => String(row.object_type) === String(objectType) && String(row.target_code) === String(targetCode))
    .reduce((m, row) => Math.max(m, toNum(row.version_no, 0)), 0);
  return max + 1;
};

const buildReferenceUsage = (db, objectType, targetCode) => {
  const code = normalize(targetCode);
  const out = {
    object_type: objectType,
    target_code: code,
    orders: [],
    inventory: [],
    relations: [],
    transfers: [],
    summary: { order_refs: 0, inventory_refs: 0, relation_refs: 0, transfer_refs: 0, total_refs: 0 }
  };

  if (!code) return out;

  if (objectType === 'SKU') {
    out.orders = arr(db.biz.order_lines).filter((row) => String(row.sku_code) === code).map((row) => ({
      order_no: row.order_no,
      line_no: row.line_no,
      qty: row.order_qty,
      status: row.status || ''
    }));
    out.inventory = arr(db.biz.inventory_stock).filter((row) => String(row.sku_code) === code).map((row) => ({
      warehouse_code: row.warehouse_code,
      warehouse_name: row.warehouse_name,
      available_qty: row.available_qty,
      locked_qty: row.locked_qty
    }));
    const relA = arr(db.master.reseller_relation).filter((row) => String(row.sku_code) === code && isActiveRow(row));
    const relB = arr(db.master.rltn_warehouse_sku).filter((row) => String(row.sku_code) === code && isActiveRow(row));
    const relC = arr(db.master.rltn_product_sku).filter((row) => String(row.sku_code) === code && isActiveRow(row));
    out.relations = [...relA, ...relB, ...relC];
  } else if (objectType === 'RESELLER') {
    out.orders = arr(db.biz.order_headers).filter((row) => String(row.customer_code) === code).map((row) => ({
      order_no: row.order_no,
      customer_name: row.customer_name,
      order_status: row.order_status
    }));
    const relA = arr(db.master.reseller_relation).filter((row) => String(row.reseller_code) === code && isActiveRow(row));
    const relB = arr(db.master.rltn_org_reseller).filter((row) => String(row.reseller_code) === code && isActiveRow(row));
    out.relations = [...relA, ...relB];
  } else if (objectType === 'WAREHOUSE') {
    out.inventory = arr(db.biz.inventory_stock).filter((row) => String(row.warehouse_code) === code);
    const relA = arr(db.master.rltn_warehouse_sku).filter((row) => String(row.warehouse_code) === code && isActiveRow(row));
    out.relations = relA;
    out.transfers = arr(db.biz.transfer_orders).filter((row) => String(row.out_warehouse_code) === code || String(row.in_warehouse_code) === code);
  } else {
    out.relations = arr(db.master.reseller_relation).filter((row) => containsText(JSON.stringify(row), code));
  }

  out.summary.order_refs = out.orders.length;
  out.summary.inventory_refs = out.inventory.length;
  out.summary.relation_refs = out.relations.length;
  out.summary.transfer_refs = out.transfers.length;
  out.summary.total_refs = out.summary.order_refs + out.summary.inventory_refs + out.summary.relation_refs + out.summary.transfer_refs;
  return out;
};

const buildDisableRisk = (referenceUsage) => {
  const total = toNum(referenceUsage?.summary?.total_refs, 0);
  const orderRefs = toNum(referenceUsage?.summary?.order_refs, 0);
  let level = 'LOW';
  if (total > 0) level = 'MEDIUM';
  if (orderRefs > 0 || total > 8) level = 'HIGH';
  const messages = [];
  if (orderRefs > 0) messages.push(`存在 ${orderRefs} 条订单引用，停用可能影响订单履约`);
  if (toNum(referenceUsage?.summary?.inventory_refs, 0) > 0) messages.push('存在库存引用，停用后库存分析可能受影响');
  if (toNum(referenceUsage?.summary?.relation_refs, 0) > 0) messages.push('存在主数据关系引用，建议先解除关联');
  if (!messages.length) messages.push('未发现强依赖引用，可发起停用审批');
  return { level, messages, checked_at: nowIso() };
};

const buildObjectItems = (db, objectType, keyword = '', includeDisabled = false, limit = OBJECT_ITEMS_MAX_LIMIT) => {
  const cfg = getObjectConfig(objectType);
  if (!cfg) return [];

  const today = getNowDate();
  return getObjectRows(db, objectType)
    .filter((row) => includeDisabled || isActiveRow(row))
    .map((row) => {
      const beginDate = dateText(row?.begin_date);
      const endDate = dateText(row?.end_date);
      const daysToExpiry = endDate
        ? Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000)
        : null;
      return {
        id: toNum(row.id, 0),
        code: getRowCode(cfg, row),
        name: getRowName(cfg, row),
        status: toNum(row.status, 1),
        effective_state: cfg.relation ? relationState(row) : '',
        begin_date: beginDate,
        end_date: endDate,
        days_to_expiry: daysToExpiry
      };
    })
    .filter((item) => (
      !keyword
      || containsText(item.code, keyword)
      || containsText(item.name, keyword)
    ))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .slice(0, Math.max(1, toNum(limit, OBJECT_ITEMS_MAX_LIMIT)));
};

const createVersion = (db, payload) => {
  const row = {
    id: nextId(db.platform.mdm_versions),
    object_type: payload.object_type,
    target_id: payload.target_id,
    target_code: payload.target_code,
    target_name: payload.target_name || '',
    version_no: findVersionNo(db.platform.mdm_versions, payload.object_type, payload.target_code),
    request_id: payload.request_id,
    request_no: payload.request_no,
    action: payload.action,
    before_snapshot: clone(payload.before_snapshot),
    after_snapshot: clone(payload.after_snapshot),
    changed_fields: buildChangedFields(payload.before_snapshot, payload.after_snapshot),
    operator: payload.operator || '系统',
    effective_at: nowIso(),
    created_at: nowIso()
  };
  db.platform.mdm_versions.push(row);
  return row;
};

const buildCreatePayload = (source) => {
  const now = nowIso();
  const payload = {
    ...clone(source || {}),
    status: source?.status === undefined ? 1 : toNum(source.status, 1)
  };
  if (!payload.created_time) payload.created_time = now;
  payload.updated_time = now;
  return payload;
};

const applyApprovedRequest = (db, requestRow, operator) => {
  const cfg = getObjectConfig(requestRow.object_type);
  if (!cfg) throw new Error('对象类型不支持');

  const rows = getObjectRows(db, requestRow.object_type);
  if (!rows) throw new Error('目标对象不存在');

  let beforeSnapshot = null;
  let afterSnapshot = null;
  let target = findTargetRow(db, requestRow.object_type, requestRow.target_id, requestRow.target_code);

  if (requestRow.action === 'CREATE') {
    const data = buildCreatePayload(requestRow.change_after || {});
    if (cfg.codeField !== 'id') {
      const nextCode = normalize(data[cfg.codeField]);
      if (!nextCode) throw new Error('新增对象编码不能为空');
      const duplicated = rows.some((row) => String(row[cfg.codeField]) === nextCode && Number(row.status ?? 1) !== 0);
      if (duplicated) throw new Error('对象编码已存在');
    }
    data.id = nextId(rows);
    rows.push(data);
    target = data;
    afterSnapshot = clone(data);
  } else if (requestRow.action === 'UPDATE') {
    if (!target) throw new Error('更新对象不存在');
    beforeSnapshot = clone(target);
    const patch = clone(requestRow.change_after || {});
    delete patch.id;
    if (cfg.codeField && cfg.codeField !== 'id') delete patch[cfg.codeField];
    Object.assign(target, patch, { updated_time: nowIso() });
    afterSnapshot = clone(target);
  } else if (requestRow.action === 'DISABLE') {
    if (!target) throw new Error('停用对象不存在');
    beforeSnapshot = clone(target);
    target.status = 0;
    if (cfg.table === 'sku') target.lifecycle_status = 'INACTIVE';
    target.updated_time = nowIso();
    afterSnapshot = clone(target);
  } else {
    throw new Error('变更动作不支持');
  }

  const targetCode = getRowCode(cfg, target);
  const targetName = getRowName(cfg, target);
  const version = createVersion(db, {
    object_type: requestRow.object_type,
    target_id: target?.id || requestRow.target_id || 0,
    target_code: targetCode,
    target_name: targetName,
    request_id: requestRow.id,
    request_no: requestRow.request_no,
    action: requestRow.action,
    before_snapshot: beforeSnapshot,
    after_snapshot: afterSnapshot,
    operator
  });

  requestRow.target_id = target?.id || requestRow.target_id || 0;
  requestRow.target_code = targetCode;
  requestRow.target_name = targetName;
  requestRow.change_before = beforeSnapshot;
  requestRow.change_after = afterSnapshot;
  requestRow.changed_fields = buildChangedFields(beforeSnapshot, afterSnapshot);
  requestRow.version_no = version.version_no;
  return { target: afterSnapshot, version };
};
const runRuleCheck = (db, rule) => {
  const issues = [];
  const objectType = normalize(rule.object_type).toUpperCase();
  const cfg = getObjectConfig(objectType);
  if (!cfg) return issues;

  const rows = getObjectRows(db, objectType).filter((row) => isActiveRow(row));
  const config = rule.config && typeof rule.config === 'object' ? rule.config : {};

  if (rule.rule_type === 'UNIQUE') {
    const fields = arr(config.fields).map((f) => normalize(f)).filter(Boolean);
    if (!fields.length) return issues;
    const map = new Map();
    rows.forEach((row) => {
      const key = fields.map((f) => String(row[f] || '')).join('|');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    map.forEach((items, key) => {
      if (items.length <= 1) return;
      items.forEach((row) => {
        issues.push({
          object_type: objectType,
          target_id: row.id || 0,
          target_code: getRowCode(cfg, row),
          message: `唯一性校验失败: ${fields.join('+')}=${key}`,
          detail: { fields, key, duplicate_count: items.length },
          severity: 'HIGH'
        });
      });
    });
    return issues;
  }

  if (rule.rule_type === 'REQUIRED') {
    const fields = arr(config.fields).map((f) => normalize(f)).filter(Boolean);
    rows.forEach((row) => {
      const missed = fields.filter((f) => normalize(row[f]) === '');
      if (!missed.length) return;
      issues.push({
        object_type: objectType,
        target_id: row.id || 0,
        target_code: getRowCode(cfg, row),
        message: `必填校验失败: ${missed.join(',')} 为空`,
        detail: { fields: missed },
        severity: 'MEDIUM'
      });
    });
    return issues;
  }

  if (rule.rule_type === 'FORMAT') {
    const field = normalize(config.field);
    const pattern = normalize(config.pattern);
    if (!field || !pattern) return issues;
    let reg = null;
    try {
      reg = new RegExp(pattern);
    } catch {
      return issues;
    }
    rows.forEach((row) => {
      const value = String(row[field] || '');
      if (!value || reg.test(value)) return;
      issues.push({
        object_type: objectType,
        target_id: row.id || 0,
        target_code: getRowCode(cfg, row),
        message: `格式校验失败: ${field}=${value}`,
        detail: { field, pattern, value },
        severity: 'MEDIUM'
      });
    });
    return issues;
  }

  if (rule.rule_type === 'REFERENCE') {
    const field = normalize(config.field);
    const refObjectType = normalize(config.ref_object_type).toUpperCase();
    const refField = normalize(config.ref_field);
    const refCfg = getObjectConfig(refObjectType);
    if (!field || !refCfg) return issues;
    const refRows = getObjectRows(db, refObjectType).filter((row) => isActiveRow(row));
    const keyField = refField || refCfg.codeField;
    const refSet = new Set(refRows.map((row) => String(row[keyField] || '')));
    rows.forEach((row) => {
      const value = String(row[field] || '');
      if (!value || refSet.has(value)) return;
      issues.push({
        object_type: objectType,
        target_id: row.id || 0,
        target_code: getRowCode(cfg, row),
        message: `引用校验失败: ${field}=${value} 不存在于 ${refObjectType}`,
        detail: { field, value, ref_object_type: refObjectType, ref_field: keyField },
        severity: 'HIGH'
      });
    });
    return issues;
  }

  if (rule.rule_type === 'TIME_RANGE') {
    const beginField = normalize(config.begin_field || 'begin_date');
    const endField = normalize(config.end_field || 'end_date');
    rows.forEach((row) => {
      const begin = dateText(row[beginField]);
      const end = dateText(row[endField]);
      if (!begin || !end || begin <= end) return;
      issues.push({
        object_type: objectType,
        target_id: row.id || 0,
        target_code: getRowCode(cfg, row),
        message: `时间区间校验失败: ${beginField}(${begin}) > ${endField}(${end})`,
        detail: { begin_field: beginField, end_field: endField, begin, end },
        severity: 'HIGH'
      });
    });
    return issues;
  }

  if (rule.rule_type === 'CROSS_OBJECT') {
    const kind = normalize(config.kind).toUpperCase();
    if (kind === 'WAREHOUSE_SKU_COVERAGE') {
      const relationSet = new Set(
        arr(db.master.rltn_warehouse_sku)
          .filter((row) => isActiveRow(row))
          .map((row) => String(row.sku_code || ''))
      );
      rows.forEach((row) => {
        const skuCode = String(row.sku_code || '');
        const lifecycle = normalize(row.lifecycle_status || '').toUpperCase();
        if (!skuCode || lifecycle === 'INACTIVE' || lifecycle === 'OBSOLETE') return;
        if (relationSet.has(skuCode)) return;
        issues.push({
          object_type: objectType,
          target_id: row.id || 0,
          target_code: skuCode,
          message: `跨对象校验失败: SKU ${skuCode} 缺少仓库-SKU关系`,
          detail: { kind, sku_code: skuCode },
          severity: 'HIGH'
        });
      });
    }
    return issues;
  }

  return issues;
};

const runQualityCheckCore = (db, body = {}, operator = '系统') => {
  ensureMdmGovernanceStructures(db);

  const selectedRuleIds = arr(body.rule_ids).map((id) => toNum(id, 0)).filter((id) => id > 0);
  const selectedRuleCodes = arr(body.rule_codes).map((code) => normalize(code).toUpperCase()).filter(Boolean);
  const selectedObjectTypes = arr(body.object_types).map((code) => normalize(code).toUpperCase()).filter(Boolean);
  const rules = arr(db.platform.mdm_quality_rules).filter((row) => Number(row.status) === 1)
    .filter((row) => (!selectedRuleIds.length || selectedRuleIds.includes(Number(row.id))))
    .filter((row) => (!selectedRuleCodes.length || selectedRuleCodes.includes(String(row.rule_code).toUpperCase())))
    .filter((row) => (!selectedObjectTypes.length || selectedObjectTypes.includes(String(row.object_type))));
  if (!rules.length) throw new Error('没有可执行的规则');

  const run = {
    id: nextId(db.platform.mdm_quality_runs),
    run_no: buildNo('QR', db.platform.mdm_quality_runs, 'run_no'),
    trigger_mode: normalize(body.trigger_mode).toUpperCase() || 'MANUAL',
    operator,
    run_scope: {
      rule_ids: rules.map((row) => row.id),
      rule_codes: rules.map((row) => row.rule_code),
      object_types: [...new Set(rules.map((row) => row.object_type))]
    },
    total_rules: rules.length,
    total_issues: 0,
    status: 'DONE',
    started_at: nowIso(),
    finished_at: '',
    created_at: nowIso()
  };
  db.platform.mdm_quality_runs.push(run);

  const generatedIssues = [];
  rules.forEach((rule) => {
    const issues = runRuleCheck(db, rule);
    issues.forEach((issue) => {
      generatedIssues.push({
        id: nextId(arr(db.platform.mdm_quality_issues).concat(generatedIssues)),
        run_id: run.id,
        rule_id: rule.id,
        rule_code: rule.rule_code,
        rule_name: rule.rule_name,
        object_type: issue.object_type,
        target_id: issue.target_id,
        target_code: issue.target_code,
        severity: issue.severity || 'MEDIUM',
        status: 'OPEN',
        message: issue.message,
        detail: clone(issue.detail),
        created_at: nowIso(),
        updated_at: nowIso(),
        resolved_by: '',
        resolved_at: '',
        resolution: ''
      });
    });
  });
  db.platform.mdm_quality_issues.push(...generatedIssues);

  run.total_issues = generatedIssues.length;
  run.finished_at = nowIso();
  return {
    run,
    issue_count: generatedIssues.length,
    issue_preview: generatedIssues.slice(0, 100)
  };
};

const createConflictRows = (db, taskId) => {
  const rows = [];
  const pushConflict = (payload) => {
    rows.push({
      id: nextId(arr(db.platform.mdm_conflicts).concat(rows)),
      task_id: taskId,
      conflict_type: payload.conflict_type,
      conflict_title: payload.conflict_title,
      object_type: payload.object_type,
      target_code: payload.target_code || '',
      target_id: payload.target_id || 0,
      related_keys: arr(payload.related_keys),
      detail: clone(payload.detail),
      status: 'OPEN',
      handler: '',
      handled_at: '',
      handle_comment: '',
      created_at: nowIso(),
      updated_at: nowIso()
    });
  };

  const resellerRows = arr(db.master.reseller_relation).filter((row) => isActiveRow(row));
  for (let i = 0; i < resellerRows.length; i += 1) {
    for (let j = i + 1; j < resellerRows.length; j += 1) {
      const a = resellerRows[i];
      const b = resellerRows[j];
      if (String(a.reseller_code) !== String(b.reseller_code)) continue;
      if (String(a.sku_code) !== String(b.sku_code)) continue;
      if (!overlapDateRange(a.begin_date, a.end_date, b.begin_date, b.end_date)) continue;
      pushConflict({
        conflict_type: 'RESELLER_SKU_TIME_OVERLAP',
        conflict_title: '同一经销商同一SKU授权时间重叠',
        object_type: 'RESELLER_RLTN',
        target_code: `${a.reseller_code}|${a.sku_code}`,
        related_keys: [a.id, b.id],
        detail: {
          first: { id: a.id, begin_date: a.begin_date, end_date: a.end_date },
          second: { id: b.id, begin_date: b.begin_date, end_date: b.end_date }
        }
      });
    }
  }

  const orgRows = arr(db.master.rltn_org_reseller).filter((row) => isActiveRow(row));
  const orgMap = new Map();
  orgRows.forEach((row) => {
    const key = `${row.org_code}|${row.reseller_code}`;
    if (!orgMap.has(key)) orgMap.set(key, []);
    orgMap.get(key).push(row);
  });
  orgMap.forEach((items, key) => {
    if (items.length <= 1) return;
    pushConflict({
      conflict_type: 'ORG_RESELLER_DUPLICATE',
      conflict_title: '组织与经销商关系重复',
      object_type: 'RLTN_ORG_RESELLER',
      target_code: key,
      related_keys: items.map((row) => row.id),
      detail: { count: items.length }
    });
  });

  const productRows = arr(db.master.rltn_product_sku).filter((row) => isActiveRow(row));
  const productMap = new Map();
  productRows.forEach((row) => {
    const key = String(row.product_code || '');
    if (!key) return;
    if (!productMap.has(key)) productMap.set(key, []);
    productMap.get(key).push(row);
  });
  productMap.forEach((items, productCode) => {
    const skuSet = [...new Set(items.map((row) => String(row.sku_code || '')))].filter(Boolean);
    if (skuSet.length <= 1) return;
    pushConflict({
      conflict_type: 'PRODUCT_SKU_CONVERSION_CONFLICT',
      conflict_title: '产品与SKU转换关系冲突',
      object_type: 'RLTN_PRODUCT_SKU',
      target_code: productCode,
      related_keys: items.map((row) => row.id),
      detail: { product_code: productCode, sku_codes: skuSet }
    });
  });

  const activeSkuCodes = new Set(
    arr(db.master.sku)
      .filter((row) => isActiveRow(row) && normalize(row.lifecycle_status).toUpperCase() !== 'INACTIVE')
      .map((row) => String(row.sku_code || ''))
  );
  const relationSkuSet = new Set(
    arr(db.master.rltn_warehouse_sku)
      .filter((row) => isActiveRow(row))
      .map((row) => String(row.sku_code || ''))
  );
  activeSkuCodes.forEach((skuCode) => {
    if (relationSkuSet.has(skuCode)) return;
    pushConflict({
      conflict_type: 'WAREHOUSE_SKU_MISSING',
      conflict_title: '仓库与SKU关系缺失，可能导致不可履约',
      object_type: 'SKU',
      target_code: skuCode,
      related_keys: [],
      detail: { sku_code: skuCode }
    });
  });

  return rows;
};

const createRequestCore = (db, body, operator) => {
  const objectType = normalize(body.object_type).toUpperCase();
  const action = normalize(body.action).toUpperCase();
  const submit = Boolean(body.submit);
  const reason = normalize(body.reason);
  const cfg = getObjectConfig(objectType);
  if (!cfg) throw new Error('对象类型不支持');
  if (!REQUEST_ACTION.includes(action)) throw new Error('变更动作不支持');
  if (!reason) throw new Error('申请原因不能为空');

  let target = null;
  if (action !== 'CREATE') {
    target = findTargetRow(db, objectType, body.target_id, body.target_code);
    if (!target) throw new Error('目标对象不存在');
  }
  if (action === 'UPDATE' && Number(target?.status ?? 1) === 0) throw new Error('目标对象已停用，不允许修改');
  if (action === 'DISABLE' && Number(target?.status ?? 1) === 0) throw new Error('目标对象已停用');

  const now = nowIso();
  const requestNo = buildNo('CR', db.platform.mdm_change_requests, 'request_no');
  const changeBefore = target ? clone(target) : null;
  const changeAfter = action === 'DISABLE'
    ? clone(target)
    : clone(body.change_after || (action === 'UPDATE' ? target : {}));
  let impactObjects = normalizeStringList(body.impact_objects);
  const attachments = normalizeAttachmentList(body.attachments);
  let riskSummary = clone(body.risk_summary || null);

  if (action === 'DISABLE' && target) {
    const code = getRowCode(cfg, target);
    const usage = buildReferenceUsage(db, objectType, code);
    const risk = buildDisableRisk(usage);
    riskSummary = { risk, usage_summary: usage.summary };
    if (!impactObjects.length) {
      const generatedImpact = [];
      if (toNum(usage.summary.order_refs, 0) > 0) generatedImpact.push('ORDER');
      if (toNum(usage.summary.inventory_refs, 0) > 0) generatedImpact.push('INVENTORY');
      if (toNum(usage.summary.relation_refs, 0) > 0) generatedImpact.push('RELATION');
      if (toNum(usage.summary.transfer_refs, 0) > 0) generatedImpact.push('TRANSFER');
      impactObjects = generatedImpact;
    }
  }

  const row = {
    id: nextId(db.platform.mdm_change_requests),
    request_no: requestNo,
    object_type: objectType,
    action,
    status: submit ? 'PENDING' : 'DRAFT',
    target_id: target?.id || toNum(body.target_id, 0),
    target_code: target ? getRowCode(cfg, target) : normalize(body.target_code),
    target_name: target ? getRowName(cfg, target) : normalize(body.target_name),
    reason,
    impact_objects: impactObjects,
    attachments,
    change_before: changeBefore,
    change_after: changeAfter,
    changed_fields: buildChangedFields(changeBefore, changeAfter),
    risk_summary: riskSummary,
    submitter: submit ? operator : '',
    submitted_at: submit ? now : '',
    reviewer: '',
    reviewed_at: '',
    review_comment: '',
    effective_at: '',
    version_no: null,
    created_at: now,
    updated_at: now
  };
  db.platform.mdm_change_requests.push(row);

  appendRequestLog(db, {
    request_id: row.id,
    request_no: row.request_no,
    action: 'CREATE',
    operator,
    comment: '创建申请',
    snapshot: row
  });
  if (submit) {
    appendRequestLog(db, {
      request_id: row.id,
      request_no: row.request_no,
      action: 'SUBMIT',
      operator,
      comment: '提交审批',
      snapshot: row
    });
  }
  return row;
};
const registerMdmGovernanceRoutes = ({ app, superAdminRequired, apiOk, apiErr }) => {
  app.get('/api/master/governance/config', superAdminRequired, (req, res) => {
    apiOk(res, req, {
      request_status: REQUEST_STATUS,
      request_action: REQUEST_ACTION,
      review_action: REVIEW_ACTION,
      quality_rule_types: QUALITY_RULE_TYPES,
      effective_states: EFFECTIVE_STATES,
      conflict_status: CONFLICT_STATUS,
      conflict_task_status: CONFLICT_TASK_STATUS,
      quality_issue_status: QUALITY_ISSUE_STATUS,
      object_types: Object.entries(OBJECT_CONFIG).map(([code, cfg]) => ({
        code,
        label: cfg.label,
        relation: cfg.relation
      }))
    }, '获取成功');
  });

  app.get('/api/master/governance/object-items', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const objectType = normalize(req.query?.objectType).toUpperCase();
    const keyword = normalize(req.query?.keyword);
    const includeDisabled = String(req.query?.includeDisabled) === '1';
    const limit = toNum(req.query?.limit, OBJECT_ITEMS_MAX_LIMIT);
    if (!getObjectConfig(objectType)) return apiErr(res, req, 400, '对象类型不支持');

    const list = buildObjectItems(db, objectType, keyword, includeDisabled, limit);
    apiOk(res, req, { list, total: list.length }, '获取成功');
  });

  app.get('/api/master/governance/requests', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const {
      page = 1,
      pageSize = 20,
      keyword = '',
      status = '',
      objectType = '',
      action = ''
    } = req.query || {};
    let rows = arr(db.platform.mdm_change_requests).map((row) => ({ ...row }));
    if (keyword) {
      rows = rows.filter((row) => (
        containsText(row.request_no, keyword)
        || containsText(row.target_code, keyword)
        || containsText(row.target_name, keyword)
        || containsText(row.reason, keyword)
      ));
    }
    if (status) rows = rows.filter((row) => String(row.status) === String(status));
    if (objectType) rows = rows.filter((row) => String(row.object_type) === String(objectType).toUpperCase());
    if (action) rows = rows.filter((row) => String(row.action) === String(action).toUpperCase());
    rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.get('/api/master/governance/requests/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const row = arr(db.platform.mdm_change_requests).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '申请单不存在');
    const logs = arr(db.platform.mdm_request_logs)
      .filter((item) => Number(item.request_id) === id)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    apiOk(res, req, { request: row, logs }, '获取成功');
  });

  app.post('/api/master/governance/requests', superAdminRequired, (req, res) => {
    const body = req.body || {};
    const operator = getOperatorName(req);
    let created = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        created = createRequestCore(db, body, operator);
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '创建申请失败');
    }
    apiOk(res, req, created, '创建成功');
  });

  app.put('/api/master/governance/requests/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const body = req.body || {};
    const operator = getOperatorName(req);
    let updated = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const row = arr(db.platform.mdm_change_requests).find((item) => Number(item.id) === id);
        if (!row) throw new Error('申请单不存在');
        if (!['DRAFT', 'REJECTED'].includes(String(row.status))) throw new Error('当前状态不允许编辑');

        if (body.reason !== undefined) row.reason = normalize(body.reason);
        if (body.impact_objects !== undefined) row.impact_objects = normalizeStringList(body.impact_objects);
        if (body.attachments !== undefined) row.attachments = normalizeAttachmentList(body.attachments);
        if (body.change_after !== undefined) row.change_after = clone(body.change_after);

        const target = findTargetRow(db, row.object_type, row.target_id, row.target_code);
        row.change_before = target ? clone(target) : row.change_before;
        row.changed_fields = buildChangedFields(row.change_before, row.change_after);
        row.updated_at = nowIso();

        appendRequestLog(db, {
          request_id: row.id,
          request_no: row.request_no,
          action: 'UPDATE',
          operator,
          comment: '更新申请内容',
          snapshot: row
        });
        updated = row;
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '更新申请失败');
    }
    apiOk(res, req, updated, '更新成功');
  });

  app.post('/api/master/governance/requests/:id/submit', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const body = req.body || {};
    const operator = getOperatorName(req);
    let updated = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const row = arr(db.platform.mdm_change_requests).find((item) => Number(item.id) === id);
        if (!row) throw new Error('申请单不存在');
        if (!['DRAFT', 'REJECTED'].includes(String(row.status))) throw new Error('当前状态不允许提交');
        if (body.reason !== undefined) row.reason = normalize(body.reason);
        row.status = 'PENDING';
        row.submitter = operator;
        row.submitted_at = nowIso();
        row.updated_at = nowIso();
        appendRequestLog(db, {
          request_id: row.id,
          request_no: row.request_no,
          action: 'SUBMIT',
          operator,
          comment: '提交审批',
          snapshot: row
        });
        updated = row;
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '提交失败');
    }
    apiOk(res, req, updated, '提交成功');
  });

  app.post('/api/master/governance/requests/:id/resubmit', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const body = req.body || {};
    const operator = getOperatorName(req);
    let updated = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const row = arr(db.platform.mdm_change_requests).find((item) => Number(item.id) === id);
        if (!row) throw new Error('申请单不存在');
        if (!['REJECTED', 'DRAFT'].includes(String(row.status))) throw new Error('当前状态不允许重新提交');
        if (body.reason !== undefined) row.reason = normalize(body.reason);
        row.status = 'PENDING';
        row.submitter = operator;
        row.submitted_at = nowIso();
        row.updated_at = nowIso();
        appendRequestLog(db, {
          request_id: row.id,
          request_no: row.request_no,
          action: 'RESUBMIT',
          operator,
          comment: '重新提交审批',
          snapshot: row
        });
        updated = row;
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '重新提交失败');
    }
    apiOk(res, req, updated, '重新提交成功');
  });

  app.post('/api/master/governance/requests/:id/review', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const body = req.body || {};
    const action = normalize(body.action).toUpperCase();
    const comment = normalize(body.comment);
    if (!REVIEW_ACTION.includes(action)) return apiErr(res, req, 400, 'action 仅支持 APPROVE/REJECT');
    const operator = getOperatorName(req);
    let reviewed = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const row = arr(db.platform.mdm_change_requests).find((item) => Number(item.id) === id);
        if (!row) throw new Error('申请单不存在');
        if (String(row.status) !== 'PENDING') throw new Error('申请单不在待审批状态');

        row.reviewer = operator;
        row.reviewed_at = nowIso();
        row.review_comment = comment;
        row.updated_at = nowIso();

        if (action === 'REJECT') {
          if (!comment) throw new Error('驳回时请填写审批意见');
          row.status = 'REJECTED';
          appendRequestLog(db, {
            request_id: row.id,
            request_no: row.request_no,
            action: 'REJECT',
            operator,
            comment: comment || '驳回',
            snapshot: row
          });
        } else {
          const applyResult = applyApprovedRequest(db, row, operator);
          row.status = 'EFFECTIVE';
          row.effective_at = nowIso();
          row.updated_at = nowIso();
          appendRequestLog(db, {
            request_id: row.id,
            request_no: row.request_no,
            action: 'APPROVE',
            operator,
            comment: comment || '审批通过',
            snapshot: { request: row, apply_result: applyResult }
          });
        }
        reviewed = row;
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '审批失败');
    }
    apiOk(res, req, reviewed, '审批完成');
  });

  app.get('/api/master/governance/versions', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const {
      page = 1,
      pageSize = 20,
      objectType = '',
      targetCode = '',
      targetId = ''
    } = req.query || {};
    let rows = arr(db.platform.mdm_versions).map((row) => ({ ...row }));
    const latestVersionMap = arr(db.platform.mdm_versions).reduce((acc, row) => {
      const key = `${row.object_type}::${row.target_code}`;
      const versionNo = toNum(row.version_no, 0);
      if (!acc[key] || versionNo > acc[key]) acc[key] = versionNo;
      return acc;
    }, {});
    rows = rows.map((row) => ({
      ...row,
      is_current: toNum(row.version_no, 0) === toNum(latestVersionMap[`${row.object_type}::${row.target_code}`], 0)
    }));
    if (objectType) rows = rows.filter((row) => String(row.object_type) === String(objectType).toUpperCase());
    if (targetCode) rows = rows.filter((row) => String(row.target_code) === String(targetCode));
    if (targetId !== '') rows = rows.filter((row) => Number(row.target_id) === toNum(targetId, 0));
    rows.sort((a, b) => toNum(b.version_no, 0) - toNum(a.version_no, 0) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.get('/api/master/governance/versions/:id/diff', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const row = arr(db.platform.mdm_versions).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '版本记录不存在');
    apiOk(res, req, {
      ...row,
      changed_fields: buildChangedFields(row.before_snapshot, row.after_snapshot)
    }, '获取成功');
  });

  app.get('/api/master/governance/effective', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const {
      page = 1,
      pageSize = 20,
      objectType = '',
      state = '',
      keyword = '',
      startDate = '',
      endDate = ''
    } = req.query || {};

    const targetTypes = objectType
      ? [String(objectType).toUpperCase()]
      : RELATION_OBJECT_TYPES;
    const today = getNowDate();

    let rows = [];
    targetTypes.forEach((type) => {
      const cfg = getObjectConfig(type);
      if (!cfg) return;
      arr(getObjectRows(db, type)).forEach((row) => {
        const begin = dateText(row.begin_date);
        const end = dateText(row.end_date);
        const itemState = relationState(row);
        if (state && itemState !== String(state).toUpperCase()) return;
        if (startDate && end && end < dateText(startDate)) return;
        if (endDate && begin && begin > dateText(endDate)) return;
        const code = getRowCode(cfg, row);
        const name = getRowName(cfg, row);
        if (keyword && ![code, name, row.reseller_code, row.sku_code, row.org_code, row.product_code].some((v) => containsText(v, keyword))) return;
        rows.push({
          object_type: type,
          object_label: cfg.label,
          row_id: row.id,
          target_code: code,
          target_name: name,
          begin_date: begin,
          end_date: end,
          days_to_expiry: end ? Math.floor((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000) : null,
          status: row.status,
          effective_state: itemState,
          detail: row
        });
      });
    });

    rows.sort((a, b) => String(a.end_date || '').localeCompare(String(b.end_date || '')) || String(a.target_code || '').localeCompare(String(b.target_code || '')));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.get('/api/master/governance/quality/rules', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const {
      page = 1,
      pageSize = 20,
      keyword = '',
      type = '',
      objectType = '',
      status = ''
    } = req.query || {};
    let rows = arr(db.platform.mdm_quality_rules).map((row) => ({ ...row }));
    if (keyword) rows = rows.filter((row) => containsText(row.rule_code, keyword) || containsText(row.rule_name, keyword));
    if (type) rows = rows.filter((row) => String(row.rule_type) === String(type).toUpperCase());
    if (objectType) rows = rows.filter((row) => String(row.object_type) === String(objectType).toUpperCase());
    if (status !== '') rows = rows.filter((row) => Number(row.status) === toNum(status, 1));
    rows.sort((a, b) => toNum(a.id, 0) - toNum(b.id, 0));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.post('/api/master/governance/quality/rules', superAdminRequired, (req, res) => {
    const body = req.body || {};
    const operator = getOperatorName(req);
    let created = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const ruleType = normalize(body.rule_type).toUpperCase();
        const objectType = normalize(body.object_type).toUpperCase();
        if (!QUALITY_RULE_TYPES.includes(ruleType)) throw new Error('规则类型不支持');
        if (!getObjectConfig(objectType)) throw new Error('对象类型不支持');
        const code = normalize(body.rule_code).toUpperCase();
        if (!code) throw new Error('规则编码不能为空');
        if (arr(db.platform.mdm_quality_rules).some((row) => String(row.rule_code) === code)) throw new Error('规则编码已存在');

        created = {
          id: nextId(db.platform.mdm_quality_rules),
          rule_code: code,
          rule_name: normalize(body.rule_name) || code,
          rule_type: ruleType,
          object_type: objectType,
          config: clone(body.config || {}),
          status: body.status === undefined ? 1 : toNum(body.status, 1),
          remark: normalize(body.remark),
          created_by: operator,
          created_at: nowIso(),
          updated_at: nowIso()
        };
        db.platform.mdm_quality_rules.push(created);
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '新增规则失败');
    }
    apiOk(res, req, created, '新增成功');
  });

  app.put('/api/master/governance/quality/rules/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const body = req.body || {};
    let updated = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const row = arr(db.platform.mdm_quality_rules).find((item) => Number(item.id) === id);
        if (!row) throw new Error('规则不存在');
        if (body.rule_name !== undefined) row.rule_name = normalize(body.rule_name) || row.rule_name;
        if (body.config !== undefined) row.config = clone(body.config);
        if (body.status !== undefined) row.status = toNum(body.status, row.status);
        if (body.remark !== undefined) row.remark = normalize(body.remark);
        row.updated_at = nowIso();
        updated = row;
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '更新规则失败');
    }
    apiOk(res, req, updated, '更新成功');
  });
  app.post('/api/master/governance/quality/run', superAdminRequired, (req, res) => {
    const body = req.body || {};
    const operator = getOperatorName(req);
    let runSummary = null;
    try {
      updateDb((db) => {
        runSummary = runQualityCheckCore(db, body, operator);
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '执行失败');
    }
    apiOk(res, req, runSummary, '执行完成');
  });

  app.get('/api/master/governance/quality/runs', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const { page = 1, pageSize = 20 } = req.query || {};
    const rows = arr(db.platform.mdm_quality_runs)
      .map((row) => ({ ...row }))
      .sort((a, b) => toNum(b.id, 0) - toNum(a.id, 0));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.get('/api/master/governance/quality/issues', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const {
      page = 1,
      pageSize = 20,
      runId = '',
      status = '',
      objectType = '',
      ruleId = '',
      keyword = ''
    } = req.query || {};
    let rows = arr(db.platform.mdm_quality_issues).map((row) => ({ ...row }));
    if (runId !== '') rows = rows.filter((row) => Number(row.run_id) === toNum(runId, 0));
    if (status) rows = rows.filter((row) => String(row.status) === String(status).toUpperCase());
    if (objectType) rows = rows.filter((row) => String(row.object_type) === String(objectType).toUpperCase());
    if (ruleId !== '') rows = rows.filter((row) => Number(row.rule_id) === toNum(ruleId, 0));
    if (keyword) {
      rows = rows.filter((row) => (
        containsText(row.target_code, keyword)
        || containsText(row.message, keyword)
        || containsText(row.rule_name, keyword)
      ));
    }
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.post('/api/master/governance/quality/issues/:id/resolve', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const body = req.body || {};
    const operator = getOperatorName(req);
    let updated = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const row = arr(db.platform.mdm_quality_issues).find((item) => Number(item.id) === id);
        if (!row) throw new Error('质量问题不存在');
        row.status = 'RESOLVED';
        row.resolution = normalize(body.resolution || body.comment || '已处理');
        row.resolved_by = operator;
        row.resolved_at = nowIso();
        row.updated_at = nowIso();
        updated = row;
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '处理失败');
    }
    apiOk(res, req, updated, '处理成功');
  });

  app.post('/api/master/governance/conflicts/tasks/run', superAdminRequired, (req, res) => {
    const operator = getOperatorName(req);
    const body = req.body || {};
    let out = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const task = {
          id: nextId(db.platform.mdm_conflict_tasks),
          task_no: buildNo('CF', db.platform.mdm_conflict_tasks, 'task_no'),
          status: 'RUNNING',
          scope: clone(body.scope || {}),
          operator,
          total_conflicts: 0,
          open_conflicts: 0,
          resolved_conflicts: 0,
          started_at: nowIso(),
          finished_at: '',
          created_at: nowIso()
        };
        db.platform.mdm_conflict_tasks.push(task);

        const generated = createConflictRows(db, task.id);
        db.platform.mdm_conflicts.push(...generated);

        task.total_conflicts = generated.length;
        task.open_conflicts = generated.length;
        task.resolved_conflicts = 0;
        task.status = 'DONE';
        task.finished_at = nowIso();
        out = { task, conflicts: generated.slice(0, 100) };
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '检测失败');
    }
    apiOk(res, req, out, '检测完成');
  });

  app.get('/api/master/governance/conflicts/tasks', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const { page = 1, pageSize = 20, status = '' } = req.query || {};
    let rows = arr(db.platform.mdm_conflict_tasks).map((row) => ({ ...row }));
    if (status) rows = rows.filter((row) => String(row.status) === String(status).toUpperCase());
    rows.sort((a, b) => toNum(b.id, 0) - toNum(a.id, 0));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.get('/api/master/governance/conflicts', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const {
      page = 1,
      pageSize = 20,
      taskId = '',
      status = '',
      type = '',
      keyword = ''
    } = req.query || {};
    let rows = arr(db.platform.mdm_conflicts).map((row) => ({ ...row }));
    if (taskId !== '') rows = rows.filter((row) => Number(row.task_id) === toNum(taskId, 0));
    if (status) rows = rows.filter((row) => String(row.status) === String(status).toUpperCase());
    if (type) rows = rows.filter((row) => String(row.conflict_type) === String(type).toUpperCase());
    if (keyword) {
      rows = rows.filter((row) => (
        containsText(row.target_code, keyword)
        || containsText(row.conflict_title, keyword)
        || containsText(row.conflict_type, keyword)
      ));
    }
    rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    apiOk(res, req, paginateRows(rows, page, pageSize), '获取成功');
  });

  app.get('/api/master/governance/conflicts/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const row = arr(db.platform.mdm_conflicts).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '冲突不存在');
    apiOk(res, req, row, '获取成功');
  });

  app.post('/api/master/governance/conflicts/:id/handle', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id, 0);
    const body = req.body || {};
    const status = normalize(body.status || body.action).toUpperCase();
    if (!CONFLICT_STATUS.includes(status)) return apiErr(res, req, 400, '状态不支持');
    const operator = getOperatorName(req);
    let updated = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const row = arr(db.platform.mdm_conflicts).find((item) => Number(item.id) === id);
        if (!row) throw new Error('冲突不存在');
        row.status = status;
        row.handler = operator;
        row.handle_comment = normalize(body.comment || row.handle_comment);
        row.handled_at = nowIso();
        row.updated_at = nowIso();
        updated = row;
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '处理失败');
    }
    apiOk(res, req, updated, '处理成功');
  });

  app.get('/api/master/governance/references', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const objectType = normalize(req.query?.objectType).toUpperCase();
    const targetId = toNum(req.query?.targetId, 0);
    const targetCode = normalize(req.query?.targetCode);
    if (!getObjectConfig(objectType)) return apiErr(res, req, 400, '对象类型不支持');
    let code = targetCode;
    if (!code && targetId) {
      const row = findTargetRow(db, objectType, targetId, '');
      const cfg = getObjectConfig(objectType);
      code = row ? getRowCode(cfg, row) : '';
    }
    if (!code) return apiErr(res, req, 400, '目标编码不能为空');
    const usage = buildReferenceUsage(db, objectType, code);
    apiOk(res, req, usage, '获取成功');
  });

  app.post('/api/master/governance/disable-check', superAdminRequired, (req, res) => {
    const db = readDb();
    ensureMdmGovernanceStructures(db);
    const body = req.body || {};
    const objectType = normalize(body.object_type || body.objectType).toUpperCase();
    const target = findTargetRow(db, objectType, body.target_id || body.targetId, body.target_code || body.targetCode);
    if (!getObjectConfig(objectType)) return apiErr(res, req, 400, '对象类型不支持');
    if (!target) return apiErr(res, req, 404, '目标对象不存在');
    const cfg = getObjectConfig(objectType);
    const code = getRowCode(cfg, target);
    const usage = buildReferenceUsage(db, objectType, code);
    const risk = buildDisableRisk(usage);
    apiOk(res, req, {
      object_type: objectType,
      target_id: target.id,
      target_code: code,
      target_name: getRowName(cfg, target),
      reference_usage: usage,
      risk
    }, '校验成功');
  });

  app.post('/api/master/governance/disable-requests', superAdminRequired, (req, res) => {
    const body = req.body || {};
    const objectType = normalize(body.object_type || body.objectType).toUpperCase();
    let created = null;
    try {
      updateDb((db) => {
        ensureMdmGovernanceStructures(db);
        const target = findTargetRow(db, objectType, body.target_id || body.targetId, body.target_code || body.targetCode);
        if (!getObjectConfig(objectType)) throw new Error('对象类型不支持');
        if (!target) throw new Error('目标对象不存在');
        const cfg = getObjectConfig(objectType);
        const code = getRowCode(cfg, target);
        const usage = buildReferenceUsage(db, objectType, code);
        const risk = buildDisableRisk(usage);
        created = createRequestCore(db, {
          object_type: objectType,
          action: 'DISABLE',
          reason: normalize(body.reason) || '停用申请',
          target_id: target.id,
          target_code: code,
          target_name: getRowName(cfg, target),
          impact_objects: normalizeStringList(body.impact_objects),
          attachments: normalizeAttachmentList(body.attachments),
          change_after: clone(target),
          risk_summary: { risk, usage_summary: usage.summary },
          submit: body.submit === undefined ? true : Boolean(body.submit)
        }, getOperatorName(req));
      });
    } catch (error) {
      return apiErr(res, req, 400, error?.message || '停用申请创建失败');
    }
    apiOk(res, req, created, '停用申请已创建');
  });
};

module.exports = {
  registerMdmGovernanceRoutes,
  ensureMdmGovernanceStructures,
  runQualityCheckCore
};
