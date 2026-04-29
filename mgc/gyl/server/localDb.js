const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { SKU_RULE_DICT_TYPES, SKU_RULE_DICT_ITEMS } = require('./skuRules');
const { repairOrBuildSpuRows } = require('./spuCatalog');
const { migrateDairyCategoryData } = require('./dairyCategoryCatalog');

const DATA_DIR = path.join(__dirname, 'local-data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cachedDb = null;
let cachedDbMtimeMs = 0;

const ensureArray = (value) => (Array.isArray(value) ? value : []);
const ensureObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();

const DEFAULT_PLATFORM_PAGES = [
    { id: 41, name: '字典中心', path: '/dict-center', permission: 'sys:dict:view', parent_id: 10 },
    { id: 42, name: '操作日志', path: '/operation-log', permission: 'sys:log:view', parent_id: 10 },
    { id: 43, name: '导入任务', path: '/import-task', permission: 'sys:import:view', parent_id: 10 },
    { id: 44, name: '导出任务', path: '/export-task', permission: 'sys:export:view', parent_id: 10 },
    { id: 45, name: '订单闭环中心', path: '/intelligent-closed-loop', permission: 'biz:intelligent:closed-loop:view', parent_id: 20 },
    { id: 46, name: '库存与仓配运营中心', path: '/inventory-ops', permission: 'biz:inventory:ops:view', parent_id: 20 },
    { id: 47, name: '渠道与经销商经营中心', path: '/channel-dealer-ops', permission: 'biz:channel:dealer:ops:view', parent_id: 20 },
    { id: 48, name: '流程协同与待办中心', path: '/workflow-center', permission: 'biz:workflow:center:view', parent_id: 20 },
    { id: 49, name: '经营分析与管理驾驶舱', path: '/management-cockpit', permission: 'biz:management:cockpit:view', parent_id: 20 },
    { id: 50, name: '企业级平台能力中心', path: '/enterprise-platform', permission: 'sys:enterprise:platform:view', parent_id: 10 }
];

const DEFAULT_MDM_PAGES = [
    { id: 314, name: '标准商品SPU', path: '/mdm/spu', permission: 'mdm:spu:view', parent_id: 30, icon: 'GoodsFilled', sort_no: 300 }
];

const BASE_DICT_TYPES = [
    { id: 1, dict_type_code: 'data_scope_type', dict_type_name: '数据范围类型', status: 1, sort_order: 1, remark: '角色数据权限范围', system_flag: 1 },
    { id: 2, dict_type_code: 'import_task_status', dict_type_name: '导入任务状态', status: 1, sort_order: 2, remark: '导入任务执行状态', system_flag: 1 },
    { id: 3, dict_type_code: 'export_task_status', dict_type_name: '导出任务状态', status: 1, sort_order: 3, remark: '导出任务执行状态', system_flag: 1 },
    { id: 4, dict_type_code: 'operation_result_status', dict_type_name: '操作结果状态', status: 1, sort_order: 4, remark: '操作日志执行结果', system_flag: 1 },
    { id: 5, dict_type_code: 'notification_status', dict_type_name: '通知状态', status: 1, sort_order: 5, remark: '站内通知状态', system_flag: 1 }
];

const DEFAULT_DICT_TYPES = [...BASE_DICT_TYPES, ...SKU_RULE_DICT_TYPES];

const BASE_DICT_ITEMS = [
    { id: 1, dict_type_code: 'data_scope_type', item_code: 'ALL', item_name: '全部数据', item_value: 'ALL', item_color: 'danger', sort_order: 1, status: 1, system_flag: 1 },
    { id: 2, dict_type_code: 'data_scope_type', item_code: 'DEPT', item_name: '本部门数据', item_value: 'DEPT', item_color: 'primary', sort_order: 2, status: 1, system_flag: 1 },
    { id: 3, dict_type_code: 'data_scope_type', item_code: 'DEPT_AND_CHILD', item_name: '本部门及下级', item_value: 'DEPT_AND_CHILD', item_color: 'primary', sort_order: 3, status: 1, system_flag: 1 },
    { id: 4, dict_type_code: 'data_scope_type', item_code: 'SELF', item_name: '仅本人数据', item_value: 'SELF', item_color: 'success', sort_order: 4, status: 1, system_flag: 1 },
    { id: 5, dict_type_code: 'import_task_status', item_code: 'SUCCESS', item_name: '成功', item_value: 'SUCCESS', item_color: 'success', sort_order: 1, status: 1, system_flag: 1 },
    { id: 6, dict_type_code: 'import_task_status', item_code: 'PARTIAL_SUCCESS', item_name: '部分成功', item_value: 'PARTIAL_SUCCESS', item_color: 'warning', sort_order: 2, status: 1, system_flag: 1 },
    { id: 7, dict_type_code: 'import_task_status', item_code: 'FAILED', item_name: '失败', item_value: 'FAILED', item_color: 'danger', sort_order: 3, status: 1, system_flag: 1 },
    { id: 8, dict_type_code: 'export_task_status', item_code: 'SUCCESS', item_name: '成功', item_value: 'SUCCESS', item_color: 'success', sort_order: 1, status: 1, system_flag: 1 },
    { id: 9, dict_type_code: 'export_task_status', item_code: 'FAILED', item_name: '失败', item_value: 'FAILED', item_color: 'danger', sort_order: 2, status: 1, system_flag: 1 },
    { id: 10, dict_type_code: 'operation_result_status', item_code: 'SUCCESS', item_name: '成功', item_value: 'SUCCESS', item_color: 'success', sort_order: 1, status: 1, system_flag: 1 },
    { id: 11, dict_type_code: 'operation_result_status', item_code: 'FAILED', item_name: '失败', item_value: 'FAILED', item_color: 'danger', sort_order: 2, status: 1, system_flag: 1 },
    { id: 12, dict_type_code: 'notification_status', item_code: 'UNREAD', item_name: '未读', item_value: 'UNREAD', item_color: 'warning', sort_order: 1, status: 1, system_flag: 1 },
    { id: 13, dict_type_code: 'notification_status', item_code: 'READ', item_name: '已读', item_value: 'READ', item_color: 'success', sort_order: 2, status: 1, system_flag: 1 }
];

const DEFAULT_DICT_ITEMS = [...BASE_DICT_ITEMS, ...SKU_RULE_DICT_ITEMS];

const DEFAULT_SYSTEM_CONFIG_DEFINITIONS = [
    {
        config_code: 'algo_weight',
        config_name: '算法权重配置',
        config_type: 'ALGORITHM_WEIGHT',
        config_value: {
            inventory_weight: 0.32,
            distance_weight: 0.22,
            freshness_weight: 0.2,
            cost_weight: 0.14,
            priority_weight: 0.12
        }
    },
    {
        config_code: 'alert_threshold',
        config_name: '预警阈值配置',
        config_type: 'ALERT_THRESHOLD',
        config_value: {
            order_delay_minutes: 30,
            inventory_warning_days: 7,
            api_slow_ms: 800,
            api_error_rate_percent: 5
        }
    },
    {
        config_code: 'workflow_param',
        config_name: '流程参数配置',
        config_type: 'WORKFLOW_PARAM',
        config_value: {
            approve_timeout_hours: 24,
            escalate_timeout_hours: 48,
            auto_retry_count: 2
        }
    }
];

const DEFAULT_ARCHIVE_POLICY_DEFINITIONS = [
    {
        policy_code: 'ORDER_ARCHIVE',
        policy_name: '订单归档策略',
        target_type: 'ORDER',
        retention_days: 365
    },
    {
        policy_code: 'LOG_ARCHIVE',
        policy_name: '日志归档策略',
        target_type: 'LOG',
        retention_days: 180
    },
    {
        policy_code: 'TASK_ARCHIVE',
        policy_name: '导入导出任务归档策略',
        target_type: 'IMPORT_EXPORT',
        retention_days: 120
    }
];

const DEFAULT_FINE_PERMISSION_FIELDS = [
    { field: 'status', label: '状态', visible: 1, editable: 1 },
    { field: 'owner_name', label: '负责人', visible: 1, editable: 1 },
    { field: 'amount', label: '金额', visible: 1, editable: 0 },
    { field: 'remark', label: '备注', visible: 1, editable: 1 }
];

const buildDefaultSystemConfigRows = (timeIso) =>
    DEFAULT_SYSTEM_CONFIG_DEFINITIONS.map((item, index) => ({
        id: index + 1,
        config_code: item.config_code,
        config_name: item.config_name,
        config_type: item.config_type,
        config_value: cloneJson(item.config_value),
        status: 1,
        version: 1,
        updated_by: 'system',
        created_at: timeIso,
        updated_at: timeIso
    }));

const buildDefaultSystemConfigVersionRows = (configs, timeIso) =>
    configs.map((item, index) => ({
        id: index + 1,
        config_id: item.id,
        config_code: item.config_code,
        version: 1,
        status: 1,
        config_value: cloneJson(item.config_value),
        change_note: '初始化版本',
        changed_by: 'system',
        changed_at: timeIso
    }));

const buildDefaultArchivePolicyRows = (timeIso) =>
    DEFAULT_ARCHIVE_POLICY_DEFINITIONS.map((item, index) => ({
        id: index + 1,
        policy_code: item.policy_code,
        policy_name: item.policy_name,
        target_type: item.target_type,
        retention_days: item.retention_days,
        status: 1,
        last_run_at: '',
        created_at: timeIso,
        updated_at: timeIso
    }));

const ensureDir = () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const createSeedDb = () => {
    const t = nowIso();
    const passwordHash = bcrypt.hashSync('123456789', 10);

    const pages = [
        [11, '部门管理', '/department', 'sys:dept:view', 10],
        [12, '用户管理', '/user', 'sys:user:view', 10],
        [13, '角色管理', '/role', 'sys:role:view', 10],
        [14, '岗位管理', '/post', 'sys:post:view', 10],
        [15, '权限管理', '/permission', 'sys:permission:view', 10],
        [21, '牧场概览', '/pasture', 'biz:pasture:view', 20],
        [22, '智能订购中心', '/intelligent', 'biz:intelligent:view', 20],
        [23, '订单闭环中心', '/intelligent-closed-loop', 'biz:intelligent:closed-loop:view', 20],
        [24, '库存与仓配运营中心', '/inventory-ops', 'biz:inventory:ops:view', 20],
        [25, '渠道与经销商经营中心', '/channel-dealer-ops', 'biz:channel:dealer:ops:view', 20],
        [26, '流程协同与待办中心', '/workflow-center', 'biz:workflow:center:view', 20],
        [27, '经营分析与管理驾驶舱', '/management-cockpit', 'biz:management:cockpit:view', 20],
        [31, 'SKU管理', '/mdm/sku', 'mdm:sku:view', 30],
        [32, '经销关系', '/mdm/reseller-relation', 'mdm:relation:view', 30]
    ].map(([id, name, pathVal, permission, parent]) => ({
            id,
            name,
            alias: `PAGE_${id}`,
            permission,
            parent_id: parent,
            parent_ids: `0,${parent}`,
            type: 'page',
            path: pathVal,
            icon: 'Menu',
            moudel_id: 1,
            sort_no: id
        }));

    const roles = [
        { id: 1, name: '超级管理员', code: 'ROLE_SUPER_ADMIN', status: 1, sort_no: 1, data_type: 2, data_scope_type: 'ALL', data_scope_config: {}, description: '系统最高权限', created_time: t },
        { id: 3, name: '业务运营经理', code: 'ROLE_BIZ_MANAGER', status: 1, sort_no: 3, data_type: 2, data_scope_type: 'ALL', data_scope_config: {}, description: '业务看板与调度', created_time: t },
        { id: 4, name: '需求计划专员', code: 'ROLE_PLAN_OP', status: 1, sort_no: 4, data_type: 2, data_scope_type: 'ALL', data_scope_config: {}, description: '智能订购维护', created_time: t }
    ];

    const rolePages = pages.map((page) => ({ role_id: 1, page_id: page.id }));
    const systemConfigs = buildDefaultSystemConfigRows(t);
    const systemConfigVersions = buildDefaultSystemConfigVersionRows(systemConfigs, t);
    const archivePolicies = buildDefaultArchivePolicyRows(t);

    return {
        meta: {
            created_at: t,
            updated_at: t,
            helper_code: '952746',
            helper_code_updated_at: t,
            sms_codes: {}
        },
        system: {
            departments: [],
            jobtitles: [],
            pages,
            roles,
            role_pages: rolePages,
            role_jobs: [],
            accounts: [
                {
                    id: 1,
                    login_id: 'jiaohaoyuan',
                    nick_name: '超级管理员',
                    password_hash: passwordHash,
                    mobile: '13800000000',
                    email: 'admin@local.dev',
                    department_id: '100',
                    status: 1,
                    created_time: t
                }
            ],
            account_roles: [{ account_id: 1, role_id: 1 }],
            account_posts: []
        },
        master: {
            category: [],
            factory: [],
            warehouse: [],
            channel: [],
            reseller: [],
            org: [],
            sku: [],
            spu: [],
            reseller_relation: [],
            rltn_warehouse_sku: [],
            rltn_org_reseller: [],
            rltn_product_sku: [],
            calendar: []
        },
        biz: {
            products: [],
            orders: [],
            pasture_stats: [],
            order_headers: [],
            order_lines: [],
            order_audit_records: [],
            order_allocation_plans: [],
            inventory_stock: [],
            order_exceptions: [],
            replenishment_suggestions: [],
            fulfillment_tracks: [],
            order_allocation_weights: {
                inventory_weight: 0.32,
                distance_weight: 0.22,
                freshness_weight: 0.2,
                cost_weight: 0.14,
                priority_weight: 0.12,
                updated_by: 'system',
                updated_at: t
            },
            inventory_ledger: [],
            inventory_transactions: [],
            transfer_orders: [],
            transfer_tracks: [],
            inventory_warnings: [],
            warehouse_capabilities: [],
            inventory_locks: []
        },
        platform: {
            dict_types: cloneJson(DEFAULT_DICT_TYPES),
            dict_items: cloneJson(DEFAULT_DICT_ITEMS),
            operation_logs: [],
            security_logs: [],
            import_tasks: [],
            export_tasks: [],
            notifications: [],
            system_configs: systemConfigs,
            system_config_versions: systemConfigVersions,
            archive_policies: archivePolicies,
            archive_jobs: [],
            fine_permissions: [],
            api_metrics: [],
            task_runs: [],
            workflow_todos: [],
            workflow_approvals: [],
            workflow_messages: [],
            workflow_tasks: [],
            workflow_reminders: [],
            workflow_timeout_rules: [],
            management_reports: [],
            mdm_sku_code_mappings: []
        }
    };
};

const upsertRowsByPath = (rows, incomingRows) => {
    const list = ensureArray(rows);
    incomingRows.forEach((item) => {
        if (!list.some((row) => String(row.path) === String(item.path))) {
            list.push(cloneJson(item));
        }
    });
    return list;
};

const ensurePlatformStructures = (db) => {
    let changed = false;

    db.meta = ensureObject(db.meta);
    db.system = ensureObject(db.system);
    db.master = ensureObject(db.master);
    db.biz = ensureObject(db.biz);
    db.platform = ensureObject(db.platform);

    db.system.departments = ensureArray(db.system.departments);
    db.system.jobtitles = ensureArray(db.system.jobtitles);
    db.system.pages = ensureArray(db.system.pages);
    db.system.roles = ensureArray(db.system.roles);
    db.system.role_pages = ensureArray(db.system.role_pages);
    db.system.role_jobs = ensureArray(db.system.role_jobs);
    db.system.accounts = ensureArray(db.system.accounts);
    db.system.account_roles = ensureArray(db.system.account_roles);
    db.system.account_posts = ensureArray(db.system.account_posts);

    db.master.category = ensureArray(db.master.category);
    db.master.factory = ensureArray(db.master.factory);
    db.master.warehouse = ensureArray(db.master.warehouse);
    db.master.channel = ensureArray(db.master.channel);
    db.master.reseller = ensureArray(db.master.reseller);
    db.master.org = ensureArray(db.master.org);
    db.master.sku = ensureArray(db.master.sku);
    db.master.spu = ensureArray(db.master.spu);
    db.master.reseller_relation = ensureArray(db.master.reseller_relation);
    db.master.rltn_warehouse_sku = ensureArray(db.master.rltn_warehouse_sku);
    db.master.rltn_org_reseller = ensureArray(db.master.rltn_org_reseller);
    db.master.rltn_product_sku = ensureArray(db.master.rltn_product_sku);
    db.master.calendar = ensureArray(db.master.calendar);

    db.platform.dict_types = ensureArray(db.platform.dict_types);
    db.platform.dict_items = ensureArray(db.platform.dict_items);
    db.platform.operation_logs = ensureArray(db.platform.operation_logs);
    db.platform.security_logs = ensureArray(db.platform.security_logs);
    db.platform.import_tasks = ensureArray(db.platform.import_tasks);
    db.platform.export_tasks = ensureArray(db.platform.export_tasks);
    db.platform.notifications = ensureArray(db.platform.notifications);
    db.platform.system_configs = ensureArray(db.platform.system_configs);
    db.platform.system_config_versions = ensureArray(db.platform.system_config_versions);
    db.platform.archive_policies = ensureArray(db.platform.archive_policies);
    db.platform.archive_jobs = ensureArray(db.platform.archive_jobs);
    db.platform.fine_permissions = ensureArray(db.platform.fine_permissions);
    db.platform.api_metrics = ensureArray(db.platform.api_metrics);
    db.platform.task_runs = ensureArray(db.platform.task_runs);
    db.platform.workflow_todos = ensureArray(db.platform.workflow_todos);
    db.platform.workflow_approvals = ensureArray(db.platform.workflow_approvals);
    db.platform.workflow_messages = ensureArray(db.platform.workflow_messages);
    db.platform.workflow_tasks = ensureArray(db.platform.workflow_tasks);
    db.platform.workflow_reminders = ensureArray(db.platform.workflow_reminders);
    db.platform.workflow_timeout_rules = ensureArray(db.platform.workflow_timeout_rules);
    db.platform.management_reports = ensureArray(db.platform.management_reports);
    db.platform.mdm_sku_code_mappings = ensureArray(db.platform.mdm_sku_code_mappings);

    DEFAULT_DICT_TYPES.forEach((item) => {
        if (!db.platform.dict_types.some((row) => String(row.dict_type_code) === String(item.dict_type_code))) {
            db.platform.dict_types.push(cloneJson(item));
            changed = true;
        }
    });

    DEFAULT_DICT_ITEMS.forEach((item) => {
        if (!db.platform.dict_items.some((row) => String(row.dict_type_code) === String(item.dict_type_code) && String(row.item_code) === String(item.item_code))) {
            db.platform.dict_items.push(cloneJson(item));
            changed = true;
        }
    });

    DEFAULT_SYSTEM_CONFIG_DEFINITIONS.forEach((definition) => {
        const exists = db.platform.system_configs.find((row) => String(row.config_code) === String(definition.config_code));
        if (exists) return;
        const configId = nextId(db.platform.system_configs);
        db.platform.system_configs.push({
            id: configId,
            config_code: definition.config_code,
            config_name: definition.config_name,
            config_type: definition.config_type,
            config_value: cloneJson(definition.config_value),
            status: 1,
            version: 1,
            updated_by: 'system',
            created_at: nowIso(),
            updated_at: nowIso()
        });
        db.platform.system_config_versions.push({
            id: nextId(db.platform.system_config_versions),
            config_id: configId,
            config_code: definition.config_code,
            version: 1,
            status: 1,
            config_value: cloneJson(definition.config_value),
            change_note: '初始化版本',
            changed_by: 'system',
            changed_at: nowIso()
        });
        changed = true;
    });

    DEFAULT_ARCHIVE_POLICY_DEFINITIONS.forEach((definition) => {
        if (db.platform.archive_policies.some((row) => String(row.policy_code) === String(definition.policy_code))) return;
        db.platform.archive_policies.push({
            id: nextId(db.platform.archive_policies),
            policy_code: definition.policy_code,
            policy_name: definition.policy_name,
            target_type: definition.target_type,
            retention_days: definition.retention_days,
            status: 1,
            last_run_at: '',
            created_at: nowIso(),
            updated_at: nowIso()
        });
        changed = true;
    });

    const incomingPages = DEFAULT_PLATFORM_PAGES.map((page) => ({
        id: page.id,
        name: page.name,
        alias: `PAGE_${page.id}`,
        permission: page.permission,
        parent_id: page.parent_id,
        parent_ids: `0,${page.parent_id}`,
        type: 'page',
        path: page.path,
        icon: 'Monitor',
        moudel_id: 1,
        sort_no: page.id
    }));
    const beforePages = db.system.pages.length;
    db.system.pages = upsertRowsByPath(db.system.pages, incomingPages);
    if (db.system.pages.length !== beforePages) changed = true;

    DEFAULT_MDM_PAGES.forEach((page) => {
        const existing = db.system.pages.find((row) => String(row.path) === String(page.path));
        const next = {
            id: page.id,
            name: page.name,
            alias: `P${page.id}`,
            code: page.permission,
            permission: page.permission,
            parent_id: page.parent_id,
            parent_ids: `0,${page.parent_id}`,
            type: 'menu',
            path: page.path,
            icon: page.icon || 'Menu',
            moudel_id: page.parent_id,
            sort_no: page.sort_no ?? page.id,
            status: 1,
            created_time: nowIso(),
            updated_time: nowIso()
        };
        if (!existing) {
            db.system.pages.push(next);
            changed = true;
            return;
        }
        const patch = {};
        ['name', 'alias', 'code', 'permission', 'parent_id', 'parent_ids', 'type', 'icon', 'moudel_id', 'sort_no', 'status'].forEach((key) => {
            if (String(existing[key] ?? '') !== String(next[key] ?? '')) patch[key] = next[key];
        });
        if (Object.keys(patch).length) {
            Object.assign(existing, patch, { updated_time: nowIso() });
            changed = true;
        }
    });

    if (migrateDairyCategoryData(db, { timeIso: nowIso() })) {
        changed = true;
    }

    const spuRepair = repairOrBuildSpuRows(db.master.spu, {
        skuRows: db.master.sku,
        categoryRows: db.master.category,
        timeIso: nowIso()
    });
    if (spuRepair.changed) {
        db.master.spu = spuRepair.rows;
        changed = true;
    }

    db.master.sku.forEach((sku) => {
        if (Object.prototype.hasOwnProperty.call(sku, 'spu_code') && !String(sku.spu_code || '').trim()) {
            delete sku.spu_code;
            changed = true;
        }
    });

    const superAdmin = db.system.roles.find((role) => Number(role.id) === 1);
    if (!superAdmin) {
        db.system.roles.push({ id: 1, name: '超级管理员', code: 'ROLE_SUPER_ADMIN', status: 1, sort_no: 1, data_type: 2, data_scope_type: 'ALL', data_scope_config: {}, description: '系统最高权限', created_time: nowIso() });
        changed = true;
    }

    db.system.roles = db.system.roles.map((role) => {
        const next = { ...role };
        if (!next.data_scope_type) {
            next.data_scope_type = 'ALL';
            changed = true;
        }
        if (!next.data_scope_config || typeof next.data_scope_config !== 'object' || Array.isArray(next.data_scope_config)) {
            next.data_scope_config = {};
            changed = true;
        }
        return next;
    });

    db.platform.system_configs = db.platform.system_configs.map((row) => {
        const next = { ...row };
        if (!next.version || Number(next.version) < 1) {
            next.version = 1;
            changed = true;
        }
        if (!next.updated_by) {
            next.updated_by = 'system';
            changed = true;
        }
        if (!next.created_at) {
            next.created_at = nowIso();
            changed = true;
        }
        if (!next.updated_at) {
            next.updated_at = nowIso();
            changed = true;
        }
        if (next.status !== 0 && next.status !== 1) {
            next.status = 1;
            changed = true;
        }
        return next;
    });

    db.platform.archive_policies = db.platform.archive_policies.map((row) => {
        const next = { ...row };
        if (!next.retention_days || Number(next.retention_days) < 1) {
            next.retention_days = 180;
            changed = true;
        }
        if (next.status !== 0 && next.status !== 1) {
            next.status = 1;
            changed = true;
        }
        if (!next.created_at) {
            next.created_at = nowIso();
            changed = true;
        }
        if (!next.updated_at) {
            next.updated_at = nowIso();
            changed = true;
        }
        return next;
    });

    db.system.pages.forEach((page) => {
        if (!db.system.role_pages.some((row) => Number(row.role_id) === 1 && Number(row.page_id) === Number(page.id))) {
            db.system.role_pages.push({ role_id: 1, page_id: Number(page.id) });
            changed = true;
        }
    });

    const finePermissionRows = db.platform.fine_permissions;
    const finePermissionPaths = ['/enterprise-platform', '/operation-log', '/workflow-center', '/user'];
    const pageMapByPath = finePermissionPaths.reduce((acc, itemPath) => {
        const page = db.system.pages.find((row) => String(row.path) === itemPath);
        if (page) acc[itemPath] = page;
        return acc;
    }, {});
    db.system.roles.forEach((role) => {
        finePermissionPaths.forEach((itemPath) => {
            const page = pageMapByPath[itemPath];
            if (!page) return;
            if (finePermissionRows.some((row) => Number(row.role_id) === Number(role.id) && String(row.module_path) === itemPath)) return;
            finePermissionRows.push({
                id: nextId(finePermissionRows),
                role_id: Number(role.id),
                role_name: role.name,
                module_path: itemPath,
                module_name: page.name || itemPath,
                button_codes: Number(role.id) === 1 ? ['view', 'create', 'edit', 'delete', 'export'] : ['view'],
                data_scope_type: role.data_scope_type || 'ALL',
                data_scope_config: role.data_scope_config && typeof role.data_scope_config === 'object' ? cloneJson(role.data_scope_config) : {},
                field_permissions: cloneJson(DEFAULT_FINE_PERMISSION_FIELDS),
                created_at: nowIso(),
                updated_at: nowIso()
            });
            changed = true;
        });
    });

    const intelligentPage = db.system.pages.find((page) => String(page.path) === '/intelligent');
    const inheritedPages = ['/intelligent-closed-loop', '/inventory-ops', '/channel-dealer-ops', '/workflow-center', '/management-cockpit']
        .map((p) => db.system.pages.find((page) => String(page.path) === p))
        .filter(Boolean);
    if (intelligentPage && inheritedPages.length) {
        const roleIds = [...new Set(
            db.system.role_pages
                .filter((row) => Number(row.page_id) === Number(intelligentPage.id))
                .map((row) => Number(row.role_id))
        )];
        roleIds.forEach((roleId) => {
            inheritedPages.forEach((page) => {
                if (!db.system.role_pages.some((row) => Number(row.role_id) === roleId && Number(row.page_id) === Number(page.id))) {
                    db.system.role_pages.push({ role_id: roleId, page_id: Number(page.id) });
                    changed = true;
                }
            });
        });
    }

    const ensureBizArray = (key) => {
        db.biz[key] = ensureArray(db.biz[key]);
    };

    ensureBizArray('products');
    ensureBizArray('orders');
    ensureBizArray('pasture_stats');
    ensureBizArray('order_headers');
    ensureBizArray('order_lines');
    ensureBizArray('order_audit_records');
    ensureBizArray('order_allocation_plans');
    ensureBizArray('inventory_stock');
    ensureBizArray('order_exceptions');
    ensureBizArray('replenishment_suggestions');
    ensureBizArray('fulfillment_tracks');
    ensureBizArray('inventory_ledger');
    ensureBizArray('inventory_transactions');
    ensureBizArray('transfer_orders');
    ensureBizArray('transfer_tracks');
    ensureBizArray('inventory_warnings');
    ensureBizArray('warehouse_capabilities');
    ensureBizArray('inventory_locks');

    if (!db.biz.order_allocation_weights || typeof db.biz.order_allocation_weights !== 'object' || Array.isArray(db.biz.order_allocation_weights)) {
        db.biz.order_allocation_weights = {
            inventory_weight: 0.32,
            distance_weight: 0.22,
            freshness_weight: 0.2,
            cost_weight: 0.14,
            priority_weight: 0.12,
            updated_by: 'system',
            updated_at: nowIso()
        };
        changed = true;
    }

    if (!db.meta.helper_code) {
        db.meta.helper_code = '952746';
        changed = true;
    }
    if (!db.meta.helper_code_updated_at) {
        db.meta.helper_code_updated_at = nowIso();
        changed = true;
    }
    if (!db.meta.sms_codes || typeof db.meta.sms_codes !== 'object' || Array.isArray(db.meta.sms_codes)) {
        db.meta.sms_codes = {};
        changed = true;
    }

    return changed;
};

const persist = (db) => {
    ensureDir();
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
    try {
        cachedDbMtimeMs = fs.statSync(DB_FILE).mtimeMs;
    } catch {
        cachedDbMtimeMs = 0;
    }
};

const loadDb = () => {
    ensureDir();
    if (!fs.existsSync(DB_FILE)) {
        cachedDb = createSeedDb();
        ensurePlatformStructures(cachedDb);
        persist(cachedDb);
        return cachedDb;
    }

    let diskMtimeMs = 0;
    try {
        diskMtimeMs = fs.statSync(DB_FILE).mtimeMs;
    } catch {
        diskMtimeMs = 0;
    }

    if (cachedDb && diskMtimeMs > 0 && diskMtimeMs <= cachedDbMtimeMs) {
        return cachedDb;
    }

    try {
        cachedDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        cachedDb = createSeedDb();
        ensurePlatformStructures(cachedDb);
        persist(cachedDb);
        return cachedDb;
    }

    if (ensurePlatformStructures(cachedDb)) {
        persist(cachedDb);
    }
    else {
        cachedDbMtimeMs = diskMtimeMs;
    }

    return cachedDb;
};

const saveDb = () => {
    if (!cachedDb) return;
    cachedDb.meta = ensureObject(cachedDb.meta);
    cachedDb.meta.updated_at = nowIso();
    persist(cachedDb);
};

const readDb = () => loadDb();

const updateDb = (updater) => {
    const db = loadDb();
    const result = updater(db);
    saveDb();
    return result;
};

const nextId = (rows) => {
    if (!rows?.length) return 1;
    return Math.max(...rows.map((r) => Number(r.id) || 0)) + 1;
};

module.exports = { DB_FILE, nowIso, readDb, updateDb, nextId };
