// 这个文件是什么作用显示的是什么：这是后端服务的主入口文件。显示/实现的是：启动Express服务器，连接数据库，并定义所有后端API接口路由。
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const mysqlPool = require('./db/mysql');
const redisClient = require('./db/redis');

const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'scmp-access-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(i => i.trim()).filter(Boolean);
const API_LIMIT_WINDOW_MS = Number(process.env.API_LIMIT_WINDOW_MS || 60 * 1000);
const API_LIMIT_MAX = Number(process.env.API_LIMIT_MAX || 240);
const AUTH_LIMIT_MAX = Number(process.env.AUTH_LIMIT_MAX || 20);

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    return CORS_ORIGINS.includes(origin);
};

const authLimiter = rateLimit({
    windowMs: API_LIMIT_WINDOW_MS,
    max: AUTH_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 429, msg: '请求过于频繁，请稍后再试' }
});

const apiLimiter = rateLimit({
    windowMs: API_LIMIT_WINDOW_MS,
    max: API_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 429, msg: '请求过于频繁，请稍后再试' }
});

const sanitizeUser = (user) => ({
    id: user.id,
    username: user.login_id,
    nickname: user.nick_name,
    role: user.login_id === 'jiaohaoyuan' ? '超级管理员' : '普通用户'
});

const createTraceId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const writeAuditLog = async ({ req, action, resource, targetId = null, detail = null }) => {
    const actorId = req.user?.id || null;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    try {
        await mysqlPool.query(
            'INSERT INTO t_ryytn_audit_log (id, actor_id, action, resource, target_id, detail, trace_id, ip, user_agent, created_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [Date.now() + Math.floor(Math.random() * 1000), actorId, action, resource, targetId, detail ? JSON.stringify(detail) : null, req.traceId || null, String(ip).slice(0, 100), String(ua).slice(0, 255)]
        );
    } catch (err) {
        console.warn('Audit log write failed:', err.message);
    }
};

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const authRequired = asyncHandler(async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
        return res.status(401).json({ code: 401, msg: '未登录或登录已过期' });
    }
    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch {
        return res.status(401).json({ code: 401, msg: '登录状态无效，请重新登录' });
    }
    const [users] = await mysqlPool.query('SELECT id, login_id, nick_name, status FROM t_ryytn_account WHERE id = ?', [payload.id]);
    if (users.length === 0) {
        return res.status(401).json({ code: 401, msg: '用户不存在' });
    }
    if (users[0].status !== 1) {
        return res.status(403).json({ code: 403, msg: '账号已停用' });
    }
    req.user = sanitizeUser(users[0]);
    next();
});

const superAdminRequired = (req, res, next) => {
    if (!req.user || req.user.role !== '超级管理员') {
        return res.status(403).json({ code: 403, msg: '无权限访问' });
    }
    next();
};

app.use((req, res, next) => {
    req.traceId = createTraceId();
    res.setHeader('x-trace-id', req.traceId);
    next();
});
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiLimiter);

// -------------------------------------------------------------
// 测试路由 - 检查服务器状态
// -------------------------------------------------------------
app.get('/api/ping', (req, res) => {
    res.json({ code: 200, msg: 'pong', status: 'Backend is running' });
});

// -------------------------------------------------------------
// 具体的业务接口示范 (根据你提供的供应链 SQL 脚本)
// -------------------------------------------------------------

// 1. 获取所有仓库的数据 (表: t_ryytn_master_warehouse) -> 不使用缓存
app.get('/api/warehouses', authRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM t_ryytn_master_warehouse');
        res.json({
            code: 200,
            msg: '获取成功',
            source: 'mysql',
            data: rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 2. 获取账号列表 (表: t_ryytn_account) -> 关联角色和岗位信息
app.get('/api/accounts', authRequired, async (req, res) => {
    try {
        // 查询账号表，同时LEFT JOIN关联角色和岗位
        const [rows] = await mysqlPool.query(`
            SELECT 
                a.*,
                GROUP_CONCAT(DISTINCT ar.role_id) as role_ids,
                GROUP_CONCAT(DISTINCT aj.job_id) as post_ids
            FROM t_ryytn_account a
            LEFT JOIN t_ryytn_account_role ar ON a.id = ar.account_id
            LEFT JOIN t_ryytn_account_jobtitle aj ON a.id = aj.account_id
            GROUP BY a.id
        `);

        res.json({
            code: 200,
            msg: '获取成功',
            source: 'mysql',
            data: rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 3. 获取所有产品主数据，带简单条件查询 (表: t_ryytn_master_sku)
app.get('/api/products', authRequired, async (req, res) => {
    try {
        const keyword = req.query.keyword || ''; // 获取URL参数，如 /api/products?keyword=牛奶
        let sql = 'SELECT * FROM t_ryytn_master_sku';
        let params = [];
        
        // 如果有搜索词，动态拼接 WHERE 条件
        if (keyword) {
            sql += ' WHERE product_name LIKE ?';
            params.push(`%${keyword}%`);
        }

        const [rows] = await mysqlPool.query(sql, params);
        res.json({
            code: 200,
            msg: '获取成功',
            source: 'mysql',
            data: rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 4. 获取牧场库存情况
app.get('/api/inventory', authRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM t_ryytn_inventory');
        res.json({
            code: 200,
            msg: '获取成功',
            source: 'mysql',
            data: rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 5. 获取订单列表 (带分页)
app.get('/api/orders', authRequired, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = Math.min(parseInt(req.query.pageSize || req.query.limit) || 20, 100);
        const offset = (page - 1) * pageSize;

        const countQuery = 'SELECT COUNT(*) as total FROM t_ryytn_order_main';
        const dataQuery = 'SELECT * FROM t_ryytn_order_main ORDER BY create_time DESC LIMIT ? OFFSET ?';

        const [[{ total }]] = await mysqlPool.query(countQuery);
        const [rows] = await mysqlPool.query(dataQuery, [pageSize, offset]);

        res.json({
            code: 200,
            msg: '获取成功',
            source: 'mysql',
            data: {
                total,
                page,
                pageSize,
                limit: pageSize,
                list: rows
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 6. 用户注册
app.post('/api/register', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { username, password, nickname, phone, email, deptId, deptName, roleIds, postIds, status } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ code: 400, msg: '账号和密码不能为空' });
        }

        // 检查用户是否已存在
        const [existing] = await mysqlPool.query('SELECT id FROM t_ryytn_account WHERE login_id = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ code: 400, msg: '账号已存在' });
        }

        const id = Date.now();
        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            const hashedPassword = await bcrypt.hash(password, 10);
            await conn.query(
                'INSERT INTO t_ryytn_account (id, login_id, password, nick_name, name, status, department_id, mobile, email, created_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                [id, username, hashedPassword, nickname || ('用户' + username.slice(-4)), username, status !== undefined ? status : 1, deptId || '0', phone || '', email || '']
            );
            if (roleIds && roleIds.length > 0) {
                for (const roleId of roleIds) {
                    await conn.query('INSERT INTO t_ryytn_account_role (account_id, role_id) VALUES (?, ?)', [id, roleId]);
                }
            }
            if (postIds && postIds.length > 0) {
                for (const postId of postIds) {
                    await conn.query('INSERT INTO t_ryytn_account_jobtitle (account_id, job_id) VALUES (?, ?)', [id, postId]);
                }
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }

        try {
            // 清除账号缓存
            await redisClient.del('cache:accounts');
        } catch (redisErr) {
            console.warn('Failed to clear redis cache:', redisErr.message);
        }
        await writeAuditLog({ req, action: 'CREATE', resource: 'account', targetId: id, detail: { username, deptId, roleIds, postIds } });

        res.json({ code: 200, msg: '注册成功', data: { id, username } });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 6.5 发送短信验证码 (国阳云接口)
app.post('/api/sms/send-code', authLimiter, async (req, res) => {
    try {
        const { username, mobile } = req.body;
        if (!username || !mobile) {
            return res.status(400).json({ code: 400, msg: '用户名和手机号不能为空' });
        }

        // 1. 查询并比对手机号
        const [users] = await mysqlPool.query('SELECT mobile FROM t_ryytn_account WHERE login_id = ?', [username]);
        if (users.length === 0) return res.status(400).json({ code: 400, msg: '用户不存在' });
        
        const dbMobile = users[0].mobile;
        if (!dbMobile) {
            return res.status(400).json({ code: 400, msg: '该账号未绑定手机号，无法通过短信找回' });
        }

        if (dbMobile !== mobile) {
            return res.status(400).json({ code: 400, msg: '注册手机号填写错误' });
        }

        // 2. 生成 6 位验证码
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 3. 调用国阳云接口
        const host = "https://gyytz.market.alicloudapi.com";
        const path = "/sms/smsSend";
        const appcode = process.env.SMS_APP_CODE;

        if (!appcode || appcode === '你的AppCode') {
            // 如果没配置 AppCode，在开发环境模拟发送成功并打印
            console.log(`[SMS MOCK] To: ${mobile}, Code: ${code} (AppCode not configured)`);
        } else {
            try {
                const smsRes = await axios.post(`${host}${path}`, null, {
                    headers: { 'Authorization': `APPCODE ${appcode}` },
                    params: {
                        mobile: mobile,
                        param: `**code**:${code},**minute**:5`,
                        smsSignId: "2e65b1bb3d054466b82f0c9d125465e2",
                        templateId: "908e94ccf08b4476ba6c876d13f084ad"
                    }
                });
                console.log('[SMS API RESPONSE]:', JSON.stringify(smsRes.data));
                if (String(smsRes.data.code) !== '0') {
                    return res.status(500).json({ code: 500, msg: '短信发送失败: ' + (smsRes.data.msg || '接口错误') });
                }
            } catch (smsErr) {
                console.error('SMS API Error:', smsErr.message);
                return res.status(500).json({ code: 500, msg: '短信服务连接异常' });
            }
        }

        // 4. 存入 Redis (过期时间 5 分钟)
        await redisClient.set(`sms:code:${username}`, code, { EX: 300 });

        res.json({ code: 200, msg: '验证码已发送，请注意查收' });
    } catch (error) {
        console.error('SMS send error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 6.6 验证短信验证码
app.post('/api/sms/verify-code', authLimiter, async (req, res) => {
    try {
        const { username, smsCode } = req.body;
        if (!username || !smsCode) {
            return res.status(400).json({ code: 400, msg: '用户名和验证码不能为空' });
        }

        const savedSmsCode = await redisClient.get(`sms:code:${username}`);
        if (!savedSmsCode) {
            return res.status(400).json({ code: 400, msg: '短信验证码已过期或未发送' });
        }
        if (savedSmsCode !== smsCode) {
            return res.status(400).json({ code: 400, msg: '短信验证码错误' });
        }

        res.json({ code: 200, msg: '验证码正确' });
    } catch (error) {
        console.error('SMS verify error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 7. 用户登录
app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 从数据库统实验证，无论是不是管理员
        const [users] = await mysqlPool.query('SELECT * FROM t_ryytn_account WHERE login_id = ?', [username]);
        
        if (users.length === 0) {
            return res.status(400).json({ code: 400, msg: '账号不存在或密码错误！' });
        }
        
        const user = users[0];
        
        const passwordOk = await bcrypt.compare(password, user.password || '');
        if (!passwordOk) {
            return res.status(400).json({ code: 400, msg: '账号不存在或密码错误！' });
        }
        
        if (user.status !== 1) {
            return res.status(400).json({ code: 400, msg: '该账号已被停用' });
        }

        res.json({ 
            code: 200, 
            msg: '登录成功',
            data: {
                ...sanitizeUser(user),
                token: jwt.sign({ id: user.id, username: user.login_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
            },
            traceId: req.traceId
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 8. 获取牧场概览带环境监测与产量
app.get('/api/pasture-stats', authRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM t_ryytn_master_warehouse WHERE warehouse_type = 3');
        const statsData = rows.map(p => {
            const aqi = Math.floor(Math.random() * 40) + 15; // 15-55 AQI (优/良)
            const yieldDay1 = Math.floor(Math.random() * 10000) + 5000;
            const yieldDay2 = Math.floor(Math.random() * 10000) + 5000;
            const yieldDay3 = Math.floor(Math.random() * 10000) + 5000;
            return {
                id: p.id,
                name: p.warehouse_name,
                lat: p.latitude,
                lng: p.longitude,
                aqi: aqi,
                airQuality: aqi < 35 ? '优 🍃' : '良 ☁️',
                yields: [yieldDay3, yieldDay2, yieldDay1], // 最近三天
                totalYield: yieldDay1 + yieldDay2 + yieldDay3
            };
        });
        res.json({ code: 200, msg: '获取成功', data: statsData });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 9. 订单区域分析接口
app.get('/api/order-analysis', authRequired, async (req, res) => {
    try {
        // 总出货量和订单数
        const [[totals]] = await mysqlPool.query(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(request_liters), 0) as total_liters
            FROM t_ryytn_order_main
        `);

        // 各大区需求量 - 根据经销商关联id匹配地址中的城市关键词分区
        // 将仓库表中的网点进行地理分区统计
        const [distRows] = await mysqlPool.query(`
            SELECT 
                o.distributor_id,
                o.request_liters,
                w.warehouse_name
            FROM t_ryytn_order_main o
            LEFT JOIN t_ryytn_master_warehouse w ON o.distributor_id = w.id
        `);

        // 包含这些关键词的城市属于各大区
        const regionKeywords = {
            '华东': ['上海','江苏','浙江','安徽','福建','山东','江西','苏州','杭州','南京','无锡','南昌'],
            '华南': ['广东','广西','海南','广州','深圳','东莞','佛山','珠海','幘州'],
            '华北': ['北京','天津','河北','山西','内蒙古','石家庄','保定','唐山'],
            '华中': ['湖北','湖南','河南','武汉','长沙','郑州','开封','襄阳']
        };

        const regionStats = { '华东': 0, '华南': 0, '华北': 0, '华中': 0 };

        for (const row of distRows) {
            const name = row.warehouse_name || '';
            let matched = false;
            for (const [region, keywords] of Object.entries(regionKeywords)) {
                if (keywords.some(k => name.includes(k))) {
                    regionStats[region] += parseFloat(row.request_liters) || 0;
                    matched = true;
                    break;
                }
            }
        }

        // 近 7 天日均出货量趋势 (用create_time进行模拟)
        const sevenDayTrend = [];
        for (let i = 6; i >= 0; i--) {
            const dayLiters = Math.floor(Math.random() * 50000) + 60000; // 模拟每日
            const date = new Date();
            date.setDate(date.getDate() - i);
            sevenDayTrend.push({
                date: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
                liters: dayLiters
            });
        }

        res.json({
            code: 200,
            msg: '获取成功',
            data: {
                totalOrders: totals.total_orders,
                totalLiters: Math.round(totals.total_liters),
                regionStats,
                sevenDayTrend
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 10. 获取部门列表 (t_ryytn_oa_department)
app.get('/api/departments', authRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM t_ryytn_oa_department ORDER BY sort_no ASC');
        res.json({ code: 200, msg: '获取成功', data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 11. 获取角色列表 (t_ryytn_role)
app.get('/api/roles', authRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query(`
            SELECT 
                r.*, 
                GROUP_CONCAT(DISTINCT rj.job_id) as post_ids,
                GROUP_CONCAT(DISTINCT rp.page_id) as perm_ids
            FROM t_ryytn_role r
            LEFT JOIN t_ryytn_role_jobtitle rj ON r.id = rj.role_id
            LEFT JOIN t_ryytn_role_page rp ON r.id = rp.role_id
            GROUP BY r.id
            ORDER BY r.sort_no ASC
        `);
        const data = rows.map(r => ({
            ...r,
            postIds: r.post_ids ? r.post_ids.split(',') : [],
            permissionIds: r.perm_ids ? r.perm_ids.split(',').map(Number) : []
        }));
        res.json({ code: 200, msg: '获取成功', data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 12. 获取岗位列表 (t_ryytn_oa_jobtitle)
app.get('/api/jobtitles', authRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM t_ryytn_oa_jobtitle ORDER BY id ASC');
        res.json({ code: 200, msg: '获取成功', data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 13. 获取权限/页面树 (t_ryytn_page)
app.get('/api/permissions', authRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query('SELECT * FROM t_ryytn_page ORDER BY id ASC');
        res.json({ code: 200, msg: '获取成功', data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 新增部门
app.post('/api/departments', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id, parentId, label, type, sort, leader } = req.body;
        const levelMap = { 'center': 1, 'department': 2, 'team': 3 };
        const level = levelMap[type] || 3;
        await mysqlPool.query(
            'INSERT INTO t_ryytn_oa_department (id, department_name, sup_dep_id, level, sort_no, leader, created_time) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [id, label, parentId || '0', level, sort || 0, leader || '']
        );
        res.json({ code: 200, msg: '新增成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 更新部门
app.put('/api/departments/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        const { label, type, sort, leader } = req.body;
        const levelMap = { 'center': 1, 'department': 2, 'team': 3 };
        const level = levelMap[type] || 3;
        await mysqlPool.query(
            'UPDATE t_ryytn_oa_department SET department_name = ?, level = ?, sort_no = ?, leader = ? WHERE id = ?',
            [label, level, sort || 0, leader || '', id]
        );
        res.json({ code: 200, msg: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 删除部门
app.delete('/api/departments/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        // 检查是否有子部门
        const [children] = await mysqlPool.query('SELECT id FROM t_ryytn_oa_department WHERE sup_dep_id = ?', [id]);
        if (children.length > 0) {
            return res.status(400).json({ code: 400, msg: '该部门下存在子部门，请先删除子部门' });
        }
        // 检查是否有在该部门的用户
        const [users] = await mysqlPool.query('SELECT id FROM t_ryytn_account WHERE department_id = ?', [id]);
        if (users.length > 0) {
            return res.status(400).json({ code: 400, msg: '该部门下存在关联用户，无法删除' });
        }
        await mysqlPool.query('DELETE FROM t_ryytn_oa_department WHERE id = ?', [id]);
        res.json({ code: 200, msg: '删除成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});


// 新增角色
app.post('/api/roles', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id, name, code, sort, status, remark, permissionIds, postIds } = req.body;
        await mysqlPool.query(
            'INSERT INTO t_ryytn_role (id, name, sort_no, status, description, created_time) VALUES (?, ?, ?, ?, ?, NOW())',
            [id, name, sort || 0, status !== undefined ? status : 1, remark || '']
        );
        if (permissionIds && permissionIds.length > 0) {
            for (const pid of permissionIds) {
                await mysqlPool.query('INSERT INTO t_ryytn_role_page (role_id, page_id) VALUES (?, ?)', [id, pid]);
            }
        }
        if (postIds && postIds.length > 0) {
            for (const pid of postIds) {
                await mysqlPool.query('INSERT INTO t_ryytn_role_jobtitle (role_id, job_id) VALUES (?, ?)', [id, pid]);
            }
        }
        res.json({ code: 200, msg: '新增成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 更新角色
app.put('/api/roles/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, sort, status, remark, permissionIds, postIds } = req.body;
        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'UPDATE t_ryytn_role SET name = ?, sort_no = ?, status = ?, description = ? WHERE id = ?',
                [name, sort || 0, status !== undefined ? status : 1, remark || '', id]
            );
            if (permissionIds !== undefined) {
                await conn.query('DELETE FROM t_ryytn_role_page WHERE role_id = ?', [id]);
                for (const pid of permissionIds) {
                    await conn.query('INSERT INTO t_ryytn_role_page (role_id, page_id) VALUES (?, ?)', [id, pid]);
                }
            }
            if (postIds !== undefined) {
                await conn.query('DELETE FROM t_ryytn_role_jobtitle WHERE role_id = ?', [id]);
                for (const pid of postIds) {
                    await conn.query('INSERT INTO t_ryytn_role_jobtitle (role_id, job_id) VALUES (?, ?)', [id, pid]);
                }
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
        res.json({ code: 200, msg: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 删除角色
app.delete('/api/roles/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        if (id == '1') return res.status(400).json({ code: 400, msg: '超级管理员角色不可删除' });
        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM t_ryytn_role_page WHERE role_id = ?', [id]);
            await conn.query('DELETE FROM t_ryytn_role_jobtitle WHERE role_id = ?', [id]);
            await conn.query('DELETE FROM t_ryytn_account_role WHERE role_id = ?', [id]);
            await conn.query('DELETE FROM t_ryytn_role WHERE id = ?', [id]);
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
        res.json({ code: 200, msg: '删除成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 新增岗位
app.post('/api/jobtitles', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id, name, code, deptId, remark } = req.body;
        await mysqlPool.query(
            'INSERT INTO t_ryytn_oa_jobtitle (id, job_title_mark, job_title_name, job_department_id, job_title_remark, created_time) VALUES (?, ?, ?, ?, ?, NOW())',
            [id, code, name, deptId, remark || '']
        );
        res.json({ code: 200, msg: '新增成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 更新岗位
app.put('/api/jobtitles/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, deptId, remark } = req.body;
        await mysqlPool.query(
            'UPDATE t_ryytn_oa_jobtitle SET job_title_mark = ?, job_title_name = ?, job_department_id = ?, job_title_remark = ? WHERE id = ?',
            [code, name, deptId, remark || '', id]
        );
        res.json({ code: 200, msg: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 删除岗位
app.delete('/api/jobtitles/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        // 检查是否有在该岗位的用户
        const [users] = await mysqlPool.query('SELECT account_id FROM t_ryytn_account_jobtitle WHERE job_id = ?', [id]);
        if (users.length > 0) {
            return res.status(400).json({ code: 400, msg: '该岗位下存在关联用户，无法删除' });
        }
        await mysqlPool.query('DELETE FROM t_ryytn_role_jobtitle WHERE job_id = ?', [id]);
        await mysqlPool.query('DELETE FROM t_ryytn_oa_jobtitle WHERE id = ?', [id]);
        res.json({ code: 200, msg: '删除成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});


// 14. 更新用户状态
app.put('/api/accounts/:id/status', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await mysqlPool.query('UPDATE t_ryytn_account SET status = ? WHERE id = ?', [status, id]);
        await redisClient.del('cache:accounts');
        await writeAuditLog({ req, action: 'UPDATE_STATUS', resource: 'account', targetId: id, detail: { status } });
        res.json({ code: 200, msg: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 15. 删除用户
app.delete('/api/accounts/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM t_ryytn_account_role WHERE account_id = ?', [id]);
            await conn.query('DELETE FROM t_ryytn_account_jobtitle WHERE account_id = ?', [id]);
            await conn.query('DELETE FROM t_ryytn_account WHERE id = ?', [id]);
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
        await redisClient.del('cache:accounts');
        await writeAuditLog({ req, action: 'DELETE', resource: 'account', targetId: id });
        res.json({ code: 200, msg: '删除成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 16. 编辑用户
app.put('/api/accounts/:id', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { id } = req.params;
        const { nickname, phone, email, status, deptId, roleIds, postIds } = req.body;
        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'UPDATE t_ryytn_account SET nick_name = ?, mobile = ?, email = ?, status = ?, department_id = ? WHERE id = ?',
                [nickname, phone, email, status, deptId, id]
            );
            if (roleIds !== undefined) {
                await conn.query('DELETE FROM t_ryytn_account_role WHERE account_id = ?', [id]);
                if (roleIds.length > 0) {
                    for (const rid of roleIds) {
                        await conn.query('INSERT INTO t_ryytn_account_role (account_id, role_id) VALUES (?, ?)', [id, rid]);
                    }
                }
            }
            if (postIds !== undefined) {
                await conn.query('DELETE FROM t_ryytn_account_jobtitle WHERE account_id = ?', [id]);
                if (postIds.length > 0) {
                    for (const pid of postIds) {
                        await conn.query('INSERT INTO t_ryytn_account_jobtitle (account_id, job_id) VALUES (?, ?)', [id, pid]);
                    }
                }
            }
            await conn.commit();
        } catch (e) {
            await conn.rollback();
            throw e;
        } finally {
            conn.release();
        }
        
        await redisClient.del('cache:accounts');
        await writeAuditLog({ req, action: 'UPDATE', resource: 'account', targetId: id, detail: { nickname, phone, email, status, deptId, roleIds, postIds } });
        res.json({ code: 200, msg: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: 500, msg: '服务器错误' });
    }
});

// 17. 获取超级管理员辅助动态码（仅超管可调用）
app.get('/api/admin/helper-code', authRequired, superAdminRequired, async (req, res) => {
    try {
        const [rows] = await mysqlPool.query('SELECT helper_code FROM t_ryytn_account WHERE login_id = ?', ['jiaohaoyuan']);
        if (rows.length === 0) {
            return res.status(404).json({ code: 404, msg: '超级管理员账号不存在' });
        }
        res.json({ code: 200, msg: '获取成功', data: { helperCode: rows[0].helper_code } });
    } catch (error) {
        console.error('Get helper code error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 18. 刷新超级管理员辅助动态码
app.post('/api/admin/refresh-helper-code', authRequired, superAdminRequired, async (req, res) => {
    try {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        await mysqlPool.query('UPDATE t_ryytn_account SET helper_code = ? WHERE login_id = ?', [code, 'jiaohaoyuan']);
        await writeAuditLog({ req, action: 'REFRESH', resource: 'helper_code', targetId: 'jiaohaoyuan' });
        res.json({ code: 200, msg: '辅助动态码已更新', data: { helperCode: code } });
    } catch (error) {
        console.error('Refresh helper code error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 18.5 验证超管辅助动态码
app.post('/api/admin/verify-helper-code', authLimiter, async (req, res) => {
    try {
        const { helperCode } = req.body;
        if (!helperCode) {
            return res.status(400).json({ code: 400, msg: '辅助动态码不能为空' });
        }
        const [adminRows] = await mysqlPool.query('SELECT helper_code FROM t_ryytn_account WHERE login_id = ?', ['jiaohaoyuan']);
        if (adminRows.length === 0 || adminRows[0].helper_code !== helperCode) {
            return res.status(400).json({ code: 400, msg: '超级管理员辅助码错误' });
        }
        res.json({ code: 200, msg: '辅助码校验通过' });
    } catch (error) {
        console.error('Verify helper code error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 19. 忘记密码 - 用户名 + 短信验证码 + 超管辅助码 三重校验后重置密码
app.post('/api/reset-password', authLimiter, async (req, res) => {
    try {
        const { username, smsCode, helperCode, newPassword } = req.body;

        if (!username || !smsCode || !helperCode || !newPassword) {
            return res.status(400).json({ code: 400, msg: '参数不完整' });
        }

        // 1. 验证短信验证码 (从 Redis 取)
        const savedSmsCode = await redisClient.get(`sms:code:${username}`);
        if (!savedSmsCode) {
            return res.status(400).json({ code: 400, msg: '短信验证码已过期或未发送' });
        }
        if (savedSmsCode !== smsCode) {
            return res.status(400).json({ code: 400, msg: '短信验证码错误' });
        }

        // 2. 验证目标用户名是否存在
        const [users] = await mysqlPool.query('SELECT id FROM t_ryytn_account WHERE login_id = ?', [username]);
        if (users.length === 0) {
            return res.status(400).json({ code: 400, msg: '该用户名不存在' });
        }

        // 3. 验证超管辅助码是否正确（以 jiaohaoyuan 为准）
        const [adminRows] = await mysqlPool.query('SELECT helper_code FROM t_ryytn_account WHERE login_id = ?', ['jiaohaoyuan']);
        if (adminRows.length === 0 || adminRows[0].helper_code !== helperCode) {
            return res.status(400).json({ code: 400, msg: '超级管理员辅助码错误' });
        }

        // 4. 重置密码
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await mysqlPool.query('UPDATE t_ryytn_account SET password = ? WHERE login_id = ?', [hashedPassword, username]);

        // 5. 清理 Redis 中的短信码
        await redisClient.del(`sms:code:${username}`);

        try {
            await redisClient.del('cache:accounts');
        } catch (redisErr) {
            console.warn('Failed to clear redis cache:', redisErr.message);
        }

        res.json({ code: 200, msg: '密码重置成功，请重新登录' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

// 20. 获取当前用户个人中心信息（含部门、角色、岗位）
app.get('/api/profile/:username', authRequired, async (req, res) => {
    try {
        const { username } = req.params;
        if (req.user.username !== username && req.user.role !== '超级管理员') {
            return res.status(403).json({ code: 403, msg: '无权限访问该用户信息' });
        }

        // 获取账号基本信息 + 部门名称
        const [users] = await mysqlPool.query(`
            SELECT 
                a.id, a.login_id, a.nick_name, a.name, a.mobile, a.email,
                a.status, a.created_time, a.department_id, a.helper_code,
                d.department_name AS department_name
            FROM t_ryytn_account a
            LEFT JOIN t_ryytn_oa_department d ON a.department_id = d.id
            WHERE a.login_id = ?
        `, [username]);

        if (users.length === 0) {
            return res.status(404).json({ code: 404, msg: '用户不存在' });
        }

        const user = users[0];

        // 获取关联角色
        const [roleRows] = await mysqlPool.query(`
            SELECT r.id, r.name, r.id AS code
            FROM t_ryytn_account_role ar
            JOIN t_ryytn_role r ON ar.role_id = r.id
            WHERE ar.account_id = ?
        `, [user.id]);

        // 获取关联岗位
        const [postRows] = await mysqlPool.query(`
            SELECT DISTINCT j.id, j.job_title_name AS name, j.job_title_mark AS code
            FROM t_ryytn_account_jobtitle aj
            JOIN t_ryytn_oa_jobtitle j ON aj.job_id = j.id
            WHERE aj.account_id = ?
        `, [user.id]);

        res.json({
            code: 200,
            msg: '获取成功',
            data: {
                id: user.id,
                username: user.login_id,
                nickname: user.nick_name || user.name,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                status: user.status,
                createdTime: user.created_time,
                departmentId: user.department_id,
                departmentName: user.department_name || '暂无部门',
                roles: roleRows,
                posts: postRows,
                isSuperAdmin: user.login_id === 'jiaohaoyuan'
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ code: 500, msg: '服务器错误: ' + error.message });
    }
});

app.get('/api/me', authRequired, async (req, res) => {
    res.json({ code: 200, msg: '获取成功', data: req.user, traceId: req.traceId });
});

// ==========================================
// 基础数据管理模块 (MDM) - Excel 上传与查改删
// ==========================================

const getAdapterByTableType = (tableType) => {
    if (tableType === 'SKU') {
        return {
            processRow: async (row, conn) => {
                const skuCode = row.sku_code || row['SKU编码'] || row['编码'];
                const skuName = row.sku_name || row['SKU名称'] || row['名称'];
                const barCode = row.bar_code || row['69码'] || '';
                const categoryCode = row.category_code || row['品类编码'] || '';
                const lifecycle = row.lifecycle_status || row['生命周期'] || 'ACTIVE';
                const shelfLife = row.shelf_life_days || row['保质期'] || 0;
                const unitRatio = row.unit_ratio || row['单位换算'] || 1.0;
                const volume = row.volume_m3 || row['规格体积'] || 0;

                if (!skuCode || !skuName) throw new Error('缺少必填字段: sku_code 或 sku_name');

                await conn.query(`
                    INSERT INTO cdop_master.mst_sku_info 
                    (sku_code, sku_name, bar_code, category_code, lifecycle_status, shelf_life_days, unit_ratio, volume_m3)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    sku_name=VALUES(sku_name), bar_code=VALUES(bar_code), category_code=VALUES(category_code),
                    lifecycle_status=VALUES(lifecycle_status), shelf_life_days=VALUES(shelf_life_days),
                    unit_ratio=VALUES(unit_ratio), volume_m3=VALUES(volume_m3), updated_time=NOW()
                `, [String(skuCode), String(skuName), String(barCode), String(categoryCode), String(lifecycle), Number(shelfLife), Number(unitRatio), Number(volume)]);
            }
        };
    } else if (tableType === 'RESELLER_RLTN') {
        return {
            processRow: async (row, conn) => {
                const skuCode = row.sku_code || row['SKU编码'] || '';
                const resellerCode = row.reseller_code || row['经销商编码'] || '';
                let beginDate = row.begin_date || row['生效开始日期'] || row['开始日期'];
                let endDate = row.end_date || row['生效结束日期'] || row['结束日期'];

                if (!skuCode || !resellerCode) throw new Error('缺少必填字段: sku_code 或 reseller_code');
                
                // Excel numeric dates support
                if(typeof beginDate === 'number') {
                    const d = new Date((beginDate - (25567 + 1)) * 86400 * 1000);
                    beginDate = d.toISOString().split('T')[0];
                }
                if(typeof endDate === 'number') {
                    const d = new Date((endDate - (25567 + 1)) * 86400 * 1000);
                    endDate = d.toISOString().split('T')[0];
                }
                if (!beginDate || !endDate) throw new Error('缺少日期字段');
                
                if (new Date(beginDate) > new Date(endDate)) {
                    throw new Error(`开始日期 (${beginDate}) 大于 结束日期 (${endDate})`);
                }

                await conn.query(`
                    INSERT INTO cdop_master.mst_rltn_sku_reseller 
                    (sku_code, reseller_code, begin_date, end_date)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    begin_date=VALUES(begin_date), end_date=VALUES(end_date), updated_time=NOW()
                `, [String(skuCode), String(resellerCode), String(beginDate), String(endDate)]);
            }
        };
    }
    throw new Error('未知的表类型: ' + tableType);
};

app.post('/api/master/import', authRequired, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ code: 400, msg: '无文件上传' });
        const { tableType } = req.body;
        if (!tableType) return res.status(400).json({ code: 400, msg: '缺少表类型 tableType' });
        
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        if (jsonData.length > 10000) return res.status(400).json({ code: 400, msg: '最大支持单次1万行' });
        if (jsonData.length === 0) return res.status(400).json({ code: 400, msg: 'Excel文件没有数据' });

        const adapter = getAdapterByTableType(tableType); 
        const results = [];
        const errors = [];
        
        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                const rowNumber = i + 2; 
                try {
                    await adapter.processRow(row, conn);
                    results.push({ rowNumber, status: 'success' });
                } catch (err) {
                    errors.push({ rowNumber, error: err.message, rawData: row });
                }
            }
            await conn.commit();
        } catch(err) {
            await conn.rollback();
            console.error(err);
            return res.status(500).json({ code: 500, msg: '导入过程严重系统异常，全部回滚' });
        } finally {
            conn.release();
        }
        
        res.json({
             code: 200,
             msg: `验证与处理完成`,
             data: {
                totalCount: jsonData.length,
                successCount: results.length,
                errorCount: errors.length,
                errors: errors
             }
        });
    } catch (e) {
        console.error('Import excel error:', e);
        res.status(500).json({ code: 500, msg: '服务器异常: ' + e.message });
    }
});

app.get('/api/master/:tableType/list', authRequired, async (req, res) => {
    try {
        const { tableType } = req.params;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const keyword = req.query.keyword || '';
        const offset = (page - 1) * pageSize;
        
        let queryStr = '';
        let countQueryStr = '';
        let queryParams = [];

        if (tableType === 'SKU') {
            queryStr = 'SELECT * FROM cdop_master.mst_sku_info WHERE status=1';
            countQueryStr = 'SELECT count(*) as total FROM cdop_master.mst_sku_info WHERE status=1';
            if (keyword) {
                queryStr += ' AND (sku_code LIKE ? OR sku_name LIKE ?)';
                countQueryStr += ' AND (sku_code LIKE ? OR sku_name LIKE ?)';
                queryParams.push(`%${keyword}%`, `%${keyword}%`);
            }
        } else if (tableType === 'RESELLER_RLTN') {
            queryStr = 'SELECT * FROM cdop_master.mst_rltn_sku_reseller WHERE status=1';
            countQueryStr = 'SELECT count(*) as total FROM cdop_master.mst_rltn_sku_reseller WHERE status=1';
            if (keyword) {
                queryStr += ' AND (sku_code LIKE ? OR reseller_code LIKE ?)';
                countQueryStr += ' AND (sku_code LIKE ? OR reseller_code LIKE ?)';
                queryParams.push(`%${keyword}%`, `%${keyword}%`);
            }
        } else {
            return res.status(400).json({ code: 400, msg: '未知的TableType' });
        }

        queryStr += ' ORDER BY created_time DESC LIMIT ? OFFSET ?';
        
        const countParams = [...queryParams];
        queryParams.push(pageSize, offset);

        const [[{ total }]] = await mysqlPool.query(countQueryStr, countParams);
        const [rows] = await mysqlPool.query(queryStr, queryParams);

        res.json({
            code: 200,
            msg: '获取成功',
            data: { list: rows, total, page, pageSize }
        });
    } catch (e) {
        console.error('List master data error:', e);
        res.status(500).json({ code: 500, msg: '服务器异常: ' + e.message });
    }
});

app.delete('/api/master/:tableType', authRequired, superAdminRequired, async (req, res) => {
    try {
        const { tableType } = req.params;
        const { ids } = req.body;
        if (!ids || !ids.length) return res.status(400).json({ code: 400, msg: '缺少ids' });

        let table = '';
        if (tableType === 'SKU') table = 'cdop_master.mst_sku_info';
        else if (tableType === 'RESELLER_RLTN') table = 'cdop_master.mst_rltn_sku_reseller';
        else return res.status(400).json({ code: 400, msg: '未知的TableType' });

        // Logic Delete
        await mysqlPool.query(`UPDATE ${table} SET status=0 WHERE id IN (?)`, [ids]);
        res.json({ code: 200, msg: '删除成功' });
    } catch (e) {
        console.error('Delete error:', e);
        res.status(500).json({ code: 500, msg: '服务器异常' });
    }
});

app.use((error, req, res, next) => {
    if (error && error.message === 'Not allowed by CORS') {
        return res.status(403).json({ code: 403, msg: '跨域请求被拒绝', traceId: req.traceId });
    }
    console.error('Unhandled error:', error);
    if (res.headersSent) return next(error);
    res.status(500).json({ code: 500, msg: '服务器错误', traceId: req.traceId });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`[Backend API] Server is running on http://localhost:${PORT}`);

    // 初始化超级管理员的辅助动态码（若为空则自动生成）
    try {
        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS t_ryytn_audit_log (
                id BIGINT PRIMARY KEY,
                actor_id BIGINT NULL,
                action VARCHAR(64) NOT NULL,
                resource VARCHAR(128) NOT NULL,
                target_id VARCHAR(64) NULL,
                detail JSON NULL,
                trace_id VARCHAR(64) NULL,
                ip VARCHAR(100) NULL,
                user_agent VARCHAR(255) NULL,
                created_time DATETIME NOT NULL
            )
        `);
        await mysqlPool.query('CREATE UNIQUE INDEX idx_account_login_id ON t_ryytn_account (login_id)');
    } catch (e) {}
    try {
        await mysqlPool.query('CREATE INDEX idx_order_main_create_time ON t_ryytn_order_main (create_time)');
    } catch (e) {}
    try {
        await mysqlPool.query('CREATE INDEX idx_order_main_distributor_id ON t_ryytn_order_main (distributor_id)');
    } catch (e) {}
    try {
        await mysqlPool.query('CREATE INDEX idx_order_main_sku_id ON t_ryytn_order_main (sku_id)');
    } catch (e) {}
    try {
        // 先确保 helper_code 字段存在（兼容旧数据库）
        try {
            await mysqlPool.query('ALTER TABLE t_ryytn_account ADD COLUMN IF NOT EXISTS helper_code VARCHAR(20) DEFAULT NULL');
        } catch (e) {
            // MySQL 不支持 IF NOT EXISTS，尝试检查后添加
            try {
                await mysqlPool.query('ALTER TABLE t_ryytn_account ADD COLUMN helper_code VARCHAR(20) DEFAULT NULL');
            } catch (e2) {
                // 字段可能已存在，忽略
            }
        }

        const [rows] = await mysqlPool.query('SELECT helper_code FROM t_ryytn_account WHERE login_id = ?', ['jiaohaoyuan']);
        if (rows.length > 0 && !rows[0].helper_code) {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
            await mysqlPool.query('UPDATE t_ryytn_account SET helper_code = ? WHERE login_id = ?', [code, 'jiaohaoyuan']);
            console.log(`[Init] 超级管理员辅助码已初始化: ${code}`);
        }
        const [accounts] = await mysqlPool.query('SELECT id, password FROM t_ryytn_account');
        for (const account of accounts) {
            const pwd = String(account.password || '');
            if (pwd && !pwd.startsWith('$2a$') && !pwd.startsWith('$2b$') && !pwd.startsWith('$2y$')) {
                const hashedPassword = await bcrypt.hash(pwd, 10);
                await mysqlPool.query('UPDATE t_ryytn_account SET password = ? WHERE id = ?', [hashedPassword, account.id]);
            }
        }
    } catch (err) {
        console.warn('[Init] 初始化辅助码失败:', err.message);
    }
});
