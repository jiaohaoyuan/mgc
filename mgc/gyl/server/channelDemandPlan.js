const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const PLAN_STATUS = {
    DRAFT: 0,
    SUBMITTING: 1,
    PENDING_CONFIRM: 2,
    CONFIRMED: 3,
    DELETED: -1
};

const LOCK_RULE_STATUS = {
    FUTURE: 'FUTURE',
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED'
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

const ensureChannelDemandPlanStructures = (db) => {
    db.biz = db.biz || {};
    db.master = db.master || {};

    db.biz.channel_demand_plans = arr(db.biz.channel_demand_plans);
    db.biz.channel_demand_plan_channels = arr(db.biz.channel_demand_plan_channels);
    db.biz.channel_demand_plan_skus = arr(db.biz.channel_demand_plan_skus);
    db.biz.channel_demand_plan_versions = arr(db.biz.channel_demand_plan_versions);
    db.biz.channel_demand_plan_channel_statuses = arr(db.biz.channel_demand_plan_channel_statuses);
    db.biz.channel_demand_plan_data = arr(db.biz.channel_demand_plan_data);
    db.biz.product_lock_rules = arr(db.biz.product_lock_rules);
    db.biz.downstream_demand_plan_jobs = arr(db.biz.downstream_demand_plan_jobs);

    db.master.channel = arr(db.master.channel);
    db.master.sku = arr(db.master.sku);
    db.master.category = arr(db.master.category);
};

const normalizeDateKey = (value, label = '日期') => {
    const text = normalize(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label}格式错误，应为 YYYY-MM-DD`);
    return text;
};

const getTodayKey = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const listActiveLv2Channels = (db) =>
    arr(db.master.channel)
        .filter((row) => String(row.level) === '2' && Number(row.status ?? 1) === 1)
        .map((row) => ({
            channel_code: row.channel_code,
            channel_name: row.channel_name,
            parent_code: row.parent_code || '',
            parent_name: row.parent_name || ''
        }));

const listActiveSkus = (db) =>
    arr(db.master.sku)
        .filter((row) => Number(row.status ?? 1) === 1)
        .map((row) => ({
            sku_code: row.sku_code,
            sku_name: row.sku_name,
            category_code: row.category_code || '',
            category_name: row.category_name || '',
            status: row.status
        }));

const listActiveCategories = (db) =>
    arr(db.master.category)
        .filter((row) => Number(row.status ?? 1) === 1)
        .map((row) => ({
            category_code: row.category_code,
            category_name: row.category_name,
            level: row.level
        }));

const getSkuMap = (db) => new Map(listActiveSkus(db).map((row) => [String(row.sku_code), row]));
const getChannelMap = (db) => new Map(listActiveLv2Channels(db).map((row) => [String(row.channel_code), row]));
const getCategoryMap = (db) => new Map(arr(db.master.category).map((row) => [String(row.category_code), row]));

const buildPlanCode = () => {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `CDP-${y}${m}${d}-${String(Date.now()).slice(-4)}`;
};

const parseWeekCode = (weekCode) => {
    const match = /^(\d{4})W(0[1-9]|[1-4]\d|5[0-3])$/.exec(normalize(weekCode));
    if (!match) throw new Error('周格式错误，应为 YYYYWww，例如 2026W18');
    return {
        year: Number(match[1]),
        week: Number(match[2])
    };
};

const toDateText = (date) => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getIsoWeekParts = (date) => {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return {
        year: target.getUTCFullYear(),
        week
    };
};

const buildIsoWeekStart = (year, week) => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    jan4.setUTCDate(jan4.getUTCDate() - day + 1 + ((week - 1) * 7));
    return jan4;
};

const formatWeekCode = (year, week) => `${year}W${String(week).padStart(2, '0')}`;

const addWeeksToWeekCode = (weekCode, offset) => {
    const { year, week } = parseWeekCode(weekCode);
    const start = buildIsoWeekStart(year, week);
    start.setUTCDate(start.getUTCDate() + (offset * 7));
    const parts = getIsoWeekParts(start);
    return formatWeekCode(parts.year, parts.week);
};

const buildWeekSequence = (beginWeek, weekCount) => {
    const count = Math.max(1, toNum(weekCount, 8));
    const rows = [];
    for (let i = 0; i < count; i += 1) {
        const planWeek = addWeeksToWeekCode(beginWeek, i);
        const { year, week } = parseWeekCode(planWeek);
        const weekStart = buildIsoWeekStart(year, week);
        const weekEnd = new Date(weekStart.getTime());
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        rows.push({
            plan_week: planWeek,
            week_start_date: toDateText(weekStart),
            week_end_date: toDateText(weekEnd)
        });
    }
    return rows;
};

const rangesOverlap = (startA, endA, startB, endB) => startA <= endB && startB <= endA;

const getRuleLifecycleStatus = (rule, today = getTodayKey()) => {
    const startDate = normalize(rule.start_date);
    const endDate = normalize(rule.end_date);
    if (!startDate || !endDate) return LOCK_RULE_STATUS.FUTURE;
    if (today < startDate) return LOCK_RULE_STATUS.FUTURE;
    if (today > endDate) return LOCK_RULE_STATUS.EXPIRED;
    return LOCK_RULE_STATUS.ACTIVE;
};

const getRuleLifecycleLabel = (status) => {
    if (status === LOCK_RULE_STATUS.ACTIVE) return '生效中';
    if (status === LOCK_RULE_STATUS.EXPIRED) return '已过期';
    return '未生效';
};

const getPlanScopedChannels = (db, planCode) =>
    arr(db.biz.channel_demand_plan_channels).filter((row) => String(row.plan_code) === String(planCode));

const getPlanScopedSkus = (db, planCode) =>
    arr(db.biz.channel_demand_plan_skus).filter((row) => String(row.plan_code) === String(planCode));

const expandPlanChannels = (db, plan) => {
    if (Number(plan.channel_scope) === 1) return listActiveLv2Channels(db);
    return getPlanScopedChannels(db, plan.plan_code).map((row) => ({
        channel_code: row.lv2_channel_code,
        channel_name: row.lv2_channel_name,
        parent_code: row.parent_code || '',
        parent_name: row.parent_name || ''
    }));
};

const expandPlanSkus = (db, plan) => {
    if (Number(plan.sku_scope) === 1) return listActiveSkus(db);
    return getPlanScopedSkus(db, plan.plan_code).map((row) => ({
        sku_code: row.sku_code,
        sku_name: row.sku_name,
        category_code: row.category_code || '',
        category_name: row.category_name || ''
    }));
};

const getPlanRow = (db, planCode) =>
    arr(db.biz.channel_demand_plans).find((row) => String(row.plan_code) === String(planCode) && Number(row.status) !== PLAN_STATUS.DELETED);

const getVersionRows = (db, planCode) =>
    arr(db.biz.channel_demand_plan_versions)
        .filter((row) => String(row.plan_code) === String(planCode))
        .slice()
        .sort((a, b) => String(b.created_time || '').localeCompare(String(a.created_time || '')));

const getVersionRow = (db, versionCode) =>
    arr(db.biz.channel_demand_plan_versions).find((row) => String(row.version_code) === String(versionCode));

const getVersionChannelStatuses = (db, versionCode) =>
    arr(db.biz.channel_demand_plan_channel_statuses)
        .filter((row) => String(row.version_code) === String(versionCode))
        .slice()
        .sort((a, b) => String(a.lv2_channel_name || '').localeCompare(String(b.lv2_channel_name || '')));

const getVersionDataRows = (db, versionCode, channelCode = '') =>
    arr(db.biz.channel_demand_plan_data)
        .filter((row) =>
            String(row.version_code) === String(versionCode) &&
            (!channelCode || String(row.lv2_channel_code) === String(channelCode))
        )
        .slice()
        .sort((a, b) => {
            const categoryCompare = String(a.lv3_category_name || '').localeCompare(String(b.lv3_category_name || ''));
            if (categoryCompare !== 0) return categoryCompare;
            const skuCompare = String(a.sku_name || '').localeCompare(String(b.sku_name || ''));
            if (skuCompare !== 0) return skuCompare;
            return String(a.plan_week || '').localeCompare(String(b.plan_week || ''));
        });

const decorateLockRuleRow = (rule) => {
    const lifecycleStatus = getRuleLifecycleStatus(rule);
    return {
        ...rule,
        lifecycle_status: lifecycleStatus,
        lifecycle_label: getRuleLifecycleLabel(lifecycleStatus),
        channel_count: arr(rule.channel_codes).length
    };
};

const getLockRuleHitsForRow = (db, row) =>
    arr(db.biz.product_lock_rules).filter((rule) => {
        if (String(rule.sku_code) !== String(row.sku_code)) return false;
        if (!arr(rule.channel_codes).includes(String(row.lv2_channel_code))) return false;
        return rangesOverlap(
            normalize(rule.start_date),
            normalize(rule.end_date),
            normalize(row.week_start_date),
            normalize(row.week_end_date)
        );
    });

const applyLockSnapshotToRows = (db, rows) => {
    arr(rows).forEach((row) => {
        const hits = getLockRuleHitsForRow(db, row);
        if (!hits.length) {
            row.is_locked = false;
            row.lock_rule_id = 0;
            row.lock_rule_ids = [];
            row.lock_reason = '';
            return;
        }

        const primary = hits
            .slice()
            .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))[0];

        row.is_locked = true;
        row.lock_rule_id = primary?.id || 0;
        row.lock_rule_ids = hits.map((item) => item.id);
        row.lock_reason = hits.length === 1
            ? `命中锁定规则：${primary?.sku_name || row.sku_name}`
            : `命中 ${hits.length} 条锁定规则`;
    });
    return rows;
};

const decorateVersionRow = (db, row) => {
    const channelStatuses = getVersionChannelStatuses(db, row.version_code);
    const submittedCount = channelStatuses.filter((item) => Number(item.submit_status) === 1).length;
    const lockedCount = arr(db.biz.channel_demand_plan_data).filter(
        (item) => String(item.version_code) === String(row.version_code) && Number(item.is_locked) === 1
    ).length;

    return {
        ...row,
        channel_total: channelStatuses.length,
        submitted_count: submittedCount,
        pending_count: Math.max(channelStatuses.length - submittedCount, 0),
        locked_cell_count: lockedCount
    };
};

const decoratePlanRow = (db, row) => {
    const versions = getVersionRows(db, row.plan_code);
    const latestVersion = versions[0] || null;
    const scopedChannels = getPlanScopedChannels(db, row.plan_code);
    const scopedSkus = getPlanScopedSkus(db, row.plan_code);

    return {
        ...row,
        version_count: versions.length,
        channel_count: Number(row.channel_scope) === 1 ? listActiveLv2Channels(db).length : scopedChannels.length,
        sku_count: Number(row.sku_scope) === 1 ? listActiveSkus(db).length : scopedSkus.length,
        latest_version_code: latestVersion?.version_code || '',
        latest_version_label: latestVersion?.version_label || '',
        latest_version_status: latestVersion?.status ?? ''
    };
};

const parseScopedChannelPayload = (db, channelCodes = []) => {
    const channelMap = getChannelMap(db);
    const uniqueCodes = [...new Set(arr(channelCodes).map((item) => normalize(item)).filter(Boolean))];
    return uniqueCodes.map((channelCode) => {
        const source = channelMap.get(channelCode);
        if (!source) throw new Error(`无效二级渠道：${channelCode}`);
        return {
            lv2_channel_code: source.channel_code,
            lv2_channel_name: source.channel_name,
            parent_code: source.parent_code || '',
            parent_name: source.parent_name || ''
        };
    });
};

const parseScopedSkuPayload = (db, skuCodes = []) => {
    const skuMap = getSkuMap(db);
    const uniqueCodes = [...new Set(arr(skuCodes).map((item) => normalize(item)).filter(Boolean))];
    return uniqueCodes.map((skuCode) => {
        const source = skuMap.get(skuCode);
        if (!source) throw new Error(`无效SKU：${skuCode}`);
        return {
            sku_code: source.sku_code,
            sku_name: source.sku_name,
            category_code: source.category_code || '',
            category_name: source.category_name || ''
        };
    });
};

const normalizeLockRulePayload = (db, body = {}) => {
    const skuCode = normalize(body.sku_code);
    const startDate = normalizeDateKey(body.start_date, '开始日期');
    const endDate = normalizeDateKey(body.end_date, '结束日期');
    if (startDate > endDate) throw new Error('开始日期不能晚于结束日期');

    const sku = getSkuMap(db).get(skuCode);
    if (!sku) throw new Error(`无效SKU：${skuCode}`);

    const channels = parseScopedChannelPayload(db, body.channel_codes || []);
    if (!channels.length) throw new Error('至少选择一个二级渠道');

    return {
        sku_code: sku.sku_code,
        sku_name: sku.sku_name,
        category_code: sku.category_code || '',
        category_name: sku.category_name || '',
        channel_codes: channels.map((item) => item.lv2_channel_code),
        channel_names: channels.map((item) => item.lv2_channel_name),
        start_date: startDate,
        end_date: endDate,
        remark: normalize(body.remark)
    };
};

const validateLockRuleConflicts = (db, payload, excludeId = 0) => {
    const payloadChannels = new Set(arr(payload.channel_codes).map(String));

    arr(db.biz.product_lock_rules)
        .filter((rule) => Number(rule.id) !== Number(excludeId))
        .forEach((rule) => {
            if (String(rule.sku_code) !== String(payload.sku_code)) return;

            const hasSameChannel = arr(rule.channel_codes).some((code) => payloadChannels.has(String(code)));
            if (!hasSameChannel) return;

            if (!rangesOverlap(
                normalize(rule.start_date),
                normalize(rule.end_date),
                normalize(payload.start_date),
                normalize(payload.end_date)
            )) return;

            throw new Error(`锁定规则冲突：SKU ${payload.sku_code} 在相同渠道和日期范围内已存在规则`);
        });
};

const createLockRuleCore = (db, body, operator) => {
    const payload = normalizeLockRulePayload(db, body);
    validateLockRuleConflicts(db, payload);
    const time = nowIso();

    const created = {
        id: nextId(db.biz.product_lock_rules),
        ...payload,
        created_by: operator,
        created_time: time,
        updated_by: operator,
        updated_time: time
    };

    db.biz.product_lock_rules.push(created);
    return decorateLockRuleRow(created);
};

const updateLockRuleCore = (db, ruleId, body, operator) => {
    const target = arr(db.biz.product_lock_rules).find((row) => Number(row.id) === Number(ruleId));
    if (!target) throw new Error('锁定规则不存在');
    if (getRuleLifecycleStatus(target) === LOCK_RULE_STATUS.EXPIRED) {
        throw createBizError('已过期锁定规则只读，不允许修改', 409);
    }

    const payload = normalizeLockRulePayload(db, body);
    validateLockRuleConflicts(db, payload, ruleId);

    Object.assign(target, payload, {
        updated_by: operator,
        updated_time: nowIso()
    });

    return decorateLockRuleRow(target);
};

const deleteLockRuleCore = (db, ruleId) => {
    const target = arr(db.biz.product_lock_rules).find((row) => Number(row.id) === Number(ruleId));
    if (!target) throw new Error('锁定规则不存在');

    const lifecycleStatus = getRuleLifecycleStatus(target);
    if (lifecycleStatus !== LOCK_RULE_STATUS.FUTURE) {
        throw createBizError('仅未生效锁定规则允许删除', 409);
    }

    db.biz.product_lock_rules = arr(db.biz.product_lock_rules).filter((row) => Number(row.id) !== Number(ruleId));
    return true;
};

const listLockRules = (db, query = {}) => {
    let rows = arr(db.biz.product_lock_rules).map((row) => decorateLockRuleRow(row));
    const keyword = normalize(query.keyword).toLowerCase();
    const lifecycleStatus = normalize(query.lifecycleStatus).toUpperCase();

    if (keyword) {
        rows = rows.filter((row) =>
            String(row.sku_code || '').toLowerCase().includes(keyword) ||
            String(row.sku_name || '').toLowerCase().includes(keyword) ||
            arr(row.channel_names).some((name) => String(name || '').toLowerCase().includes(keyword))
        );
    }
    if (lifecycleStatus) {
        rows = rows.filter((row) => String(row.lifecycle_status) === lifecycleStatus);
    }

    rows.sort((a, b) => {
        const statusOrder = {
            [LOCK_RULE_STATUS.ACTIVE]: 1,
            [LOCK_RULE_STATUS.FUTURE]: 2,
            [LOCK_RULE_STATUS.EXPIRED]: 3
        };
        const orderCompare = (statusOrder[a.lifecycle_status] || 99) - (statusOrder[b.lifecycle_status] || 99);
        if (orderCompare !== 0) return orderCompare;
        return String(a.start_date || '').localeCompare(String(b.start_date || ''));
    });

    return rows;
};

const buildVersionMatrixRows = ({ db, plan, versionCode, weekRows, channels, skus, previousVersionCode, operator }) => {
    const previousValueMap = new Map();
    if (previousVersionCode) {
        arr(db.biz.channel_demand_plan_data)
            .filter((row) => String(row.version_code) === String(previousVersionCode))
            .forEach((row) => {
                previousValueMap.set(
                    `${row.lv2_channel_code}__${row.sku_code}__${row.plan_week}`,
                    row.plan_value === undefined ? null : row.plan_value
                );
            });
    }

    const categoryMap = getCategoryMap(db);
    const rows = [];
    channels.forEach((channel) => {
        skus.forEach((sku) => {
            const category = categoryMap.get(String(sku.category_code)) || null;
            weekRows.forEach((weekRow) => {
                const key = `${channel.channel_code}__${sku.sku_code}__${weekRow.plan_week}`;
                rows.push({
                    id: nextId(db.biz.channel_demand_plan_data) + rows.length,
                    plan_code: plan.plan_code,
                    version_code: versionCode,
                    lv2_channel_code: channel.channel_code,
                    lv2_channel_name: channel.channel_name,
                    sku_code: sku.sku_code,
                    sku_name: sku.sku_name,
                    lv3_category_code: sku.category_code || '',
                    lv3_category_name: sku.category_name || category?.category_name || '',
                    plan_week: weekRow.plan_week,
                    week_start_date: weekRow.week_start_date,
                    week_end_date: weekRow.week_end_date,
                    plan_value: previousValueMap.has(key) ? previousValueMap.get(key) : null,
                    is_locked: false,
                    lock_rule_id: 0,
                    lock_rule_ids: [],
                    lock_reason: '',
                    force_edit_reason: '',
                    force_edited_by: '',
                    force_edited_time: '',
                    is_modified: false,
                    updated_by: operator,
                    updated_time: nowIso()
                });
            });
        });
    });
    return applyLockSnapshotToRows(db, rows);
};

const deriveVersionStatus = (channelStatuses) => {
    const rows = arr(channelStatuses);
    if (!rows.length) return PLAN_STATUS.DRAFT;
    const submittedCount = rows.filter((row) => Number(row.submit_status) === 1).length;
    if (submittedCount === 0) return PLAN_STATUS.DRAFT;
    if (submittedCount === rows.length) return PLAN_STATUS.PENDING_CONFIRM;
    return PLAN_STATUS.SUBMITTING;
};

const syncPlanStatus = (db, planCode, operator = '') => {
    const plan = getPlanRow(db, planCode);
    if (!plan) return null;
    const latestVersion = getVersionRows(db, planCode)[0] || null;
    plan.status = latestVersion ? Number(latestVersion.status ?? PLAN_STATUS.DRAFT) : PLAN_STATUS.DRAFT;
    if (operator) plan.updated_by = operator;
    plan.updated_time = nowIso();
    return plan;
};

const createPlanCore = (db, body, operator) => {
    const planName = normalize(body.plan_name);
    if (!planName) throw new Error('计划名称不能为空');

    const planType = [1, 2].includes(toNum(body.plan_type, 1)) ? toNum(body.plan_type, 1) : 1;
    const createType = [1, 2].includes(toNum(body.create_type, 1)) ? toNum(body.create_type, 1) : 1;
    const weekCount = Math.min(26, Math.max(1, toNum(body.week_count, 8)));
    const channelScope = [1, 2].includes(toNum(body.channel_scope, 1)) ? toNum(body.channel_scope, 1) : 1;
    const skuScope = [1, 2].includes(toNum(body.sku_scope, 1)) ? toNum(body.sku_scope, 1) : 1;

    const scopedChannels = channelScope === 2 ? parseScopedChannelPayload(db, body.channel_codes || []) : [];
    const scopedSkus = skuScope === 2 ? parseScopedSkuPayload(db, body.sku_codes || []) : [];

    if (channelScope === 2 && !scopedChannels.length) throw new Error('指定渠道范围时至少选择一个二级渠道');
    if (skuScope === 2 && !scopedSkus.length) throw new Error('指定SKU范围时至少选择一个SKU');

    const planCode = buildPlanCode();
    const time = nowIso();

    db.biz.channel_demand_plans.push({
        id: nextId(db.biz.channel_demand_plans),
        plan_code: planCode,
        plan_name: planName,
        plan_type: planType,
        create_type: createType,
        week_count: weekCount,
        channel_scope: channelScope,
        sku_scope: skuScope,
        roll_cron: normalize(body.roll_cron),
        remark: normalize(body.remark),
        status: PLAN_STATUS.DRAFT,
        created_by: operator,
        created_time: time,
        updated_by: operator,
        updated_time: time
    });

    scopedChannels.forEach((row) => {
        db.biz.channel_demand_plan_channels.push({
            id: nextId(db.biz.channel_demand_plan_channels),
            plan_code: planCode,
            lv2_channel_code: row.lv2_channel_code,
            lv2_channel_name: row.lv2_channel_name,
            parent_code: row.parent_code || '',
            parent_name: row.parent_name || ''
        });
    });

    scopedSkus.forEach((row) => {
        db.biz.channel_demand_plan_skus.push({
            id: nextId(db.biz.channel_demand_plan_skus),
            plan_code: planCode,
            sku_code: row.sku_code,
            sku_name: row.sku_name,
            category_code: row.category_code || '',
            category_name: row.category_name || ''
        });
    });

    return db.biz.channel_demand_plans.find((row) => String(row.plan_code) === planCode);
};

const updatePlanCore = (db, planCode, body, operator) => {
    const plan = getPlanRow(db, planCode);
    if (!plan) throw new Error('计划不存在');

    const versions = getVersionRows(db, planCode);
    const hasConfirmedVersion = versions.some((row) => Number(row.status) === PLAN_STATUS.CONFIRMED);

    const nextChannelScope = [1, 2].includes(toNum(body.channel_scope, plan.channel_scope)) ? toNum(body.channel_scope, plan.channel_scope) : plan.channel_scope;
    const nextSkuScope = [1, 2].includes(toNum(body.sku_scope, plan.sku_scope)) ? toNum(body.sku_scope, plan.sku_scope) : plan.sku_scope;

    if (hasConfirmedVersion && (Number(plan.channel_scope) !== nextChannelScope || Number(plan.sku_scope) !== nextSkuScope)) {
        throw new Error('已确认计划不允许修改渠道范围或SKU范围');
    }

    const scopedChannels = nextChannelScope === 2 ? parseScopedChannelPayload(db, body.channel_codes || []) : [];
    const scopedSkus = nextSkuScope === 2 ? parseScopedSkuPayload(db, body.sku_codes || []) : [];

    if (nextChannelScope === 2 && !scopedChannels.length) throw new Error('指定渠道范围时至少选择一个二级渠道');
    if (nextSkuScope === 2 && !scopedSkus.length) throw new Error('指定SKU范围时至少选择一个SKU');

    plan.plan_name = normalize(body.plan_name) || plan.plan_name;
    plan.plan_type = [1, 2].includes(toNum(body.plan_type, plan.plan_type)) ? toNum(body.plan_type, plan.plan_type) : plan.plan_type;
    plan.create_type = [1, 2].includes(toNum(body.create_type, plan.create_type)) ? toNum(body.create_type, plan.create_type) : plan.create_type;
    plan.week_count = Math.min(26, Math.max(1, toNum(body.week_count, plan.week_count)));
    plan.channel_scope = nextChannelScope;
    plan.sku_scope = nextSkuScope;
    plan.roll_cron = normalize(body.roll_cron);
    plan.remark = normalize(body.remark);
    plan.updated_by = operator;
    plan.updated_time = nowIso();

    db.biz.channel_demand_plan_channels = arr(db.biz.channel_demand_plan_channels)
        .filter((row) => String(row.plan_code) !== String(planCode));
    db.biz.channel_demand_plan_skus = arr(db.biz.channel_demand_plan_skus)
        .filter((row) => String(row.plan_code) !== String(planCode));

    scopedChannels.forEach((row) => {
        db.biz.channel_demand_plan_channels.push({
            id: nextId(db.biz.channel_demand_plan_channels),
            plan_code: planCode,
            lv2_channel_code: row.lv2_channel_code,
            lv2_channel_name: row.lv2_channel_name,
            parent_code: row.parent_code || '',
            parent_name: row.parent_name || ''
        });
    });

    scopedSkus.forEach((row) => {
        db.biz.channel_demand_plan_skus.push({
            id: nextId(db.biz.channel_demand_plan_skus),
            plan_code: planCode,
            sku_code: row.sku_code,
            sku_name: row.sku_name,
            category_code: row.category_code || '',
            category_name: row.category_name || ''
        });
    });

    return plan;
};

const deletePlanCore = (db, planCode, operator) => {
    const plan = getPlanRow(db, planCode);
    if (!plan) throw new Error('计划不存在');

    const versions = getVersionRows(db, planCode);
    if (versions.some((row) => Number(row.status) !== PLAN_STATUS.DRAFT)) {
        throw new Error('仅允许删除无版本或仅草稿版本的计划');
    }

    plan.status = PLAN_STATUS.DELETED;
    plan.updated_by = operator;
    plan.updated_time = nowIso();
    return true;
};

const buildVersionCode = (planCode, beginWeek, existingVersions) => {
    const sequence = arr(existingVersions).filter((row) => String(row.plan_code) === String(planCode)).length + 1;
    return `${planCode}-${beginWeek}-R${String(sequence).padStart(2, '0')}`;
};

const buildVersionLabel = (existingVersions) => `版本 ${arr(existingVersions).length + 1}`;

const createVersionCore = (db, planCode, body, operator) => {
    const plan = getPlanRow(db, planCode);
    if (!plan) throw new Error('计划不存在');

    const beginWeek = normalize(body.begin_week);
    parseWeekCode(beginWeek);

    const weekCount = Math.min(26, Math.max(1, toNum(body.week_count, plan.week_count || 8)));
    const existingVersions = getVersionRows(db, planCode);
    const versionCode = normalize(body.version_code) || buildVersionCode(planCode, beginWeek, existingVersions);
    if (arr(db.biz.channel_demand_plan_versions).some((row) => String(row.version_code) === versionCode)) {
        throw new Error('版本号已存在');
    }

    const lastVersionCode = normalize(body.last_version_code);
    if (lastVersionCode && !existingVersions.some((row) => String(row.version_code) === lastVersionCode)) {
        throw new Error('继承版本不存在');
    }

    const versionLabel = normalize(body.version_label) || buildVersionLabel(existingVersions);
    const weekRows = buildWeekSequence(beginWeek, weekCount);
    const channels = expandPlanChannels(db, plan);
    const skus = expandPlanSkus(db, plan);
    if (!channels.length) throw new Error('当前计划没有可用二级渠道');
    if (!skus.length) throw new Error('当前计划没有可用SKU');

    const time = nowIso();
    const versionRow = {
        id: nextId(db.biz.channel_demand_plan_versions),
        plan_code: planCode,
        version_code: versionCode,
        version_label: versionLabel,
        begin_week: beginWeek,
        end_week: weekRows[weekRows.length - 1]?.plan_week || beginWeek,
        week_count: weekCount,
        status: PLAN_STATUS.DRAFT,
        last_version_code: lastVersionCode,
        create_type: toNum(body.create_type, 1),
        confirmed_time: '',
        confirmed_by: '',
        created_by: operator,
        created_time: time,
        updated_by: operator,
        updated_time: time
    };

    const channelStatuses = channels.map((channel, index) => ({
        id: nextId(db.biz.channel_demand_plan_channel_statuses) + index,
        plan_code: planCode,
        version_code: versionCode,
        lv2_channel_code: channel.channel_code,
        lv2_channel_name: channel.channel_name,
        submit_status: 0,
        submit_time: '',
        submit_by: ''
    }));

    const dataRows = buildVersionMatrixRows({
        db,
        plan,
        versionCode,
        weekRows,
        channels,
        skus,
        previousVersionCode: lastVersionCode,
        operator
    });

    db.biz.channel_demand_plan_versions.push(versionRow);
    db.biz.channel_demand_plan_channel_statuses.push(...channelStatuses);
    db.biz.channel_demand_plan_data.push(...dataRows);
    plan.updated_by = operator;
    plan.updated_time = time;
    syncPlanStatus(db, planCode, operator);

    return versionRow;
};

const rebuildVersionLocksCore = (db, versionCode, operator, isSuperAdmin) => {
    if (!isSuperAdmin) throw createBizError('仅超级管理员可刷新锁定快照', 403);
    const version = getVersionRow(db, versionCode);
    if (!version) throw new Error('版本不存在');
    if (Number(version.status) === PLAN_STATUS.CONFIRMED) throw createBizError('已确认版本不允许刷新锁定快照', 409);

    const dataRows = arr(db.biz.channel_demand_plan_data).filter((row) => String(row.version_code) === String(versionCode));
    applyLockSnapshotToRows(db, dataRows);
    version.updated_by = operator;
    version.updated_time = nowIso();
    syncPlanStatus(db, version.plan_code, operator);

    return getVersionDetail(db, versionCode);
};

const getVersionDetail = (db, versionCode) => {
    const version = getVersionRow(db, versionCode);
    if (!version) throw new Error('版本不存在');
    return {
        ...decorateVersionRow(db, version),
        weeks: buildWeekSequence(version.begin_week, version.week_count),
        channel_status_summary: getVersionChannelStatuses(db, versionCode)
    };
};

const getVersionDataDetail = (db, versionCode, channelCode = '') => {
    const version = getVersionRow(db, versionCode);
    if (!version) throw new Error('版本不存在');
    const plan = getPlanRow(db, version.plan_code);
    if (!plan) throw new Error('计划不存在');

    const channelStatuses = getVersionChannelStatuses(db, versionCode);
    if (!channelStatuses.length) throw new Error('当前版本没有可用渠道');

    const selectedChannel = normalize(channelCode) || String(channelStatuses[0].lv2_channel_code);
    const currentChannelStatus = channelStatuses.find((row) => String(row.lv2_channel_code) === selectedChannel);
    if (!currentChannelStatus) throw new Error('渠道不存在');

    const dataRows = getVersionDataRows(db, versionCode, currentChannelStatus.lv2_channel_code);
    const lockedCount = dataRows.filter((row) => Number(row.is_locked) === 1).length;

    return {
        plan: decoratePlanRow(db, plan),
        version: decorateVersionRow(db, version),
        weeks: buildWeekSequence(version.begin_week, version.week_count),
        selected_channel_code: currentChannelStatus.lv2_channel_code,
        selected_channel_name: currentChannelStatus.lv2_channel_name,
        channel_statuses: channelStatuses,
        data_rows: dataRows,
        lock_summary: {
            locked_count: lockedCount,
            editable_count: Math.max(dataRows.length - lockedCount, 0)
        }
    };
};

const saveVersionDataCore = (db, versionCode, body, operator, isSuperAdmin) => {
    const version = getVersionRow(db, versionCode);
    if (!version) throw new Error('版本不存在');
    if (Number(version.status) === PLAN_STATUS.CONFIRMED) throw createBizError('已确认版本不允许修改', 409);

    const channelCode = normalize(body.channel_code);
    if (!channelCode) throw new Error('渠道不能为空');

    const channelStatus = getVersionChannelStatuses(db, versionCode).find((row) => String(row.lv2_channel_code) === channelCode);
    if (!channelStatus) throw new Error('渠道不存在');
    if (Number(channelStatus.submit_status) === 1) throw createBizError('该渠道已提交，请先撤回后再修改', 409);

    const updates = arr(body.entries);
    if (!updates.length) return getVersionDataDetail(db, versionCode, channelCode);

    const targetRows = getVersionDataRows(db, versionCode, channelCode);
    const rowById = new Map(targetRows.map((row) => [Number(row.id), row]));
    const rowByKey = new Map(targetRows.map((row) => [`${row.sku_code}__${row.plan_week}`, row]));
    const forceEdit = Boolean(body.force_edit) && Boolean(isSuperAdmin);
    const forceReason = normalize(body.force_reason);
    const lockedUpdates = [];
    const updateTime = nowIso();

    updates.forEach((item) => {
        const rowId = toNum(item.id, 0);
        const fallbackKey = `${normalize(item.sku_code)}__${normalize(item.plan_week)}`;
        const target = rowById.get(rowId) || rowByKey.get(fallbackKey);
        if (!target) throw new Error('存在无效的版本明细行');
        if (Number(target.is_locked) === 1) lockedUpdates.push(target);
    });

    if (lockedUpdates.length && !forceEdit) {
        throw createBizError(
            isSuperAdmin ? '锁定格修改需要二次确认并填写原因' : '锁定格不允许修改',
            409,
            {
                locked_count: lockedUpdates.length,
                requires_force_edit: Boolean(isSuperAdmin)
            }
        );
    }
    if (lockedUpdates.length && !forceReason) {
        throw createBizError('强制修改锁定格时必须填写原因', 409, { requires_force_reason: true });
    }

    updates.forEach((item) => {
        const rowId = toNum(item.id, 0);
        const fallbackKey = `${normalize(item.sku_code)}__${normalize(item.plan_week)}`;
        const target = rowById.get(rowId) || rowByKey.get(fallbackKey);

        let nextValue = null;
        if (item.plan_value !== '' && item.plan_value !== undefined && item.plan_value !== null) {
            const parsed = Number(item.plan_value);
            if (Number.isNaN(parsed) || parsed < 0) throw new Error('需求数量必须为大于等于 0 的数字');
            nextValue = parsed;
        }

        target.plan_value = nextValue;
        target.is_modified = true;
        target.updated_by = operator;
        target.updated_time = updateTime;

        if (Number(target.is_locked) === 1) {
            target.force_edit_reason = forceReason;
            target.force_edited_by = operator;
            target.force_edited_time = updateTime;
        }
    });

    version.updated_by = operator;
    version.updated_time = updateTime;
    syncPlanStatus(db, version.plan_code, operator);
    return getVersionDataDetail(db, versionCode, channelCode);
};

const submitChannelCore = (db, versionCode, channelCode, allowEmpty, operator) => {
    const version = getVersionRow(db, versionCode);
    if (!version) throw new Error('版本不存在');
    if (Number(version.status) === PLAN_STATUS.CONFIRMED) throw createBizError('已确认版本不允许再次提交', 409);

    const channelStatuses = getVersionChannelStatuses(db, versionCode);
    const channelStatus = channelStatuses.find((row) => String(row.lv2_channel_code) === String(channelCode));
    if (!channelStatus) throw new Error('渠道不存在');

    const dataRows = getVersionDataRows(db, versionCode, channelCode);
    const emptyCount = dataRows.filter((row) => row.plan_value === null || row.plan_value === '' || row.plan_value === undefined).length;
    if (emptyCount > 0 && !allowEmpty) {
        throw createBizError('当前渠道仍有未填写数据', 409, { empty_count: emptyCount });
    }

    const updateTime = nowIso();
    channelStatus.submit_status = 1;
    channelStatus.submit_by = operator;
    channelStatus.submit_time = updateTime;

    version.status = deriveVersionStatus(channelStatuses);
    version.updated_by = operator;
    version.updated_time = updateTime;
    syncPlanStatus(db, version.plan_code, operator);

    return getVersionDataDetail(db, versionCode, channelCode);
};

const withdrawChannelCore = (db, versionCode, channelCode, operator, isSuperAdmin) => {
    if (!isSuperAdmin) throw createBizError('仅超级管理员可撤回渠道提交', 403);
    const version = getVersionRow(db, versionCode);
    if (!version) throw new Error('版本不存在');
    if (Number(version.status) === PLAN_STATUS.CONFIRMED) throw createBizError('已确认版本不可撤回', 409);

    const channelStatuses = getVersionChannelStatuses(db, versionCode);
    const channelStatus = channelStatuses.find((row) => String(row.lv2_channel_code) === String(channelCode));
    if (!channelStatus) throw new Error('渠道不存在');

    channelStatus.submit_status = 0;
    channelStatus.submit_by = '';
    channelStatus.submit_time = '';

    const updateTime = nowIso();
    version.status = deriveVersionStatus(channelStatuses);
    version.updated_by = operator;
    version.updated_time = updateTime;
    syncPlanStatus(db, version.plan_code, operator);

    return getVersionDataDetail(db, versionCode, channelCode);
};

const confirmVersionCore = (db, versionCode, operator, isSuperAdmin) => {
    if (!isSuperAdmin) throw createBizError('仅超级管理员可整体确认版本', 403);
    const version = getVersionRow(db, versionCode);
    if (!version) throw new Error('版本不存在');
    if (Number(version.status) === PLAN_STATUS.CONFIRMED) throw createBizError('该版本已确认', 409);

    const channelStatuses = getVersionChannelStatuses(db, versionCode);
    const unsubmittedChannels = channelStatuses.filter((row) => Number(row.submit_status) !== 1);
    if (unsubmittedChannels.length) {
        throw createBizError('仍有渠道未提交，不能整体确认', 409, {
            pending_channels: unsubmittedChannels.map((row) => ({
                channel_code: row.lv2_channel_code,
                channel_name: row.lv2_channel_name
            }))
        });
    }

    const updateTime = nowIso();
    version.status = PLAN_STATUS.CONFIRMED;
    version.confirmed_by = operator;
    version.confirmed_time = updateTime;
    version.updated_by = operator;
    version.updated_time = updateTime;

    const job = {
        id: nextId(db.biz.downstream_demand_plan_jobs),
        plan_code: version.plan_code,
        version_code: version.version_code,
        job_status: 'PENDING',
        trigger_type: 'MANUAL_CONFIRM',
        trigger_by: operator,
        trigger_time: updateTime,
        result_message: '待下游消费'
    };
    db.biz.downstream_demand_plan_jobs.push(job);
    syncPlanStatus(db, version.plan_code, operator);

    return {
        version: decorateVersionRow(db, version),
        downstream_job: job
    };
};

const registerChannelDemandPlanRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {
    app.get('/api/demand/channel-plan/options', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDemandPlanStructures(db);

        apiOk(res, req, {
            channels: listActiveLv2Channels(db),
            skus: listActiveSkus(db),
            categories: listActiveCategories(db)
        }, '获取成功');
    });

    app.get('/api/demand/channel-plan', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDemandPlanStructures(db);

        const keyword = normalize(req.query.keyword).toLowerCase();
        const status = normalize(req.query.status);
        const planType = normalize(req.query.planType);
        const createType = normalize(req.query.createType);

        let rows = arr(db.biz.channel_demand_plans)
            .filter((row) => Number(row.status) !== PLAN_STATUS.DELETED)
            .map((row) => decoratePlanRow(db, row));

        if (keyword) {
            rows = rows.filter((row) =>
                String(row.plan_code || '').toLowerCase().includes(keyword) ||
                String(row.plan_name || '').toLowerCase().includes(keyword)
            );
        }
        if (status) rows = rows.filter((row) => String(row.status) === status);
        if (planType) rows = rows.filter((row) => String(row.plan_type) === planType);
        if (createType) rows = rows.filter((row) => String(row.create_type) === createType);

        rows.sort((a, b) => String(b.updated_time || b.created_time || '').localeCompare(String(a.updated_time || a.created_time || '')));
        apiOk(res, req, paginate(rows, req.query.page, req.query.pageSize), '获取成功');
    });

    app.post('/api/demand/channel-plan', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return createPlanCore(db, req.body || {}, operator);
            });
            apiOk(res, req, out, '创建成功');
        } catch (error) {
            apiErr(res, req, 400, error.message || '创建失败');
        }
    });

    app.put('/api/demand/channel-plan/:planCode', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return updatePlanCore(db, req.params.planCode, req.body || {}, operator);
            });
            apiOk(res, req, out, '保存成功');
        } catch (error) {
            apiErr(res, req, 400, error.message || '保存失败');
        }
    });

    app.delete('/api/demand/channel-plan/:planCode', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return deletePlanCore(db, req.params.planCode, operator);
            });
            apiOk(res, req, true, '删除成功');
        } catch (error) {
            apiErr(res, req, 400, error.message || '删除失败');
        }
    });

    app.get('/api/demand/channel-plan/:planCode/version', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDemandPlanStructures(db);
        const rows = getVersionRows(db, req.params.planCode).map((row) => decorateVersionRow(db, row));
        apiOk(res, req, rows, '获取成功');
    });

    app.post('/api/demand/channel-plan/:planCode/version', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return createVersionCore(db, req.params.planCode, req.body || {}, operator);
            });
            apiOk(res, req, out, '创建成功');
        } catch (error) {
            apiErr(res, req, 400, error.message || '创建失败');
        }
    });

    app.get('/api/demand/channel-plan/version/:versionCode', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureChannelDemandPlanStructures(db);
            apiOk(res, req, getVersionDetail(db, req.params.versionCode), '获取成功');
        } catch (error) {
            apiErr(res, req, 404, error.message || '获取失败');
        }
    });

    app.get('/api/demand/channel-plan/version/:versionCode/data', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureChannelDemandPlanStructures(db);
            apiOk(res, req, getVersionDataDetail(db, req.params.versionCode, req.query.channelCode), '获取成功');
        } catch (error) {
            apiErr(res, req, 404, error.message || '获取失败');
        }
    });

    app.put('/api/demand/channel-plan/version/:versionCode/data', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return saveVersionDataCore(
                    db,
                    req.params.versionCode,
                    req.body || {},
                    operator,
                    Boolean(req.user?.isSuperAdmin)
                );
            });
            apiOk(res, req, out, '保存成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '保存失败', { details: error.details || null });
        }
    });

    app.post('/api/demand/channel-plan/version/:versionCode/channel/:channelCode/submit', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return submitChannelCore(
                    db,
                    req.params.versionCode,
                    req.params.channelCode,
                    Boolean(req.body?.allowEmpty),
                    operator
                );
            });
            apiOk(res, req, out, '渠道提交成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '渠道提交失败', { details: error.details || null });
        }
    });

    app.post('/api/demand/channel-plan/version/:versionCode/channel/:channelCode/withdraw', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return withdrawChannelCore(
                    db,
                    req.params.versionCode,
                    req.params.channelCode,
                    operator,
                    Boolean(req.user?.isSuperAdmin)
                );
            });
            apiOk(res, req, out, '撤回成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '撤回失败', { details: error.details || null });
        }
    });

    app.post('/api/demand/channel-plan/version/:versionCode/confirm', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return confirmVersionCore(db, req.params.versionCode, operator, Boolean(req.user?.isSuperAdmin));
            });
            apiOk(res, req, out, '整体确认成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '整体确认失败', { details: error.details || null });
        }
    });

    app.get('/api/demand/channel-plan/product-lock-rules', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDemandPlanStructures(db);
        apiOk(res, req, listLockRules(db, req.query || {}), '获取成功');
    });

    app.post('/api/demand/channel-plan/product-lock-rules', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return createLockRuleCore(db, req.body || {}, operator);
            });
            apiOk(res, req, out, '创建成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '创建失败', { details: error.details || null });
        }
    });

    app.put('/api/demand/channel-plan/product-lock-rules/:id', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return updateLockRuleCore(db, req.params.id, req.body || {}, operator);
            });
            apiOk(res, req, out, '保存成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '保存失败', { details: error.details || null });
        }
    });

    app.delete('/api/demand/channel-plan/product-lock-rules/:id', authRequired, (req, res) => {
        try {
            updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return deleteLockRuleCore(db, req.params.id);
            });
            apiOk(res, req, true, '删除成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '删除失败', { details: error.details || null });
        }
    });

    app.post('/api/demand/channel-plan/version/:versionCode/rebuild-locks', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.username || '系统';
            const out = updateDb((db) => {
                ensureChannelDemandPlanStructures(db);
                return rebuildVersionLocksCore(db, req.params.versionCode, operator, Boolean(req.user?.isSuperAdmin));
            });
            apiOk(res, req, out, '刷新锁定快照成功');
        } catch (error) {
            apiErr(res, req, error.statusCode || 400, error.message || '刷新锁定快照失败', { details: error.details || null });
        }
    });
};

module.exports = {
    ensureChannelDemandPlanStructures,
    registerChannelDemandPlanRoutes,
    buildWeekSequence,
    applyLockSnapshotToRows
};
