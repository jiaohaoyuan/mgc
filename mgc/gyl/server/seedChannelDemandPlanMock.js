const { readDb, updateDb, nextId, nowIso } = require('./localDb');
const {
    ensureChannelDemandPlanStructures,
    buildWeekSequence,
    applyLockSnapshotToRows
} = require('./channelDemandPlan');

const SEED_TAG = 'CHANNEL_DEMAND_PLAN_DEMO_V1';
const OPERATOR = '系统演示种子';

const PLAN_STATUS = {
    DRAFT: 0,
    SUBMITTING: 1,
    PENDING_CONFIRM: 2,
    CONFIRMED: 3
};

const arr = (value) => (Array.isArray(value) ? value : []);
const uniq = (values) => [...new Set(arr(values).filter(Boolean))];
const normalize = (value) => String(value || '').trim();

const CHANNEL_FACTORS = {
    'CH-L2-DIST': 1.0,
    'CH-L2-KA': 1.12,
    'CH-L2-NEWRETAIL': 1.08,
    'CH-L2-ECOM': 1.2,
    'CH-L2-PRIVATE': 0.92
};

const CATEGORY_FACTORS = [
    { keyword: '常温', factor: 1.08 },
    { keyword: '酸奶', factor: 1.16 },
    { keyword: '鲜', factor: 0.94 },
    { keyword: '奶酪', factor: 0.82 }
];

const getCategoryFactor = (skuName, categoryName) => {
    const text = `${normalize(skuName)} ${normalize(categoryName)}`;
    const hit = CATEGORY_FACTORS.find((row) => text.includes(row.keyword));
    return hit ? hit.factor : 1;
};

const getWeekValue = ({ baseQuota, channelCode, skuName, categoryName, weekFactor, scenarioFactor }) => {
    const normalizedQuota = Math.max(520, Number(baseQuota || 0));
    const weeklyBase = normalizedQuota / 52;
    const channelFactor = CHANNEL_FACTORS[channelCode] || 1;
    const categoryFactor = getCategoryFactor(skuName, categoryName);
    return Math.max(12, Math.round(weeklyBase * channelFactor * categoryFactor * weekFactor * scenarioFactor));
};

const buildChannelMaps = (db) => {
    const channels = arr(db.master.channel)
        .filter((row) => String(row.level) === '2' && Number(row.status ?? 1) === 1)
        .map((row) => ({
            channel_code: row.channel_code,
            channel_name: row.channel_name,
            parent_code: row.parent_code || '',
            parent_name: row.parent_name || ''
        }));
    return new Map(channels.map((row) => [String(row.channel_code), row]));
};

const buildSkuMap = (db) =>
    new Map(
        arr(db.master.sku)
            .filter((row) => Number(row.status ?? 1) === 1)
            .map((row) => [String(row.sku_code), row])
    );

const buildChannelSkuStats = (db) => {
    const profilesByReseller = new Map(arr(db.biz.channel_dealer_profiles).map((row) => [String(row.reseller_code), row]));
    const statsMap = new Map();

    arr(db.biz.channel_dealer_authorizations)
        .filter((row) => String(row.status) === 'ACTIVE')
        .forEach((auth) => {
            const profile = profilesByReseller.get(String(auth.reseller_code));
            if (!profile?.lv2_channel_code) return;
            const key = `${profile.lv2_channel_code}__${auth.sku_code}`;
            const current = statsMap.get(key) || {
                channel_code: profile.lv2_channel_code,
                channel_name: profile.lv2_channel_name || '',
                sku_code: auth.sku_code,
                sku_name: auth.sku_name || '',
                quota_sum: 0,
                auth_count: 0,
                reseller_codes: new Set()
            };
            current.quota_sum += Number(auth.quota_cases || 0);
            current.auth_count += 1;
            current.reseller_codes.add(String(auth.reseller_code));
            statsMap.set(key, current);
        });

    return statsMap;
};

const pickTopSkusForChannels = (statsMap, channelCodes, count) => {
    const merged = new Map();

    arr(channelCodes).forEach((channelCode) => {
        for (const stat of statsMap.values()) {
            if (String(stat.channel_code) !== String(channelCode)) continue;
            const current = merged.get(stat.sku_code) || {
                sku_code: stat.sku_code,
                sku_name: stat.sku_name,
                quota_sum: 0,
                auth_count: 0,
                reseller_count: 0
            };
            current.quota_sum += stat.quota_sum;
            current.auth_count += stat.auth_count;
            current.reseller_count += stat.reseller_codes.size;
            merged.set(stat.sku_code, current);
        }
    });

    return [...merged.values()]
        .sort((a, b) => {
            if (b.auth_count !== a.auth_count) return b.auth_count - a.auth_count;
            if (b.reseller_count !== a.reseller_count) return b.reseller_count - a.reseller_count;
            return b.quota_sum - a.quota_sum;
        })
        .slice(0, count)
        .map((row) => row.sku_code);
};

const cleanSeedRows = (db) => {
    const planCodes = new Set(
        arr(db.biz.channel_demand_plans)
            .filter((row) => String(row.seed_tag) === SEED_TAG)
            .map((row) => String(row.plan_code))
    );
    const versionCodes = new Set(
        arr(db.biz.channel_demand_plan_versions)
            .filter((row) => String(row.seed_tag) === SEED_TAG || planCodes.has(String(row.plan_code)))
            .map((row) => String(row.version_code))
    );
    const ruleIds = new Set(
        arr(db.biz.product_lock_rules)
            .filter((row) => String(row.seed_tag) === SEED_TAG)
            .map((row) => Number(row.id))
    );

    db.biz.channel_demand_plans = arr(db.biz.channel_demand_plans).filter((row) => String(row.seed_tag) !== SEED_TAG);
    db.biz.channel_demand_plan_channels = arr(db.biz.channel_demand_plan_channels).filter((row) => !planCodes.has(String(row.plan_code)));
    db.biz.channel_demand_plan_skus = arr(db.biz.channel_demand_plan_skus).filter((row) => !planCodes.has(String(row.plan_code)));
    db.biz.channel_demand_plan_versions = arr(db.biz.channel_demand_plan_versions).filter((row) => !versionCodes.has(String(row.version_code)));
    db.biz.channel_demand_plan_channel_statuses = arr(db.biz.channel_demand_plan_channel_statuses).filter((row) => !versionCodes.has(String(row.version_code)));
    db.biz.channel_demand_plan_data = arr(db.biz.channel_demand_plan_data).filter((row) => !versionCodes.has(String(row.version_code)));
    db.biz.product_lock_rules = arr(db.biz.product_lock_rules).filter((row) => !ruleIds.has(Number(row.id)));
    db.biz.downstream_demand_plan_jobs = arr(db.biz.downstream_demand_plan_jobs).filter((row) => !versionCodes.has(String(row.version_code)));
};

const createLockRuleRow = (db, channelMap, skuMap, payload, operator, time) => {
    const sku = skuMap.get(payload.sku_code);
    const channelRows = payload.channel_codes.map((code) => channelMap.get(code)).filter(Boolean);
    if (!sku || !channelRows.length) return null;
    return {
        id: nextId(db.biz.product_lock_rules),
        sku_code: sku.sku_code,
        sku_name: sku.sku_name,
        category_code: sku.category_code || '',
        category_name: sku.category_name || '',
        channel_codes: channelRows.map((row) => row.channel_code),
        channel_names: channelRows.map((row) => row.channel_name),
        start_date: payload.start_date,
        end_date: payload.end_date,
        remark: payload.remark,
        created_by: operator,
        created_time: time,
        updated_by: operator,
        updated_time: time,
        seed_tag: SEED_TAG
    };
};

const createPlanRows = ({ db, scenario, channelMap, skuMap, channelSkuStats, time }) => {
    const channels = scenario.channel_codes.map((code) => channelMap.get(code)).filter(Boolean);
    const skus = scenario.sku_codes.map((code) => skuMap.get(code)).filter(Boolean);
    const plan = {
        id: nextId(db.biz.channel_demand_plans),
        plan_code: scenario.plan_code,
        plan_name: scenario.plan_name,
        plan_type: 1,
        create_type: 1,
        week_count: scenario.week_count,
        channel_scope: 2,
        sku_scope: 2,
        roll_cron: '',
        remark: scenario.remark,
        status: scenario.status,
        created_by: OPERATOR,
        created_time: time,
        updated_by: OPERATOR,
        updated_time: time,
        seed_tag: SEED_TAG
    };

    const planChannels = channels.map((channel, index) => ({
        id: nextId(db.biz.channel_demand_plan_channels) + index,
        plan_code: scenario.plan_code,
        lv2_channel_code: channel.channel_code,
        lv2_channel_name: channel.channel_name,
        parent_code: channel.parent_code || '',
        parent_name: channel.parent_name || '',
        seed_tag: SEED_TAG
    }));

    const planSkus = skus.map((sku, index) => ({
        id: nextId(db.biz.channel_demand_plan_skus) + index,
        plan_code: scenario.plan_code,
        sku_code: sku.sku_code,
        sku_name: sku.sku_name,
        category_code: sku.category_code || '',
        category_name: sku.category_name || '',
        seed_tag: SEED_TAG
    }));

    const weekRows = buildWeekSequence(scenario.begin_week, scenario.week_count);
    const versionCode = `${scenario.plan_code}-${scenario.begin_week}-R01`;
    const version = {
        id: nextId(db.biz.channel_demand_plan_versions),
        plan_code: scenario.plan_code,
        version_code: versionCode,
        version_label: scenario.version_label,
        begin_week: scenario.begin_week,
        end_week: weekRows[weekRows.length - 1]?.plan_week || scenario.begin_week,
        week_count: scenario.week_count,
        status: scenario.status,
        last_version_code: '',
        create_type: 1,
        confirmed_time: scenario.status === PLAN_STATUS.CONFIRMED ? time : '',
        confirmed_by: scenario.status === PLAN_STATUS.CONFIRMED ? OPERATOR : '',
        created_by: OPERATOR,
        created_time: time,
        updated_by: OPERATOR,
        updated_time: time,
        seed_tag: SEED_TAG
    };

    const submitChannels = new Set(arr(scenario.submitted_channels));
    const channelStatuses = channels.map((channel, index) => ({
        id: nextId(db.biz.channel_demand_plan_channel_statuses) + index,
        plan_code: scenario.plan_code,
        version_code: versionCode,
        lv2_channel_code: channel.channel_code,
        lv2_channel_name: channel.channel_name,
        submit_status: submitChannels.has(channel.channel_code) ? 1 : 0,
        submit_time: submitChannels.has(channel.channel_code) ? time : '',
        submit_by: submitChannels.has(channel.channel_code) ? OPERATOR : '',
        seed_tag: SEED_TAG
    }));

    const dataRows = [];
    channels.forEach((channel) => {
        skus.forEach((sku) => {
            const stat = channelSkuStats.get(`${channel.channel_code}__${sku.sku_code}`);
            const baseQuota = stat?.quota_sum && stat?.auth_count
                ? stat.quota_sum / stat.auth_count
                : 1040;
            weekRows.forEach((weekRow, weekIndex) => {
                dataRows.push({
                    id: nextId(db.biz.channel_demand_plan_data) + dataRows.length,
                    plan_code: scenario.plan_code,
                    version_code: versionCode,
                    lv2_channel_code: channel.channel_code,
                    lv2_channel_name: channel.channel_name,
                    sku_code: sku.sku_code,
                    sku_name: sku.sku_name,
                    lv3_category_code: sku.category_code || '',
                    lv3_category_name: sku.category_name || '',
                    plan_week: weekRow.plan_week,
                    week_start_date: weekRow.week_start_date,
                    week_end_date: weekRow.week_end_date,
                    plan_value: getWeekValue({
                        baseQuota,
                        channelCode: channel.channel_code,
                        skuName: sku.sku_name,
                        categoryName: sku.category_name || '',
                        weekFactor: scenario.week_factors[weekIndex] || 1,
                        scenarioFactor: scenario.scenario_factor
                    }),
                    is_locked: false,
                    lock_rule_id: 0,
                    lock_rule_ids: [],
                    lock_reason: '',
                    force_edit_reason: '',
                    force_edited_by: '',
                    force_edited_time: '',
                    is_modified: false,
                    updated_by: OPERATOR,
                    updated_time: time,
                    seed_tag: SEED_TAG
                });
            });
        });
    });

    applyLockSnapshotToRows(db, dataRows);

    db.biz.channel_demand_plans.push(plan);
    db.biz.channel_demand_plan_channels.push(...planChannels);
    db.biz.channel_demand_plan_skus.push(...planSkus);
    db.biz.channel_demand_plan_versions.push(version);
    db.biz.channel_demand_plan_channel_statuses.push(...channelStatuses);
    db.biz.channel_demand_plan_data.push(...dataRows);

    if (scenario.status === PLAN_STATUS.CONFIRMED) {
        db.biz.downstream_demand_plan_jobs.push({
            id: nextId(db.biz.downstream_demand_plan_jobs),
            plan_code: scenario.plan_code,
            version_code: versionCode,
            job_status: 'PENDING',
            trigger_type: 'MANUAL_CONFIRM',
            trigger_by: OPERATOR,
            trigger_time: time,
            result_message: '待下游消费',
            seed_tag: SEED_TAG
        });
    }

    return {
        plan_code: scenario.plan_code,
        version_code: versionCode,
        channel_count: channels.length,
        sku_count: skus.length,
        locked_cell_count: dataRows.filter((row) => Number(row.is_locked) === 1).length
    };
};

const main = () => {
    const currentDb = readDb();
    ensureChannelDemandPlanStructures(currentDb);

    const channelMap = buildChannelMaps(currentDb);
    const skuMap = buildSkuMap(currentDb);
    const channelSkuStats = buildChannelSkuStats(currentDb);

    const scenarios = [
        {
            plan_code: 'CDP-DEMO-EAST-CORE',
            plan_name: '华东重点渠道周需求计划',
            version_label: '首版排产建议',
            channel_codes: ['CH-L2-DIST', 'CH-L2-KA', 'CH-L2-NEWRETAIL'],
            sku_pick_count: 6,
            begin_week: '2026W18',
            week_count: 4,
            week_factors: [0.98, 1.04, 1.1, 1.16],
            scenario_factor: 1.02,
            status: PLAN_STATUS.CONFIRMED,
            submitted_channels: ['CH-L2-DIST', 'CH-L2-KA', 'CH-L2-NEWRETAIL'],
            remark: '基于渠道档案、授权配额和周度备货节奏生成的演示数据'
        },
        {
            plan_code: 'CDP-DEMO-ECOM-PRIVATE',
            plan_name: '电商与私域大促需求计划',
            version_label: '大促预估版',
            channel_codes: ['CH-L2-ECOM', 'CH-L2-PRIVATE'],
            sku_pick_count: 5,
            begin_week: '2026W19',
            week_count: 5,
            week_factors: [1.1, 1.18, 1.26, 1.21, 1.08],
            scenario_factor: 1.08,
            status: PLAN_STATUS.DRAFT,
            submitted_channels: [],
            remark: '用于演示电商与私域大促前的周度需求测算与锁定控制'
        },
        {
            plan_code: 'CDP-DEMO-DIST-KA',
            plan_name: '端午档经销与商超备货计划',
            version_label: '渠道提交中',
            channel_codes: ['CH-L2-DIST', 'CH-L2-KA'],
            sku_pick_count: 4,
            begin_week: '2026W20',
            week_count: 4,
            week_factors: [1.02, 1.14, 1.2, 1.12],
            scenario_factor: 1.05,
            status: PLAN_STATUS.SUBMITTING,
            submitted_channels: ['CH-L2-DIST'],
            remark: '用于演示部分渠道已提交、部分渠道仍在修改中的状态'
        }
    ].map((scenario) => ({
        ...scenario,
        sku_codes: pickTopSkusForChannels(channelSkuStats, scenario.channel_codes, scenario.sku_pick_count)
    }));

    const lockRulePayloads = [
        {
            sku_code: scenarios[1].sku_codes[1] || scenarios[1].sku_codes[0],
            channel_codes: ['CH-L2-ECOM', 'CH-L2-PRIVATE'],
            start_date: '2026-04-28',
            end_date: '2026-05-18',
            remark: '618大促投放前锁定主推规格，避免版本反复改动'
        },
        {
            sku_code: scenarios[0].sku_codes[4] || scenarios[0].sku_codes[0],
            channel_codes: ['CH-L2-KA', 'CH-L2-NEWRETAIL'],
            start_date: '2026-05-11',
            end_date: '2026-05-31',
            remark: '端午档酸奶陈列档期锁量'
        },
        {
            sku_code: scenarios[2].sku_codes[0],
            channel_codes: ['CH-L2-DIST'],
            start_date: '2026-04-01',
            end_date: '2026-04-15',
            remark: '历史档期示例，保留用于展示过期规则'
        }
    ];

    const result = updateDb((db) => {
        ensureChannelDemandPlanStructures(db);
        cleanSeedRows(db);

        const time = nowIso();
        const seedChannelMap = buildChannelMaps(db);
        const seedSkuMap = buildSkuMap(db);
        const summaries = [];

        lockRulePayloads.forEach((payload) => {
            if (!payload.sku_code) return;
            const row = createLockRuleRow(db, seedChannelMap, seedSkuMap, payload, OPERATOR, time);
            if (row) db.biz.product_lock_rules.push(row);
        });

        scenarios.forEach((scenario) => {
            if (!scenario.sku_codes.length) return;
            summaries.push(
                createPlanRows({
                    db,
                    scenario,
                    channelMap: seedChannelMap,
                    skuMap: seedSkuMap,
                    channelSkuStats,
                    time
                })
            );
        });

        return {
            seed_tag: SEED_TAG,
            plans: summaries,
            lock_rule_count: arr(db.biz.product_lock_rules).filter((row) => String(row.seed_tag) === SEED_TAG).length
        };
    });

    console.log('[channel-demand-seed] completed');
    console.log(JSON.stringify(result, null, 2));
};

main();
