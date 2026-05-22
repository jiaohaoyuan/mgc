/**
 * 档期分配规则引擎 + 计划修订工作流
 *
 * 档期 (slot_definitions)：促销档期、节日档期等时间窗口
 * 分配规则 (slot_allocation_rules)：档期 → 渠道/SKU范围 → 仓库权重
 * 修订记录 (plan_revisions)：已确认计划的修订申请
 */

const { readDb, updateDb, nextId, nowIso } = require('./localDb');
const { ensureChannelDemandPlanStructures } = require('./channelDemandPlan');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => { const n = Number(v); return Number.isNaN(n) ? fb : n; };
const normalize = (v) => String(v || '').trim();

const SLOT_TYPE = { PROMO: '大促', FESTIVAL: '节日', SEASONAL: '季节性', REGULAR: '常规' };
const REVISION_STATUS = { DRAFT: 0, PENDING: 1, APPROVED: 2, REJECTED: 3 };

const createBizError = (msg, code = 400) => { const e = new Error(msg); e.statusCode = code; return e; };

const ensureSlotStructures = (db) => {
    db.biz = db.biz || {};
    db.biz.slot_definitions = arr(db.biz.slot_definitions);
    db.biz.slot_allocation_rules = arr(db.biz.slot_allocation_rules);
    db.biz.plan_revisions = arr(db.biz.plan_revisions);
    ensureChannelDemandPlanStructures(db);
};

// ===== Slot Engine =====

/**
 * Get active slots for a given date.
 * Returns slots where start_date <= date <= end_date, sorted by priority DESC (higher = wins).
 */
const getActiveSlots = (db, dateStr = '') => {
    ensureSlotStructures(db);
    const target = dateStr || new Date().toISOString().slice(0, 10);
    const active = arr(db.biz.slot_definitions)
        .filter(s => Number(s.status) === 1)
        .filter(s => String(s.start_date || '') <= target && String(s.end_date || '') >= target)
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
    return active;
};

/**
 * Get the effective allocation weights for a channel+SKU combination.
 * Resolution: current date → active slots (highest priority wins) → matched rules → warehouse weights.
 * Falls back to default ratios if no slot matches.
 */
const getSlotWeights = (db, { channelCode = '', skuCode = '', defaultRatios = [] } = {}) => {
    ensureSlotStructures(db);
    const activeSlots = getActiveSlots(db);

    for (const slot of activeSlots) {
        const rules = arr(db.biz.slot_allocation_rules)
            .filter(r => String(r.slot_code) === String(slot.slot_code) && Number(r.status) === 1);

        // Try exact match first (channel + SKU)
        let match = rules.find(r => matchesSlotRule(r, channelCode, skuCode, 'exact'));
        if (!match) match = rules.find(r => matchesSlotRule(r, channelCode, skuCode, 'channel'));
        if (!match) match = rules.find(r => matchesSlotRule(r, channelCode, skuCode, 'sku'));
        if (!match) match = rules.find(r => matchesSlotRule(r, channelCode, skuCode, 'any'));

        if (match) {
            const weights = arr(match.warehouse_weights).map(w => ({
                warehouse_code: w.warehouse_code || '',
                warehouse_name: w.warehouse_name || '',
                weight: Number(w.weight) || 0
            })).filter(w => w.weight > 0);
            // Derive ratios from weights (already in % form, consistent length)
            const ratios = weights.map(w => w.weight);
            return {
                slot_code: slot.slot_code,
                slot_name: slot.slot_name,
                slot_type: slot.slot_type,
                rule_id: match.id,
                weights,
                ratios
            };
        }
    }

    return { slot_code: '', slot_name: '', weights: [], ratios: defaultRatios };
};

const matchesSlotRule = (rule, channelCode, skuCode, level) => {
    const channels = arr(rule.channel_codes).map(c => normalize(c));
    const skus = arr(rule.sku_codes).map(s => normalize(s));
    const matchAllCh = channels.length === 0 || channels.includes('*');
    const matchAllSk = skus.length === 0 || skus.includes('*');

    if (level === 'exact' && !matchAllCh && !matchAllSk)
        return channels.includes(normalize(channelCode)) && skus.includes(normalize(skuCode));
    if (level === 'channel' && !matchAllCh)
        return channels.includes(normalize(channelCode));
    if (level === 'sku' && !matchAllSk)
        return skus.includes(normalize(skuCode));
    if (level === 'any')
        return true;
    return false;
};

// ===== Plan Revision Workflow =====

const createRevision = (db, planCode, versionCode, reason, operator) => {
    ensureSlotStructures(db);

    const plan = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(planCode));
    if (!plan) throw createBizError('计划不存在', 404);

    const version = arr(db.biz.channel_demand_plan_versions).find(v => String(v.version_code) === String(versionCode));
    if (!version) throw createBizError('版本不存在', 404);
    if (Number(version.status) !== 3) throw createBizError('仅已确认的版本可修订');

    const existing = arr(db.biz.plan_revisions).find(r =>
        String(r.version_code) === String(versionCode) && Number(r.status) <= 1
    );
    if (existing) throw createBizError('该版本已有进行中的修订申请', 409);

    const revision = {
        id: nextId(db.biz.plan_revisions),
        revision_no: `REV-${Date.now()}`,
        plan_code: planCode,
        version_code: versionCode,
        reason: normalize(reason),
        status: REVISION_STATUS.PENDING,
        new_version_code: '',
        submitted_by: operator,
        submitted_time: nowIso(),
        reviewed_by: '',
        reviewed_time: '',
        created_time: nowIso(),
        updated_time: nowIso()
    };
    db.biz.plan_revisions.push(revision);
    return revision;
};

const approveRevision = (db, revisionId, operator, isSuperAdmin = false) => {
    ensureSlotStructures(db);
    const rev = arr(db.biz.plan_revisions).find(r => Number(r.id) === Number(revisionId));
    if (!rev) throw createBizError('修订申请不存在', 404);
    if (rev.status !== REVISION_STATUS.PENDING) throw createBizError('仅待审批的修订可审批');
    if (!isSuperAdmin) throw createBizError('仅超级管理员可审批修订', 403);

    // Clone the confirmed version as a new editable version
    const sourceVersion = arr(db.biz.channel_demand_plan_versions).find(v => String(v.version_code) === String(rev.version_code));
    if (!sourceVersion) throw createBizError('源版本不存在', 404);

    const { buildWeekSequence } = require('./channelDemandPlan');
    const newVersionCode = `${sourceVersion.version_code}-R${nextId(db.biz.channel_demand_plan_versions)}`;
    const newVersion = {
        id: nextId(db.biz.channel_demand_plan_versions),
        plan_code: sourceVersion.plan_code,
        version_code: newVersionCode,
        version_label: `${sourceVersion.version_label}（修订版）`,
        begin_week: sourceVersion.begin_week,
        end_week: sourceVersion.end_week,
        week_count: sourceVersion.week_count,
        status: 0, // DRAFT
        last_version_code: sourceVersion.version_code,
        create_type: 1, // manual
        confirmed_time: '',
        confirmed_by: '',
        created_by: operator,
        created_time: nowIso(),
        updated_by: operator,
        updated_time: nowIso()
    };
    db.biz.channel_demand_plan_versions.push(newVersion);

    // Clone existing plan data as draft for editing
    const sourceData = arr(db.biz.channel_demand_plan_data).filter(d => String(d.version_code) === String(rev.version_code));
    sourceData.forEach(sd => {
        db.biz.channel_demand_plan_data.push({
            ...sd,
            id: nextId(db.biz.channel_demand_plan_data),
            version_code: newVersionCode,
            is_locked: false,
            lock_rule_id: 0,
            lock_rule_ids: [],
            lock_reason: '',
            is_modified: true,
            updated_time: nowIso()
        });
    });

    // Clone channel statuses
    const sourceStatuses = arr(db.biz.channel_demand_plan_channel_statuses).filter(cs => String(cs.version_code) === String(rev.version_code));
    sourceStatuses.forEach(cs => {
        db.biz.channel_demand_plan_channel_statuses.push({
            ...cs,
            id: nextId(db.biz.channel_demand_plan_channel_statuses),
            version_code: newVersionCode,
            submit_status: 0,
            submit_time: '',
            submit_by: ''
        });
    });

    rev.status = REVISION_STATUS.APPROVED;
    rev.new_version_code = newVersionCode;
    rev.reviewed_by = operator;
    rev.reviewed_time = nowIso();
    rev.updated_time = nowIso();

    return { revision: rev, new_version_code: newVersionCode };
};

const rejectRevision = (db, revisionId, operator) => {
    ensureSlotStructures(db);
    const rev = arr(db.biz.plan_revisions).find(r => Number(r.id) === Number(revisionId));
    if (!rev) throw createBizError('修订申请不存在', 404);
    if (rev.status !== REVISION_STATUS.PENDING) throw createBizError('仅待审批的修订可驳回');
    rev.status = REVISION_STATUS.REJECTED;
    rev.reviewed_by = operator;
    rev.reviewed_time = nowIso();
    rev.updated_time = nowIso();
    return rev;
};

// ===== Plan Rolling Update =====

const rollPlanVersion = (db, planCode, operator) => {
    ensureSlotStructures(db);

    const plan = arr(db.biz.channel_demand_plans).find(p => String(p.plan_code) === String(planCode));
    if (!plan) throw createBizError('计划不存在', 404);

    // Find the latest confirmed version
    const versions = arr(db.biz.channel_demand_plan_versions)
        .filter(v => String(v.plan_code) === String(planCode))
        .sort((a, b) => String(b.version_code).localeCompare(String(a.version_code)));

    const latest = versions.find(v => Number(v.status) === 3);
    if (!latest) throw createBizError('无可滚动的已确认版本');

    const { buildWeekSequence, addWeeksToWeekCode } = require('./channelDemandPlan');
    const weekCount = Number(plan.week_count) || Number(latest.week_count) || 8;

    // Compute next begin week using proper ISO week arithmetic
    const offsetWeeks = Number(latest.week_count) || weekCount;
    const beginWeek = addWeeksToWeekCode(latest.begin_week, offsetWeeks);
    const newWeeks = buildWeekSequence(beginWeek, weekCount);
    const endWeek = newWeeks[newWeeks.length - 1];

    const newVersionCode = `${latest.version_code}-ROLL`;
    const newVersion = {
        id: nextId(db.biz.channel_demand_plan_versions),
        plan_code: planCode,
        version_code: newVersionCode,
        version_label: `滚动版 ${beginWeek}`,
        begin_week: beginWeek,
        end_week: endWeek,
        week_count: weekCount,
        status: 0,
        last_version_code: latest.version_code,
        create_type: 2, // auto roll
        confirmed_time: '',
        confirmed_by: '',
        created_by: operator,
        created_time: nowIso(),
        updated_by: operator,
        updated_time: nowIso()
    };
    db.biz.channel_demand_plan_versions.push(newVersion);

    // Inherit plan data from latest version (as baseline)
    const sourceData = arr(db.biz.channel_demand_plan_data).filter(d => String(d.version_code) === String(latest.version_code));
    newWeeks.forEach((weekObj, wi) => {
        sourceData.forEach(sd => {
            db.biz.channel_demand_plan_data.push({
                id: nextId(db.biz.channel_demand_plan_data),
                version_code: newVersionCode,
                lv2_channel_code: sd.lv2_channel_code,
                lv2_channel_name: sd.lv2_channel_name,
                sku_code: sd.sku_code,
                sku_name: sd.sku_name,
                lv3_category_code: sd.lv3_category_code || '',
                lv3_category_name: sd.lv3_category_name || '',
                plan_week: weekObj.week,
                week_start_date: weekObj.week_start_date,
                week_end_date: weekObj.week_end_date,
                plan_value: null, // reset to null for fresh input
                is_locked: false,
                lock_rule_id: 0,
                lock_rule_ids: [],
                lock_reason: '',
                force_edit_reason: '',
                is_modified: false,
                updated_time: nowIso()
            });
        });
    });

    // Clone channel statuses
    const sourceStatuses = arr(db.biz.channel_demand_plan_channel_statuses).filter(cs => String(cs.version_code) === String(latest.version_code));
    sourceStatuses.forEach(cs => {
        db.biz.channel_demand_plan_channel_statuses.push({
            ...cs,
            id: nextId(db.biz.channel_demand_plan_channel_statuses),
            version_code: newVersionCode,
            submit_status: 0,
            submit_time: '',
            submit_by: ''
        });
    });

    return { version_code: newVersionCode, begin_week: beginWeek, end_week: endWeek };
};

// ===== Route Registration =====

const registerSlotRuleRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {

    // ── Slot Definitions CRUD ──

    app.get('/api/rules/slots', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSlotStructures(db);
            const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query || {};
            let rows = arr(db.biz.slot_definitions);
            if (String(status)) rows = rows.filter(r => Number(r.status) === Number(status));
            if (String(keyword).trim()) {
                const kw = String(keyword).trim().toLowerCase();
                rows = rows.filter(r => String(r.slot_code || '').toLowerCase().includes(kw) || String(r.slot_name || '').toLowerCase().includes(kw));
            }
            rows.sort((a, b) => (b.id || 0) - (a.id || 0));
            const { list, total } = paginate(rows, page, pageSize);

            // Attach rule count
            const enriched = list.map(slot => {
                const ruleCount = arr(db.biz.slot_allocation_rules).filter(r => String(r.slot_code) === String(slot.slot_code)).length;
                return { ...slot, rule_count: ruleCount };
            });

            apiOk(res, req, { list: enriched, total }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message || '获取档期列表失败'); }
    });

    // ── Active Slots (must be before /:id to avoid shadowing) ──

    app.get('/api/rules/slots/active', authRequired, (req, res) => {
        try {
            const db = readDb();
            const { date = '' } = req.query || {};
            const slots = getActiveSlots(db, String(date));
            apiOk(res, req, slots, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.get('/api/rules/slots/:id', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSlotStructures(db);
            const slot = arr(db.biz.slot_definitions).find(s => Number(s.id) === Number(req.params.id));
            if (!slot) return apiErr(res, req, 404, '档期不存在');
            const rules = arr(db.biz.slot_allocation_rules).filter(r => String(r.slot_code) === String(slot.slot_code));
            apiOk(res, req, { slot, rules }, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.post('/api/rules/slots', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.slot_code || !body.slot_name) return apiErr(res, req, 400, '编码和名称必填');
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            updateDb((db) => {
                ensureSlotStructures(db);
                if (db.biz.slot_definitions.some(s => String(s.slot_code) === String(body.slot_code)))
                    throw createBizError('档期编码已存在', 409);
                db.biz.slot_definitions.push({
                    id: nextId(db.biz.slot_definitions),
                    slot_code: String(body.slot_code).trim(),
                    slot_name: String(body.slot_name).trim(),
                    slot_type: String(body.slot_type || 'REGULAR').trim(),
                    start_date: String(body.start_date || '').trim(),
                    end_date: String(body.end_date || '').trim(),
                    priority: Number(body.priority) || 0,
                    status: body.status !== undefined ? Number(body.status) : 1,
                    remark: String(body.remark || ''),
                    created_by: operator, created_time: nowIso(),
                    updated_by: operator, updated_time: nowIso()
                });
            });
            apiOk(res, req, null, '新增成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '新增失败'); }
    });

    app.put('/api/rules/slots/:id', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let found = false;
            updateDb((db) => {
                ensureSlotStructures(db);
                const slot = db.biz.slot_definitions.find(s => Number(s.id) === Number(req.params.id));
                if (!slot) return;
                if (body.slot_name !== undefined) slot.slot_name = String(body.slot_name).trim();
                if (body.slot_type !== undefined) slot.slot_type = String(body.slot_type).trim();
                if (body.start_date !== undefined) slot.start_date = String(body.start_date).trim();
                if (body.end_date !== undefined) slot.end_date = String(body.end_date).trim();
                if (body.priority !== undefined) slot.priority = Number(body.priority);
                if (body.status !== undefined) slot.status = Number(body.status);
                if (body.remark !== undefined) slot.remark = String(body.remark);
                slot.updated_by = operator; slot.updated_time = nowIso();
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '档期不存在');
            apiOk(res, req, null, '更新成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '更新失败'); }
    });

    app.delete('/api/rules/slots/:id', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureSlotStructures(db);
                const idx = db.biz.slot_definitions.findIndex(s => Number(s.id) === Number(req.params.id));
                if (idx === -1) return;
                db.biz.slot_definitions.splice(idx, 1);
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '档期不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    // ── Slot Allocation Rules CRUD ──

    app.get('/api/rules/slot-allocations', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSlotStructures(db);
            const { slot_code = '' } = req.query || {};
            let rows = arr(db.biz.slot_allocation_rules);
            if (String(slot_code)) rows = rows.filter(r => String(r.slot_code) === String(slot_code));
            rows.sort((a, b) => (b.id || 0) - (a.id || 0));
            apiOk(res, req, rows, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.post('/api/rules/slot-allocations', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.slot_code) return apiErr(res, req, 400, '档期编码必填');
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            updateDb((db) => {
                ensureSlotStructures(db);
                const slot = db.biz.slot_definitions.find(s => String(s.slot_code) === String(body.slot_code));
                if (!slot) throw createBizError('档期不存在', 404);
                db.biz.slot_allocation_rules.push({
                    id: nextId(db.biz.slot_allocation_rules),
                    slot_code: String(body.slot_code).trim(),
                    rule_name: String(body.rule_name || '').trim(),
                    channel_codes: arr(body.channel_codes),
                    sku_codes: arr(body.sku_codes),
                    warehouse_weights: arr(body.warehouse_weights).map(w => ({
                        warehouse_code: w.warehouse_code || '',
                        warehouse_name: w.warehouse_name || '',
                        weight: Number(w.weight) || 0
                    })),
                    status: body.status !== undefined ? Number(body.status) : 1,
                    remark: String(body.remark || ''),
                    created_by: operator, created_time: nowIso(),
                    updated_by: operator, updated_time: nowIso()
                });
            });
            apiOk(res, req, null, '新增成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '新增失败'); }
    });

    app.put('/api/rules/slot-allocations/:id', authRequired, (req, res) => {
        try {
            const body = req.body || {};
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            let found = false;
            updateDb((db) => {
                ensureSlotStructures(db);
                const rule = db.biz.slot_allocation_rules.find(r => Number(r.id) === Number(req.params.id));
                if (!rule) return;
                if (body.rule_name !== undefined) rule.rule_name = String(body.rule_name).trim();
                if (body.channel_codes !== undefined) rule.channel_codes = arr(body.channel_codes);
                if (body.sku_codes !== undefined) rule.sku_codes = arr(body.sku_codes);
                if (body.warehouse_weights !== undefined) rule.warehouse_weights = arr(body.warehouse_weights).map(w => ({
                    warehouse_code: w.warehouse_code || '', warehouse_name: w.warehouse_name || '', weight: Number(w.weight) || 0
                }));
                if (body.status !== undefined) rule.status = Number(body.status);
                if (body.remark !== undefined) rule.remark = String(body.remark);
                rule.updated_by = operator; rule.updated_time = nowIso();
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '不存在');
            apiOk(res, req, null, '更新成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '更新失败'); }
    });

    app.delete('/api/rules/slot-allocations/:id', authRequired, (req, res) => {
        try {
            let found = false;
            updateDb((db) => {
                ensureSlotStructures(db);
                const idx = db.biz.slot_allocation_rules.findIndex(r => Number(r.id) === Number(req.params.id));
                if (idx === -1) return;
                db.biz.slot_allocation_rules.splice(idx, 1);
                found = true;
            });
            if (!found) return apiErr(res, req, 404, '不存在');
            apiOk(res, req, null, '删除成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    // ── Slot Weight Query (for allocation algorithm) ──

    app.get('/api/rules/slot-weights', authRequired, (req, res) => {
        try {
            const db = readDb();
            const { channel_code = '', sku_code = '' } = req.query || {};
            const result = getSlotWeights(db, {
                channelCode: String(channel_code),
                skuCode: String(sku_code)
            });
            apiOk(res, req, result, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    // ── Plan Revision CRUD ──

    app.get('/api/rules/revisions', authRequired, (req, res) => {
        try {
            const db = readDb();
            ensureSlotStructures(db);
            const { plan_code = '', status = '' } = req.query || {};
            let rows = arr(db.biz.plan_revisions);
            if (String(plan_code)) rows = rows.filter(r => String(r.plan_code) === String(plan_code));
            if (String(status)) rows = rows.filter(r => Number(r.status) === Number(status));
            rows.sort((a, b) => (b.id || 0) - (a.id || 0));
            apiOk(res, req, rows, '获取成功');
        } catch (e) { apiErr(res, req, 500, e.message); }
    });

    app.post('/api/rules/revisions', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const { plan_code, version_code, reason } = req.body || {};
            if (!plan_code || !version_code) return apiErr(res, req, 400, '计划和版本必填');
            const result = updateDb((db) => createRevision(db, plan_code, version_code, reason, operator));
            apiOk(res, req, result, '修订申请已提交');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '提交失败'); }
    });

    app.post('/api/rules/revisions/:id/approve', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const isSuperAdmin = Boolean(req.user?.isSuperAdmin);
            const result = updateDb((db) => approveRevision(db, req.params.id, operator, isSuperAdmin));
            apiOk(res, req, result, '修订已批准，新版本已生成');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '审批失败'); }
    });

    app.post('/api/rules/revisions/:id/reject', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const result = updateDb((db) => rejectRevision(db, req.params.id, operator));
            apiOk(res, req, result, '修订已驳回');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '驳回失败'); }
    });

    // ── Plan Rolling Update ──

    app.post('/api/rules/plans/:planCode/roll', authRequired, (req, res) => {
        try {
            const operator = req.user?.nickname || req.user?.loginId || '系统';
            const result = updateDb((db) => rollPlanVersion(db, req.params.planCode, operator));
            apiOk(res, req, result, '滚动生成成功');
        } catch (e) { apiErr(res, req, e.statusCode || 400, e.message || '滚动失败'); }
    });
};

module.exports = {
    ensureSlotStructures,
    registerSlotRuleRoutes,
    getActiveSlots,
    getSlotWeights
};
