const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'local-data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cachedDb = null;

const ensureArray = (value) => (Array.isArray(value) ? value : []);
const ensureObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const DEFAULT_PLATFORM_PAGES = [
    { id: 41, name: '字典中心', path: '/dict-center', permission: 'sys:dict:view', parent_id: 10 },
    { id: 42, name: '操作日志', path: '/operation-log', permission: 'sys:log:view', parent_id: 10 },
    { id: 43, name: '导入任务', path: '/import-task', permission: 'sys:import:view', parent_id: 10 },
    { id: 44, name: '导出任务', path: '/export-task', permission: 'sys:export:view', parent_id: 10 }
];

const DEFAULT_DICT_TYPES = [
    { id: 1, dict_type_code: 'data_scope_type', dict_type_name: '数据范围类型', status: 1, sort_order: 1, remark: '角色数据权限范围', system_flag: 1 },
    { id: 2, dict_type_code: 'import_task_status', dict_type_name: '导入任务状态', status: 1, sort_order: 2, remark: '导入任务执行状态', system_flag: 1 },
    { id: 3, dict_type_code: 'export_task_status', dict_type_name: '导出任务状态', status: 1, sort_order: 3, remark: '导出任务执行状态', system_flag: 1 },
    { id: 4, dict_type_code: 'operation_result_status', dict_type_name: '操作结果状态', status: 1, sort_order: 4, remark: '操作日志执行结果', system_flag: 1 },
    { id: 5, dict_type_code: 'notification_status', dict_type_name: '通知状态', status: 1, sort_order: 5, remark: '站内通知状态', system_flag: 1 }
];

const DEFAULT_DICT_ITEMS = [
    { id: 1, dict_type_code: 'data_scope_type', item_code: 'ALL', item_name: '全部数据', item_value: 'ALL', item_color: 'danger', sort_order: 1, status: 1, system_flag: 1 },
    { id: 2, dict_type_code: 'data_scope_type', item_code: 'DEPT', item_name: '本部门数据', item_value: 'DEPT', item_color: 'primary', sort_order: 2, status: 1, system_flag: 1 },
    { id: 3, dict_type_code: 'data_scope_type', item_code: 'DEPT_AND_CHILD', item_name: '本部门及下级', item_value: 'DEPT_AND_CHILD', item_color: 'primary', sort_order: 3, status: 1, system_flag: 1 },
    { id: 4, dict_type_code: 'data_scope_type', item_code: 'SELF', item_name: '仅本人数据', item_value: 'SELF', item_color: 'success', sort_order: 4, status: 1, system_flag: 1 },
    { id: 5, dict_type_code: 'data_scope_type', item_code: 'REGION', item_name: '指定区域数据', item_value: 'REGION', item_color: 'warning', sort_order: 5, status: 1, system_flag: 1 },
    { id: 6, dict_type_code: 'data_scope_type', item_code: 'CHANNEL', item_name: '指定渠道数据', item_value: 'CHANNEL', item_color: 'warning', sort_order: 6, status: 1, system_flag: 1 },
    { id: 7, dict_type_code: 'data_scope_type', item_code: 'ORG', item_name: '指定组织数据', item_value: 'ORG', item_color: 'info', sort_order: 7, status: 1, system_flag: 1 },
    { id: 8, dict_type_code: 'import_task_status', item_code: 'SUCCESS', item_name: '成功', item_value: 'SUCCESS', item_color: 'success', sort_order: 1, status: 1, system_flag: 1 },
    { id: 9, dict_type_code: 'import_task_status', item_code: 'PARTIAL_SUCCESS', item_name: '部分成功', item_value: 'PARTIAL_SUCCESS', item_color: 'warning', sort_order: 2, status: 1, system_flag: 1 },
    { id: 10, dict_type_code: 'import_task_status', item_code: 'FAILED', item_name: '失败', item_value: 'FAILED', item_color: 'danger', sort_order: 3, status: 1, system_flag: 1 },
    { id: 11, dict_type_code: 'export_task_status', item_code: 'SUCCESS', item_name: '成功', item_value: 'SUCCESS', item_color: 'success', sort_order: 1, status: 1, system_flag: 1 },
    { id: 12, dict_type_code: 'export_task_status', item_code: 'FAILED', item_name: '失败', item_value: 'FAILED', item_color: 'danger', sort_order: 2, status: 1, system_flag: 1 },
    { id: 13, dict_type_code: 'operation_result_status', item_code: 'SUCCESS', item_name: '成功', item_value: 'SUCCESS', item_color: 'success', sort_order: 1, status: 1, system_flag: 1 },
    { id: 14, dict_type_code: 'operation_result_status', item_code: 'FAILED', item_name: '失败', item_value: 'FAILED', item_color: 'danger', sort_order: 2, status: 1, system_flag: 1 },
    { id: 15, dict_type_code: 'notification_status', item_code: 'UNREAD', item_name: '未读', item_value: 'UNREAD', item_color: 'warning', sort_order: 1, status: 1, system_flag: 1 },
    { id: 16, dict_type_code: 'notification_status', item_code: 'READ', item_name: '已读', item_value: 'READ', item_color: 'success', sort_order: 2, status: 1, system_flag: 1 }
];

const nowIso = () => new Date().toISOString();

const ensureDir = () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const toDateKey = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const weekOfYear = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const HOLIDAYS = {
    '2026-01-01': '元旦',
    '2026-02-17': '春节',
    '2026-02-18': '春节',
    '2026-02-19': '春节',
    '2026-04-05': '清明节',
    '2026-05-01': '劳动节',
    '2026-06-14': '端午节',
    '2026-10-01': '国庆节',
    '2026-10-02': '国庆节',
    '2026-10-03': '国庆节'
};

const buildCalendarRows = (year) => {
    const rows = [];
    let id = 1;
    for (let d = new Date(year, 0, 1); d <= new Date(year, 11, 31); d.setDate(d.getDate() + 1)) {
        const key = toDateKey(d);
        const day = d.getDay();
        const isWeekend = day === 0 || day === 6 ? 1 : 0;
        const holidayName = HOLIDAYS[key] || '';
        rows.push({
            id: id++,
            cal_date: key,
            day_of_week: day === 0 ? 7 : day,
            is_weekend: isWeekend,
            is_holiday: holidayName ? 1 : 0,
            holiday_name: holidayName,
            is_workday: holidayName ? 0 : (isWeekend ? 0 : 1),
            fscl_year: year,
            fscl_week_range: `${year}-W${String(weekOfYear(d)).padStart(2, '0')}`,
            status: 1,
            remark: '',
            created_time: nowIso(),
            updated_time: nowIso()
        });
    }
    return rows;
};

const createSeedDb = () => {
    const t = nowIso();
    const pwh = bcrypt.hashSync('123456789', 10);

    const departments = [
        ['100', '认养一头牛集团', '0', 1, 1, '焦浩元'],
        ['110', '供应链管理中心', '100', 2, 1, '王明'],
        ['111', '上游牧业部', '110', 3, 1, '张志伟'],
        ['112', '生产制造部', '110', 3, 2, '李芳'],
        ['120', '数智化运营中心', '100', 2, 2, '赵芸'],
        ['121', '需求规划部', '120', 3, 1, '陈思'],
        ['122', '系统管理部', '120', 3, 2, '周维']
    ].map(([id, name, parent, level, sort, leader]) => ({
        id,
        department_mark: `DEP-${id}`,
        department_name: name,
        department_code: `CODE-${id}`,
        sub_company_id: '1',
        sup_dep_id: parent,
        sup_dep_ids: parent === '0' ? '0' : `0,${parent}`,
        level,
        sort_no: sort,
        leader,
        phone: '0571-88000000',
        email: `${id}@ryytn.com`,
        created_time: t
    }));

    const jobtitles = [
        ['J111', 'POST_BREED', '奶牛育种专员', '111', 1],
        ['J112', 'POST_FEED', '饲料采购专员', '111', 2],
        ['J121', 'POST_MFG', '液态奶工艺专员', '112', 3],
        ['J131', 'POST_PLAN', '需求计划专员', '121', 4],
        ['J151', 'POST_ITOPS', '平台运维工程师', '122', 5]
    ].map(([id, mark, name, dep, sort]) => ({
        id,
        job_title_mark: mark,
        job_title_name: name,
        job_department_id: dep,
        status: 1,
        sort_no: sort,
        remark: '',
        created_time: t
    }));

    const pages = [
        [11, '部门管理', '/department', 'sys:dept:view', 10],
        [12, '用户管理', '/user', 'sys:user:view', 10],
        [13, '角色管理', '/role', 'sys:role:view', 10],
        [14, '岗位管理', '/post', 'sys:post:view', 10],
        [15, '权限管理', '/permission', 'sys:permission:view', 10],
        [21, '牧场概览', '/pasture', 'biz:pasture:view', 20],
        [22, '智能订购中心', '/intelligent', 'biz:intelligent:view', 20],
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
        [1, '超级管理员', 'ROLE_SUPER_ADMIN', 1, '系统最高权限'],
        [2, '组织管理员', 'ROLE_ORG_ADMIN', 2, '组织权限维护'],
        [3, '业务运营经理', 'ROLE_BIZ_MANAGER', 3, '业务看板与调度'],
        [4, '需求计划专员', 'ROLE_PLAN_OP', 4, '智能订购维护']
    ].map(([id, name, code, sort, description]) => ({
        id, name, code, status: 1, sort_no: sort, data_type: 2, description, created_time: t
    }));

    const rolePages = [
        ...pages.map(p => ({ role_id: 1, page_id: p.id })),
        { role_id: 2, page_id: 11 }, { role_id: 2, page_id: 12 }, { role_id: 2, page_id: 13 }, { role_id: 2, page_id: 14 }, { role_id: 2, page_id: 15 },
        { role_id: 3, page_id: 21 }, { role_id: 3, page_id: 22 },
        { role_id: 4, page_id: 22 }
    ];

    const roleJobs = [
        { role_id: 1, job_id: 'J151' },
        { role_id: 2, job_id: 'J151' },
        { role_id: 3, job_id: 'J121' },
        { role_id: 4, job_id: 'J131' }
    ];

    const accounts = [
        [1, 'jiaohaoyuan', '焦浩元', '13800000000', '122'],
        [2, 'wangming', '王明', '13800000001', '110'],
        [3, 'chensi', '陈思', '13800000002', '121']
    ].map(([id, login_id, nick_name, mobile, department_id]) => ({
        id, login_id, nick_name, password_hash: pwh, mobile, email: `${login_id}@ryytn.com`, department_id, status: 1, created_time: t
    }));

    const accountRoles = [
        { account_id: 1, role_id: 1 },
        { account_id: 2, role_id: 2 },
        { account_id: 2, role_id: 3 },
        { account_id: 3, role_id: 4 }
    ];

    const accountPosts = [
        { account_id: 1, job_id: 'J151' },
        { account_id: 2, job_id: 'J121' },
        { account_id: 3, job_id: 'J131' }
    ];

    const category = [
        { id: 1, category_code: 'CAT-L1-DAIRY', category_name: '乳制品', level: 1, parent_code: null, sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 2, category_code: 'CAT-L2-LIQUID', category_name: '液态奶', level: 2, parent_code: 'CAT-L1-DAIRY', sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 3, category_code: 'CAT-L3-UHT', category_name: '常温纯牛奶', level: 3, parent_code: 'CAT-L2-LIQUID', sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const factory = [
        { id: 1, factory_code: 'FAC-ANJI', factory_name: '安吉液态奶工厂', company_name: '认养一头牛乳业', type_name: '液态奶工厂', is_own: 1, province_name: '浙江省', city_name: '湖州市', district_name: '安吉县', address: '递铺街道乳业路1号', status: 1, remark: '', created_time: t, updated_time: t },
        { id: 2, factory_code: 'FAC-CHANGSHAN', factory_name: '常山奶粉工厂', company_name: '认养一头牛乳业', type_name: '奶粉工厂', is_own: 1, province_name: '浙江省', city_name: '衢州市', district_name: '常山县', address: '工业园乳品大道18号', status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const warehouse = [
        { id: 1, warehouse_code: 'WH-HQ-001', warehouse_name: '杭州集团总仓', biz_warehouse_code: 'BIZ-HZ-HQ', biz_warehouse_name: '杭州总仓', lv1_type_code: 'BDC', lv1_type_name: 'BDC', lv2_type_name: '总部中心仓', factory_code: 'FAC-ANJI', factory_name: '安吉液态奶工厂', warehouse_type_code: 'HQ', warehouse_type: 1, contact_person: '总部调拨中心', is_own: 1, province_name: '浙江省', city_name: '杭州市', district_name: '萧山区', address: '经济技术开发区仓储路18号', latitude: 30.184, longitude: 120.264, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 2, warehouse_code: 'WH-RDC-EAST', warehouse_name: '上海华东RDC', biz_warehouse_code: 'BIZ-SH-RDC', biz_warehouse_name: '华东RDC', lv1_type_code: 'RDC', lv1_type_name: 'RDC', lv2_type_name: '大区配送中心', factory_code: 'FAC-ANJI', factory_name: '安吉液态奶工厂', warehouse_type_code: 'RDC', warehouse_type: 2, contact_person: '华东配送', is_own: 1, province_name: '上海市', city_name: '上海市', district_name: '青浦区', address: '徐泾镇仓储大道56号', latitude: 31.206, longitude: 121.231, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 3, warehouse_code: 'WH-PST-ANJI', warehouse_name: '安吉生态牧场前置仓', biz_warehouse_code: 'BIZ-PST-AJ', biz_warehouse_name: '安吉牧场仓', lv1_type_code: 'FARM', lv1_type_name: '牧场仓', lv2_type_name: '奶源前置仓', factory_code: 'FAC-ANJI', factory_name: '安吉液态奶工厂', warehouse_type_code: 'PASTURE', warehouse_type: 3, contact_person: '安吉牧场调度', is_own: 1, province_name: '浙江省', city_name: '湖州市', district_name: '安吉县', address: '孝丰镇生态牧场', latitude: 30.639, longitude: 119.681, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 4, warehouse_code: 'WH-DC-SUZHOU', warehouse_name: '苏州渠道分拨仓', biz_warehouse_code: 'BIZ-SZ-DC', biz_warehouse_name: '苏州分拨仓', lv1_type_code: 'DC', lv1_type_name: 'DC', lv2_type_name: '城市分拨仓', factory_code: 'FAC-ANJI', factory_name: '安吉液态奶工厂', warehouse_type_code: 'DISTRIBUTOR', warehouse_type: 4, contact_person: '苏州渠道运营', is_own: 0, province_name: '江苏省', city_name: '苏州市', district_name: '相城区', address: '阳澄湖大道168号', latitude: 31.417, longitude: 120.642, status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const channel = [
        { id: 1, channel_code: 'CH-L1-OFFLINE', channel_name: '线下渠道', level: 1, parent_code: null, sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 2, channel_code: 'CH-L2-DIST', channel_name: '经销渠道', level: 2, parent_code: 'CH-L1-OFFLINE', sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 3, channel_code: 'CH-L3-KA', channel_name: 'KA商超', level: 3, parent_code: 'CH-L2-DIST', sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const reseller = [
        { id: 1, reseller_code: 'RS-SZ-LH', reseller_name: '苏州联华牧业贸易有限公司', is_own: 0, lv1_channel_code: 'CH-L1-OFFLINE', lv1_channel_name: '线下渠道', lv2_channel_code: 'CH-L2-DIST', lv2_channel_name: '经销渠道', lv3_channel_code: 'CH-L3-KA', lv3_channel_name: 'KA商超', sale_region_name: '华东', default_warehouse_code: 'WH-DC-SUZHOU', default_warehouse_name: '苏州渠道分拨仓', contract_type: '年度框架', contract_begin_date: '2026-01-01', contract_end_date: '2026-12-31', province_name: '江苏省', city_name: '苏州市', district_name: '相城区', status: 1, remark: '', created_time: t, updated_time: t },
        { id: 2, reseller_code: 'RS-DY-FLAG', reseller_name: '认养一头牛抖音旗舰店', is_own: 1, lv1_channel_code: 'CH-L1-ONLINE', lv1_channel_name: '线上渠道', lv2_channel_code: 'CH-L2-ECOM', lv2_channel_name: '电商平台', lv3_channel_code: 'CH-L3-DY', lv3_channel_name: '抖音电商', sale_region_name: '全国', default_warehouse_code: 'WH-HQ-001', default_warehouse_name: '杭州集团总仓', contract_type: '自营', contract_begin_date: '2026-01-01', contract_end_date: '2030-12-31', province_name: '浙江省', city_name: '杭州市', district_name: '萧山区', status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const org = [
        { id: 1, org_code: 'ORG-HQ', org_name: '集团总部', level: 1, parent_code: null, org_type: '总部', company_name: '认养一头牛集团', sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 2, org_code: 'ORG-EAST', org_name: '华东大区', level: 2, parent_code: 'ORG-HQ', org_type: '大区', company_name: '认养一头牛集团', sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t },
        { id: 3, org_code: 'ORG-EAST-SZ', org_name: '苏皖业务单元', level: 3, parent_code: 'ORG-EAST', org_type: '业务单元', company_name: '认养一头牛华东公司', sort_order: 1, status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const sku = [
        { id: 1, sku_code: 'SKU-UHT-250-12', sku_name: '常温纯牛奶250ml*12', bar_code: '6901000000001', category_code: 'CAT-L3-UHT', lifecycle_status: 'ACTIVE', shelf_life_days: 180, unit_ratio: 12, volume_m3: 0.014, status: 1, created_time: t, updated_time: t },
        { id: 2, sku_code: 'SKU-PASTEUR-950', sku_name: '巴氏鲜奶950ml', bar_code: '6901000000003', category_code: 'CAT-L3-UHT', lifecycle_status: 'ACTIVE', shelf_life_days: 7, unit_ratio: 1, volume_m3: 0.0015, status: 1, created_time: t, updated_time: t },
        { id: 3, sku_code: 'SKU-YOGURT-ORIGIN', sku_name: '原味酸奶200g*10', bar_code: '6901000000006', category_code: 'CAT-L2-LIQUID', lifecycle_status: 'INACTIVE', shelf_life_days: 21, unit_ratio: 10, volume_m3: 0.007, status: 1, created_time: t, updated_time: t }
    ];

    const reseller_relation = [
        { id: 1, sku_code: 'SKU-UHT-250-12', reseller_code: 'RS-SZ-LH', reseller_name: '苏州联华牧业贸易有限公司', region: '华东', channel_type: 'DIST', begin_date: '2026-01-01', end_date: '2026-12-31', price_grade: 'A', quota_cases: 2400, status: 1, created_time: t, updated_time: t },
        { id: 2, sku_code: 'SKU-PASTEUR-950', reseller_code: 'RS-DY-FLAG', reseller_name: '认养一头牛抖音旗舰店', region: '全国', channel_type: 'ONLINE', begin_date: '2026-01-01', end_date: '2027-12-31', price_grade: 'S', quota_cases: 5000, status: 1, created_time: t, updated_time: t }
    ];

    const rltn_warehouse_sku = [
        { id: 1, warehouse_code: 'WH-RDC-EAST', warehouse_name: '上海华东RDC', sku_code: 'SKU-UHT-250-12', sku_name: '常温纯牛奶250ml*12', begin_date: '2026-01-01', end_date: '2026-12-31', status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const rltn_org_reseller = [
        { id: 1, org_code: 'ORG-EAST-SZ', org_name: '苏皖业务单元', reseller_code: 'RS-SZ-LH', reseller_name: '苏州联华牧业贸易有限公司', lv1_channel_name: '线下渠道', begin_date: '2026-01-01', end_date: '2026-12-31', status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const rltn_product_sku = [
        { id: 1, product_code: 'PRD-MILK-UHT-A', product_name: '常温纯牛奶基品A', sku_code: 'SKU-UHT-250-12', sku_name: '常温纯牛奶250ml*12', convert_ratio: 1, begin_date: '2026-01-01', end_date: '2026-12-31', status: 1, remark: '', created_time: t, updated_time: t }
    ];

    const calendar = buildCalendarRows(2026);

    const products = sku.map((s, idx) => ({ id: idx + 1, sku_id: s.sku_code, sku_name: s.sku_name, category_code: s.category_code }));
    const orders = Array.from({ length: 40 }, (_, i) => ({
        id: i + 1,
        order_id: `ORD202604${String((i % 28) + 1).padStart(2, '0')}${String(i + 1).padStart(4, '0')}`,
        distributor_id: i % 2 === 0 ? 2 : 4,
        distributor_name: i % 2 === 0 ? '上海华东RDC' : '苏州渠道分拨仓',
        region: i % 2 === 0 ? '华东' : '全国',
        sku_id: i % 3 === 0 ? 'SKU-UHT-250-12' : 'SKU-PASTEUR-950',
        sku_name: i % 3 === 0 ? '常温纯牛奶250ml*12' : '巴氏鲜奶950ml',
        request_liters: 1500 + i * 25,
        source_pasture_id: 3,
        source_pasture_name: '安吉生态牧场前置仓',
        status: i % 4 === 0 ? 'Pending' : 'Matched',
        match_score: Number((0.78 + (i % 10) * 0.01).toFixed(2)),
        create_time: new Date(Date.now() - (i % 7) * 24 * 3600 * 1000).toISOString()
    }));

    const pasture_stats = [
        { id: 3, name: '安吉生态牧场', lat: 30.639, lng: 119.681, airQuality: '优', aqi: 29, yields: [28600, 27900, 27100], totalYield: 83600 }
    ];

    return {
        meta: {
            created_at: t,
            updated_at: t,
            storage_mode: 'local-json',
            helper_code: '952746',
            helper_code_updated_at: t,
            sms_codes: {}
        },
        system: { departments, jobtitles, pages, roles, role_pages: rolePages, role_jobs: roleJobs, accounts, account_roles: accountRoles, account_posts: accountPosts },
        master: { category, warehouse, factory, channel, reseller, org, sku, reseller_relation, rltn_warehouse_sku, rltn_org_reseller, rltn_product_sku, calendar },
        biz: { products, orders, pasture_stats }
    };
};

const upsertRowsByKey = (rows, incomingRows, keyField) => {
    const list = ensureArray(rows);
    incomingRows.forEach((item) => {
        if (!list.some((row) => String(row[keyField]) === String(item[keyField]))) {
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

    db.platform.dict_types = ensureArray(db.platform.dict_types);
    db.platform.dict_items = ensureArray(db.platform.dict_items);
    db.platform.operation_logs = ensureArray(db.platform.operation_logs);
    db.platform.import_tasks = ensureArray(db.platform.import_tasks);
    db.platform.export_tasks = ensureArray(db.platform.export_tasks);
    db.platform.notifications = ensureArray(db.platform.notifications);
    db.platform.task_runs = ensureArray(db.platform.task_runs);

    const beforeTypeCount = db.platform.dict_types.length;
    db.platform.dict_types = upsertRowsByKey(db.platform.dict_types, DEFAULT_DICT_TYPES, 'dict_type_code');
    if (db.platform.dict_types.length !== beforeTypeCount) changed = true;

    const beforeItemCount = db.platform.dict_items.length;
    DEFAULT_DICT_ITEMS.forEach((item) => {
        if (!db.platform.dict_items.some((row) => String(row.dict_type_code) === String(item.dict_type_code) && String(row.item_code) === String(item.item_code))) {
            db.platform.dict_items.push(cloneJson(item));
        }
    });
    if (db.platform.dict_items.length !== beforeItemCount) changed = true;

    db.system.pages = ensureArray(db.system.pages);
    const beforePageCount = db.system.pages.length;
    db.system.pages = upsertRowsByKey(
        db.system.pages,
        DEFAULT_PLATFORM_PAGES.map((page) => ({
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
        })),
        'path'
    );
    if (db.system.pages.length !== beforePageCount) changed = true;

    db.system.role_pages = ensureArray(db.system.role_pages);
    const superAdminRoleId = 1;
    DEFAULT_PLATFORM_PAGES.forEach((page) => {
        if (!db.system.role_pages.some((row) => Number(row.role_id) === superAdminRoleId && Number(row.page_id) === Number(page.id))) {
            db.system.role_pages.push({ role_id: superAdminRoleId, page_id: page.id });
            changed = true;
        }
    });

    db.system.roles = ensureArray(db.system.roles).map((role) => {
        const next = { ...role };
        if (!next.data_scope_type) {
            next.data_scope_type = 'ALL';
            changed = true;
        }
        if (!next.data_scope_config || typeof next.data_scope_config !== 'object') {
            next.data_scope_config = {};
            changed = true;
        }
        return next;
    });

    if (!db.meta.helper_code) {
        db.meta.helper_code = '952746';
        changed = true;
    }
    if (!db.meta.helper_code_updated_at) {
        db.meta.helper_code_updated_at = nowIso();
        changed = true;
    }
    if (!db.meta.sms_codes || typeof db.meta.sms_codes !== 'object') {
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
};

const loadDb = () => {
    if (cachedDb) return cachedDb;
    ensureDir();
    if (!fs.existsSync(DB_FILE)) {
        cachedDb = createSeedDb();
        ensurePlatformStructures(cachedDb);
        persist(cachedDb);
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
    return cachedDb;
};

const saveDb = () => {
    if (!cachedDb) return;
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
    return Math.max(...rows.map(r => Number(r.id) || 0)) + 1;
};

module.exports = { DB_FILE, nowIso, readDb, updateDb, nextId };
