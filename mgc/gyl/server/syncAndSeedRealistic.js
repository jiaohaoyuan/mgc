// 这个文件是什么作用显示的是什么：这是数据库初始化和填充脚本。显示/实现的是：清空或同步表结构，并向数据库中插入一套真实的初始测试数据。
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mysqlPool = require('./db/mysql');
const fs = require('fs');

/**
 * 认养一头牛 · 供应链全链路“业务真实型”数据生成器
 * 目标：生成符合国内五大区域布局、多品类物资、多层级权限的深度模拟数据
 */

async function init() {
    console.log('🚀 开始生成深度模拟数据 (五大区域 + 多品类 + 复合权限)...');

    // 1. 清理表 (级联清理)
    const tables = [
        't_ryytn_account_role', 't_ryytn_role_page', 't_ryytn_account', 
        't_ryytn_role', 't_ryytn_page', 't_ryytn_moudel',
        't_ryytn_oa_department', 't_ryytn_oa_jobtitle',
        't_ryytn_master_sku', 't_ryytn_master_warehouse', 't_ryytn_order_main'
    ];
    for (const table of tables) {
        try { await mysqlPool.query(`DELETE FROM ${table}`); } catch (e) {}
    }

    // 2. 核心模块与页面定义 (权限树)
    const pages = [
        [1, '系统概览', 'DASH', 'sys:dashboard', 0, '0', 'page', '/dashboard', 'Monitor', 1, 1],
        [10, '组织架构', 'ORG', null, 0, '0', 'menu', null, 'Setting', 1, 2],
        [11, '部门管理', 'DEPT', 'sys:dept:view', 10, '10', 'page', '/department', 'OfficeBuilding', 1, 3],
        [12, '用户管理', 'USER', 'sys:user:view', 10, '10', 'page', '/user', 'User', 1, 4],
        [13, '角色管理', 'ROLE', 'sys:role:view', 10, '10', 'page', '/role', 'Key', 1, 5],
        [20, '供应链协同', 'BIZ', null, 0, '0', 'menu', null, 'List', 1, 6],
        [21, '牧场概览', 'PASTURE', 'biz:pasture:view', 20, '20', 'page', '/pasture', 'Van', 1, 7],
        [22, '三级渠道管理', 'CHANNEL', 'biz:channel:view', 20, '20', 'page', '/channels', 'DataAnalysis', 1, 8],
        [23, '智能订购中心', 'ORDER', 'biz:order:view', 20, '20', 'page', '/intelligent', 'Cpu', 1, 9],
        [24, '品类物资维护', 'SKU', 'biz:sku:view', 20, '20', 'page', '/categories', 'SetUp', 1, 10],
    ];
    await mysqlPool.query("INSERT INTO t_ryytn_moudel (id, name, type, path, status) VALUES (1, '供应链决策平台', 1, '/intelligent', 1)");
    await mysqlPool.query('INSERT INTO t_ryytn_page (id, name, alias, permission, parent_id, parent_ids, type, path, icon, moudel_id, sort_no) VALUES ?', [pages]);

    // 3. 角色与岗位关联逻辑 (现实建模 - 扩展至 9 个角色)
    console.log('🔑 注入精细化业务角色 (9个) 及其权限矩阵...');
    const roles = [
        [1, '系统特权管理员', 1, 1, 1], 
        [2, '供应链数字化专家', 1, 2, 2],
        [3, '物流运营调度主管', 1, 3, 2],
        [4, '全渠道分销中台', 1, 4, 2],
        [5, '质量安全总监', 1, 5, 2],
        [6, '采购中心经理', 1, 6, 2],
        [7, '区域销售主管', 1, 7, 2],
        [8, '需求计划员', 1, 8, 2],
        [9, '系统审计员', 1, 9, 2],
    ];
    await mysqlPool.query('INSERT INTO t_ryytn_role (id, name, status, sort_no, data_type) VALUES ?', [roles]);

    // 角色权限绑定 (Role-Page) - 精确映射
    const rolePages = [
        // 1. 系统管理员 (全)
        [1, 1], [1, 10], [1, 11], [1, 12], [1, 13], [1, 20], [1, 21], [1, 22], [1, 23], [1, 24], 
        // 2. 数字化专家 (架构/研发)
        [2, 1], [2, 10], [2, 13], [2, 20], [2, 23], [2, 24], 
        // 3. 物流主管 (牧场/调度)
        [3, 1], [3, 20], [3, 21], [3, 23], 
        // 4. 分销中台 (渠道/履约)
        [4, 1], [4, 20], [4, 22], [4, 23], 
        // 5. 质量总监 (质检)
        [5, 1], [5, 20], [5, 21], [5, 23], [5, 24], 
        // 6. 采购经理 (订购/品类)
        [6, 1], [6, 20], [6, 23], [6, 24], 
        // 7. 区域销售 (渠道)
        [7, 1], [7, 20], [7, 22], 
        // 8. 需求计划 (订购)
        [8, 1], [8, 20], [8, 23], 
        // 9. 系统审计员 (组织管理)
        [9, 1], [9, 10], [9, 11], [9, 12], [9, 13], 
    ];
    await mysqlPool.query('INSERT INTO t_ryytn_role_page (role_id, page_id) VALUES ?', [rolePages]);

    // 🏆 一角色多岗位关联 (Many-to-Many - 扩展映射)
    const roleJobs = [
        [2, 'J311'], [2, 'J111'], [2, 'J321'], 
        [3, 'J122'], [3, 'J123'], 
        [4, 'J211'], [4, 'J221'], [4, 'J231'], 
        [5, 'J131'], [5, 'J132'], 
        [6, 'J121'], [6, 'J112'], 
        [7, 'J211'], [7, 'J212'], 
        [8, 'J111'], [8, 'J112'], 
        [9, 'J301'], // 审计员关联 CTO 权限
    ];
    await mysqlPool.query('INSERT INTO t_ryytn_role_jobtitle (role_id, job_id) VALUES ?', [roleJobs]);

    // 2. 组织架构 (t_ryytn_oa_department)
    // columns: id, department_mark, department_name, department_code, sub_company_id, sup_dep_id, sup_dep_ids, level, sort_no, leader, created_time
    console.log('🏛️ 构建大型企业级组织架构树 (含负责人)...');
    const depts = [
        ['100', 'CORP', '认养一头牛集团总部', 'HQ-001', '1', '0', '0', 1, 1, '焦浩元', new Date()],
        // 供应链大中心
        ['110', 'SCM-CTR', '供应链管理中心', 'SCM-000', '1', '100', '100', 2, 10, '林万才', new Date()],
        ['111', 'PLAN', '供应链规划部', 'SCM-P01', '1', '110', '100,110', 3, 11, '陈建国', new Date()],
        ['112', 'PURCH', '采购管理部', 'SCM-P02', '1', '110', '100,110', 3, 12, '采购经理', new Date()],
        ['113', 'LOGS', '物流仓储中心', 'SCM-L03', '1', '110', '100,110', 3, 13, '张海军', new Date()],
        ['114', 'QC', '质量安全监控部', 'SCM-Q04', '1', '110', '100,110', 3, 14, '质检经理', new Date()],
        // 销售分销中心
        ['120', 'SALES-CTR', '全国销售分销中心', 'MKT-000', '1', '100', '100', 2, 20, '李强', new Date()],
        ['121', 'AREA', '大区渠道发展部', 'MKT-A01', '1', '120', '100,120', 3, 21, '王亚琴', new Date()],
        ['122', 'OM', '订单与履约部', 'MKT-O02', '1', '120', '100,120', 3, 22, '订单部主管', new Date()],
        ['123', 'EC', '新零售电商部', 'MKT-E03', '1', '120', '100,120', 3, 23, '电商组长', new Date()],
        // 数字化中心
        ['130', 'DIGITAL', '数字化技术中心', 'TEC-000', '1', '100', '100', 2, 30, '焦浩元', new Date()],
        ['131', 'IT-DEV', '系统研发部', 'TEC-D01', '1', '130', '100,130', 3, 31, '研发组长', new Date()],
        ['132', 'DATA', '大数据分析处', 'TEC-D02', '1', '130', '100,130', 3, 32, '数据专家', new Date()],
    ];
    await mysqlPool.query('INSERT INTO t_ryytn_oa_department (id, department_mark, department_name, department_code, sub_company_id, sup_dep_id, sup_dep_ids, level, sort_no, leader, created_time) VALUES ?', [depts]);

    // 3. 岗位设计 (t_ryytn_oa_jobtitle)
    // columns: id, job_title_mark, job_title_name, job_department_id, created_time
    console.log('💼 细化三级岗位架构...');
    const jobs = [
        // 供应链中心岗位
        ['J101', 'SCM-DIR', '供应链中心总监', '110', new Date()],
        ['J111', 'PN-MGR', '产销平衡高级经理', '111', new Date()],
        ['J112', 'PL-SPEC', '需求计划分析员', '111', new Date()],
        ['J121', 'PU-SPEC', '全球直采采购专家', '112', new Date()],
        ['J122', 'WH-MGR', '仓储运营部长', '113', new Date()],
        ['J123', 'DISP-SPEC', '智能调度专员', '113', new Date()],
        ['J131', 'QC-MGR', '食品安全质量经理', '114', new Date()],
        ['J132', 'QC-OP', '质量检测技术员', '114', new Date()],
        // 销售分销中心岗位
        ['J201', 'SAL-DIR', '销售部总经理', '120', new Date()],
        ['J211', 'CH-MGR', '全国渠道开发经理', '121', new Date()],
        ['J212', 'AR-MGR', '大区客户成功经理', '121', new Date()],
        ['J221', 'OM-SPEC', '订单履约专员', '122', new Date()],
        ['J231', 'EC-OP', '电商平台直营组长', '123', new Date()],
        // 数字化中心岗位
        ['J301', 'CTO', '首席技术官(CTO)', '130', new Date()],
        ['J311', 'ARCH', '系统平台架构师', '131', new Date()],
        ['J312', 'BE-DEV', 'Golang/Java 后端专家', '131', new Date()],
        ['J313', 'FE-DEV', 'Vue/React 前端工程师', '131', new Date()],
        ['J321', 'DT-AN', '供应链算法模型师', '132', new Date()],
        ['J322', 'DBA', 'MySQL/Redis 运维专家', '132', new Date()],
    ];
    await mysqlPool.query('INSERT INTO t_ryytn_oa_jobtitle (id, job_title_mark, job_title_name, job_department_id, created_time) VALUES ?', [jobs]);

    // 5. 生成真实风格的用户
    const managers = [
        { login: 'admin', name: '焦浩元', role: 1, job: 'J301', dept: '130', phone: '13800000000' }, // CTO
        { login: 'linwc', name: '林万才', role: 2, job: 'J101', dept: '110', phone: '13811110001' }, // 供应链中心总监
        { login: 'chenjg', name: '陈建国', role: 2, job: 'J111', dept: '111', phone: '13811110002' }, // 产销平衡高级经理
        { login: 'liqiang', name: '李强', role: 3, job: 'J201', dept: '120', phone: '13822220001' }, // 销售部总经理
        { login: 'wangyq', name: '王亚琴', role: 3, job: 'J211', dept: '121', phone: '13822220002' }, // 全国渠道开发经理
        { login: 'zhanghy', name: '张海军', role: 4, job: 'J123', dept: '113', phone: '13833330001' }, // 智能调度专员
    ];
    const accounts = [];
    const userRoleLinks = [];
    const credentials = [];

    managers.forEach((m, i) => {
        const uid = 1000 + i;
        accounts.push([uid, m.name, m.name, m.login, '123456', 1, m.dept, m.phone, new Date()]);
        userRoleLinks.push([uid, m.role]);
        credentials.push({ user: m.login, pass: '123456', name: m.name, role: roles.find(r => r[0] === m.role)[1], job: jobs.find(j => j[0] === m.job)[2], dept: depts.find(d => d[0] === m.dept)[2] });
    });
    // 补充普通员工
    for (let i = 1; i <= 20; i++) {
        const uid = 2000 + i;
        const login = `staff${String(i).padStart(3, '0')}`;
        const pwd = `pwd${Math.floor(Math.random() * 900) + 100}`;
        const phone = `139${String(20000000 + i).padStart(8, '0')}`;
        accounts.push([uid, `员工${i}`, `昵称${i}`, login, pwd, 1, '120', phone, new Date()]);
        userRoleLinks.push([uid, 4]); // 调度员
        credentials.push({ user: login, pass: pwd, name: `员工${i}`, role: '物流调度员', job: '物流专员', dept: '全国销售分销中心' });
    }
    await mysqlPool.query('INSERT INTO t_ryytn_account (id, name, nick_name, login_id, password, status, department_id, mobile, created_time) VALUES ?', [accounts]);
    await mysqlPool.query('INSERT INTO t_ryytn_account_role (account_id, role_id) VALUES ?', [userRoleLinks]);

    // 6. 三级渠道数据 (五大区域)
    console.log('🌐 规划五大区域三级分销网络...');
    const regions = [
        { name: '华东', center: '上海', l2: ['苏州', '杭州', '南京', '宁波'] },
        { name: '华南', center: '广州', l2: ['深圳', '东莞', '佛山', '海口'] },
        { name: '华北', center: '天津', l2: ['济南', '青岛', '石家庄', '太原'] },
  { name: '华中', center: '武汉', l2: ['长沙', '郑州', '南昌', '合肥'] },
        { name: '华西', center: '成都', l2: ['重庆', '西安', '昆明', '贵阳'] },
    ];
    
    const whNodes = [];
    // L1: HQ
    whNodes.push(['W-HQ', 'RY-HQ-00', '认养一头牛全国数字化总部 (北京)', '林万才', 1, 39.9, 116.4]);

    regions.forEach((reg, ri) => {
        // L2: 区域 RDC
        const l2Id = `W-RDC-${ri}`;
        whNodes.push([l2Id, `RDC-${ri}`, `${reg.name}大区配送中心 (${reg.center})`, '区域经理', 2, (30 + Math.random() * 5).toFixed(4), (110 + Math.random() * 10).toFixed(4)]);
        
        // L3: 二级/三级经销商与门店
        reg.l2.forEach((city, ci) => {
            const l3Id = `W-L3-${ri}-${ci}`;
            whNodes.push([l3Id, `DIST-${city}`, `${city}城市级总代理`, '分销伙伴', 4, (30 + Math.random() * 5).toFixed(4), (110 + Math.random() * 10).toFixed(4)]);
            
            // 门店 (网点等级 L3)
            for (let k = 1; k <= 3; k++) {
                whNodes.push([`W-ST-${ri}-${ci}-${k}`, `STORE-${city}-${k}`, `${city}认养一头牛生活馆-0${k}号店`, '店长', 4, (30 + Math.random() * 5).toFixed(4), (110 + Math.random() * 10).toFixed(4)]);
            }
        });
    });
    // 牧场
    const pastures = ['河北衡水', '黑龙江齐齐哈尔', '内蒙古乌兰察布', '新疆天山', '甘肃张掖'];
    pastures.forEach((p, pi) => {
        whNodes.push([`PAS-0${pi}`, `PAS-${pi}`, `${p}智慧万头牧场`, '场长', 3, (35 + Math.random() * 10).toFixed(4), (85 + Math.random() * 30).toFixed(4)]);
    });

    await mysqlPool.query('INSERT INTO t_ryytn_master_warehouse (id, warehouse_code, warehouse_name, contact_person, warehouse_type, latitude, longitude) VALUES ?', [whNodes]);

    // 7. 品类维护 (多样化)
    console.log('🍶 拓展多样化产品品类...');
    const catGroups = [
        { name: '纯牛奶系列', items: ['全脂纯牛奶', '娟姗鲜牛乳', '脱脂牛奶', '高钙纯牛奶'] },
        { name: '酸奶系列', items: ['风味发酵乳', '希腊风味酸奶', '减糖原生酸奶', '白桃风味酸奶'] },
        { name: '奶粉系列', items: ['高钙成人奶粉', '青少年配方奶粉', '中老年益生菌奶粉'] },
        { name: '联名跨界', items: ['认养一头牛x小黄人燕麦奶', '生牛乳冰淇淋'] },
    ];
    const skus = [];
    let skuId = 1;
    catGroups.forEach(cg => {
        cg.items.forEach(item => {
            skus.push([skuId++, `SKU-${skuId}`, `${cg.name}-${item}`, new Date(), skuId > 5 ? 'Normal' : 'LowTemp', (skuId > 5 ? 180 : 15)]);
        });
    });
    await mysqlPool.query('INSERT INTO t_ryytn_master_sku (id, product_code, product_name, create_time, material_type, shelf_life) VALUES ?', [skus]);

    // 8. 订单生成 (200条 真实随机)
    const orders = [];
    for (let i = 1; i <= 200; i++) {
        const randIdx = Math.floor(Math.random() * (whNodes.length - 1)) + 1;
        const targetWhId = whNodes[randIdx][0];
        const status = Math.random() > 0.3 ? 'Pending' : 'Matched';
        orders.push([
            `ORD-${2026}${String(i).padStart(4, '0')}`,
            targetWhId,
            skus[Math.floor(Math.random() * skus.length)][1],
            Math.floor(Math.random() * 1000 + 50),
            status,
            Date.now()
        ]);
    }
    await mysqlPool.query('INSERT INTO t_ryytn_order_main (order_id, distributor_id, sku_id, request_liters, status, create_time) VALUES ?', [orders]);

    // 输出凭证
    let doc = "# 认养一头牛 · 供应链系统 生产级模拟账号文档\n\n";
    doc += "本数据已模拟五个大区 (华东/华南/华北/华中/华西) 的完整链路，包含多级审核权限。\n\n";
    doc += "| 姓名 | 用户名 | 密码 | 角色 | 核心职位 | 所属部门 |\n";
    doc += "| :--- | :--- | :--- | :--- | :--- | :--- |\n";
    credentials.forEach(c => {
        doc += `| ${c.name} | ${c.user} | \`${c.pass}\` | ${c.role} | ${c.job} | ${c.dept} |\n`;
    });
    fs.writeFileSync(path.join(process.cwd(), 'User_Credentials.md'), doc);

    // 🏆 清理 Redis 缓存
    try {
        const redisClient = require('./db/redis');
        await redisClient.del('cache:accounts');
        console.log('🧹 Redis 缓存 (cache:accounts) 已清理');
    } catch (e) {
        console.warn('⚠️ 清理 Redis 失败:', e.message);
    }

    console.log('✅ 深度模拟数据注入成功！请查看根目录 User_Credentials.md 获取新账号。');
    process.exit(0);
}

init().catch(err => {
    console.error('❌ 注入失败:', err);
    process.exit(1);
});
