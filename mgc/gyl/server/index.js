
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { DB_FILE, nowIso, readDb, updateDb, nextId } = require('./localDb');
const { registerOrderPhase2Routes } = require('./orderPhase2');
const { registerInventoryOpsRoutes } = require('./inventoryOps');
const { registerMdmGovernanceRoutes, runQualityCheckCore } = require('./mdmGovernance');
const { registerChannelDealerOpsRoutes } = require('./channelDealerOps');
const { registerWorkflowCenterRoutes } = require('./workflowCenter');
const { registerManagementCockpitRoutes } = require('./managementCockpit');
const {
    buildSkuRuleConfig,
    inferStandardSkuCode,
    isStandardSkuCode,
    normalizeCode: normalizeSkuCode,
    validateSkuCode
} = require('./skuRules');
const { normalizeSpuRow, withSpuMetrics } = require('./spuCatalog');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'local-file-jwt-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const SUPER_ADMIN_LOGIN_IDS = new Set((process.env.SUPER_ADMIN_LOGIN_IDS || 'jiaohaoyuan').split(',').map(v => v.trim()).filter(Boolean));
const SUPER_ADMIN_ROLE_IDS = new Set((process.env.SUPER_ADMIN_ROLE_IDS || '1').split(',').map(v => Number(v.trim())).filter(v => !Number.isNaN(v)));
const SUPER_ADMIN_ROLE_NAMES = new Set((process.env.SUPER_ADMIN_ROLE_NAMES || '超级管理员').split(',').map(v => v.trim()).filter(Boolean));

const OPEN_API_PATHS = new Set([
    '/ping',
    '/login',
    '/register',
    '/sms/send-code',
    '/sms/verify-code',
    '/admin/verify-helper-code',
    '/reset-password'
]);

const API_PERMISSION_RULES = [
    { matcher: /^\/departments(?:\/|$)/, permissionPath: '/department' },
    { matcher: /^\/accounts(?:\/|$)/, permissionPath: '/user' },
    { matcher: /^\/roles(?:\/|$)/, permissionPath: '/role' },
    { matcher: /^\/jobtitles(?:\/|$)/, permissionPath: '/post' },
    { matcher: /^\/permissions(?:\/|$)/, permissionPath: '/permission' },
    { matcher: /^\/dict\/types(?:\/|$)/, permissionPath: '/dict-center' },
    { matcher: /^\/dict\/items(?:\/|$)/, permissionPath: '/dict-center' },
    { matcher: /^\/dict\/lookup(?:\/|$)/, permissionPath: '/dict-center' },
    { matcher: /^\/operation-logs(?:\/|$)/, permissionPath: '/operation-log' },
    { matcher: /^\/import-tasks(?:\/|$)/, permissionPath: '/import-task' },
    { matcher: /^\/export-tasks(?:\/|$)/, permissionPath: '/export-task' },
    { matcher: /^\/pasture-stats(?:\/|$)/, permissionPath: '/pasture' },
    { matcher: /^\/products(?:\/|$)/, permissionPath: '/intelligent' },
    { matcher: /^\/warehouses(?:\/|$)/, permissionPath: '/intelligent' },
    { matcher: /^\/orders(?:\/|$)/, permissionPath: '/intelligent' },
    { matcher: /^\/order-analysis(?:\/|$)/, permissionPath: '/intelligent' },
    { matcher: /^\/inventory(?:\/|$)/, permissionPath: '/intelligent' },
    { matcher: /^\/inventory-ops(?:\/|$)/, permissionPath: '/inventory-ops' },
    { matcher: /^\/channel-dealer-ops(?:\/|$)/, permissionPath: '/channel-dealer-ops' },
    { matcher: /^\/workflow-center(?:\/|$)/, permissionPath: '/workflow-center' },
    { matcher: /^\/management-cockpit(?:\/|$)/, permissionPath: '/management-cockpit' },
    { matcher: /^\/platform(?:\/|$)/, permissionPath: '/enterprise-platform' }
];

const createTraceId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const normalizePath = (rawPath = '') => (rawPath === '/' ? '/' : String(rawPath).replace(/\/+$/, ''));
const extractToken = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
const toNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isNaN(n) ? fallback : n;
};
const ensureArray = (value) => (Array.isArray(value) ? value : []);
const ERROR_CODE_BY_STATUS = {
    400: 'BIZ_400',
    401: 'AUTH_401',
    403: 'AUTH_403',
    404: 'BIZ_404',
    409: 'BIZ_409',
    429: 'SYS_429',
    500: 'SYS_500'
};

const contains = (text, keyword) => String(text || '').toLowerCase().includes(String(keyword || '').trim().toLowerCase());
const normalizeDictCode = (value) => String(value || '').trim().toUpperCase();
const isValidDictCode = (value) => /^[A-Z][A-Z0-9_]{1,63}$/.test(String(value || ''));
const PHONE_REGEX = /^1[3-9]\d{9}$/;
// 支持主流邮箱格式（含 plus-tag、多级域名、子域名、punycode 域名）
const EMAIL_REGEX = /^(?=.{6,254}$)(?=.{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])$/;
const validateDictCodeOrThrow = (value, label) => {
    if (!isValidDictCode(value)) throw new Error(`${label}仅支持大写字母、数字、下划线，且必须字母开头`);
};
const validatePhoneOrThrow = (value, label = '手机号') => {
    const phone = String(value || '').trim();
    if (!phone) throw new Error(`${label}不能为空`);
    if (!PHONE_REGEX.test(phone)) throw new Error(`${label}格式不正确`);
    return phone;
};
const validateEmailOrThrow = (value, label = '邮箱') => {
    const email = String(value || '').trim();
    if (!email) return '';
    if (!EMAIL_REGEX.test(email)) throw new Error(`${label}格式不正确`);
    return email;
};
const normalizeBinaryStatus = (value, fallback = 1) => {
    if (value === '' || value === undefined || value === null) return fallback;
    const status = toNum(value, fallback);
    if (status !== 0 && status !== 1) return fallback;
    return status;
};
const parseBatchIds = (ids) => {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map((id) => toNum(id, 0)).filter((id) => id > 0))];
};
const paginate = (rows, page, pageSize) => {
    const p = Math.max(1, toNum(page, 1));
    const ps = Math.max(1, toNum(pageSize, 20));
    const start = (p - 1) * ps;
    return { list: rows.slice(start, start + ps), total: rows.length };
};

const toDateKey = (v) => {
    if (!v) return '';
    if (typeof v === 'number') {
        const d = new Date((v - (25567 + 1)) * 86400 * 1000);
        return d.toISOString().slice(0, 10);
    }
    return String(v).slice(0, 10);
};

const apiOk = (res, req, data, msg = '成功') => res.json({ code: 200, msg, data, traceId: req.traceId });
const apiErr = (res, req, status, msg, extra = {}) => res.status(status).json({
    code: status,
    msg,
    traceId: req.traceId,
    errorCode: extra.errorCode || ERROR_CODE_BY_STATUS[status] || 'SYS_UNKNOWN',
    details: extra.details || null,
    ...extra
});
const getRequestIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '').split(',')[0].trim();

const safeClone = (value) => JSON.parse(JSON.stringify(value ?? null));
const summarizePayload = (payload) => {
    if (payload === undefined || payload === null) return null;
    if (Array.isArray(payload)) return payload.slice(0, 20);
    if (typeof payload !== 'object') return payload;
    const next = {};
    Object.entries(payload).forEach(([key, value]) => {
        if (/(password|token|authorization)/i.test(key)) {
            next[key] = '***';
            return;
        }
        if (Array.isArray(value) && value.length > 30) {
            next[key] = value.slice(0, 30);
            return;
        }
        next[key] = value;
    });
    return next;
};
const MAX_RUNTIME_API_METRICS = 5000;
const runtimeApiMetrics = [];

const pushRuntimeApiMetric = (metric) => {
    runtimeApiMetrics.push(metric);
    if (runtimeApiMetrics.length > MAX_RUNTIME_API_METRICS) {
        runtimeApiMetrics.splice(0, runtimeApiMetrics.length - MAX_RUNTIME_API_METRICS);
    }
};

const toDateMillis = (value, endOfDay = false) => {
    if (!value) return 0;
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const d = new Date(`${String(value).slice(0, 10)}${suffix}`);
    const millis = d.getTime();
    return Number.isNaN(millis) ? 0 : millis;
};

const toSafeObject = (value, fallback = {}) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return safeClone(fallback);
    return safeClone(value);
};

const buildDiffSummary = (beforeSnapshot, afterSnapshot) => {
    const before = toSafeObject(beforeSnapshot, {});
    const after = toSafeObject(afterSnapshot, {});
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changedKeys = keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    return {
        changedCount: changedKeys.length,
        changedKeys: changedKeys.slice(0, 12)
    };
};

const appendSecurityLog = (req, payload) => {
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const rows = ensureArray(db.platform.security_logs);
            db.platform.security_logs = rows;
            const now = Date.now();
            const username = String(payload.username || req.user?.username || '');
            const eventType = String(payload.eventType || 'LOGIN');
            const result = String(payload.result || 'SUCCESS');
            let riskLevel = String(payload.riskLevel || '');

            if (!riskLevel) {
                if (eventType === 'LOGIN' && result === 'FAILED') {
                    const failCount = rows.filter((row) =>
                        String(row.event_type) === 'LOGIN' &&
                        String(row.result) === 'FAILED' &&
                        (String(row.username) === username || String(row.operator_ip) === String(getRequestIp(req))) &&
                        (now - new Date(row.created_at).getTime()) <= 30 * 60 * 1000
                    ).length + 1;
                    riskLevel = failCount >= 5 ? 'CRITICAL' : (failCount >= 3 ? 'HIGH' : 'MEDIUM');
                } else if (eventType === 'LOGIN' && result === 'SUCCESS') {
                    const knownIp = rows.some((row) =>
                        String(row.event_type) === 'LOGIN' &&
                        String(row.result) === 'SUCCESS' &&
                        String(row.username) === username &&
                        String(row.operator_ip) === String(getRequestIp(req))
                    );
                    riskLevel = knownIp ? 'LOW' : 'MEDIUM';
                } else if (eventType === 'PERMISSION_CHANGE') {
                    riskLevel = 'MEDIUM';
                } else {
                    riskLevel = 'LOW';
                }
            }

            rows.push({
                id: nextId(rows),
                event_type: eventType,
                username,
                user_id: payload.userId ?? req.user?.id ?? null,
                module_code: payload.moduleCode || 'security',
                action_type: payload.actionType || eventType,
                result,
                risk_level: riskLevel,
                operator_ip: payload.operatorIp || getRequestIp(req),
                user_agent: String(req.headers['user-agent'] || ''),
                message: payload.message || '',
                metadata: summarizePayload(payload.metadata || {}),
                created_at: nowIso()
            });
        });
    } catch (error) {
        console.warn('[security-log] append failed:', error?.message || error);
    }
};

const appendOperationLog = (req, payload) => {
    try {
        updateDb((db) => {
            const rows = Array.isArray(db.platform?.operation_logs) ? db.platform.operation_logs : [];
            if (!db.platform) db.platform = {};
            db.platform.operation_logs = rows;
            rows.push({
                id: nextId(rows),
                log_type: payload.logType || 'BUSINESS',
                module_code: payload.moduleCode || 'system',
                biz_object_type: payload.bizObjectType || '',
                biz_object_id: payload.bizObjectId ?? '',
                action_type: payload.actionType || 'VIEW',
                operator_id: req.user?.id ?? null,
                operator_name: req.user?.nickname || req.user?.username || 'anonymous',
                operator_roles: safeClone(req.user?.roleNames || []),
                operator_ip: getRequestIp(req),
                user_agent: String(req.headers['user-agent'] || ''),
                request_path: req.originalUrl || req.path || '',
                request_method: req.method || '',
                trace_id: req.traceId || '',
                result_status: payload.resultStatus || 'SUCCESS',
                message: payload.message || '',
                request_summary: summarizePayload(payload.requestSummary ?? req.body ?? req.query ?? null),
                before_snapshot: safeClone(payload.beforeSnapshot),
                after_snapshot: safeClone(payload.afterSnapshot),
                created_at: nowIso()
            });
        });
    } catch (error) {
        console.warn('[operation-log] append failed:', error?.message || error);
    }
};

const appendTaskRecord = (taskType, payload) => {
    let createdTask = null;
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const key = taskType === 'IMPORT' ? 'import_tasks' : 'export_tasks';
            const rows = Array.isArray(db.platform[key]) ? db.platform[key] : [];
            db.platform[key] = rows;
            createdTask = {
                id: nextId(rows),
                task_type: taskType,
                biz_type: payload.bizType || '',
                task_name: payload.taskName || '',
                file_name: payload.fileName || '',
                operator_id: payload.operatorId ?? null,
                operator_name: payload.operatorName || '',
                request_path: payload.requestPath || '',
                query_snapshot: safeClone(payload.querySnapshot),
                status: payload.status || 'SUCCESS',
                total_count: toNum(payload.totalCount, 0),
                success_count: toNum(payload.successCount, 0),
                fail_count: toNum(payload.failCount, 0),
                result_message: payload.resultMessage || '',
                result_payload: safeClone(payload.resultPayload),
                created_at: nowIso(),
                finished_at: nowIso()
            };
            rows.push(createdTask);
        });
    } catch (error) {
        console.warn('[task-record] append failed:', error?.message || error);
    }
    return createdTask;
};

const appendNotification = (payload) => {
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const rows = Array.isArray(db.platform.notifications) ? db.platform.notifications : [];
            db.platform.notifications = rows;
            rows.push({
                id: nextId(rows),
                title: payload.title || '',
                content: payload.content || '',
                biz_type: payload.bizType || '',
                biz_id: payload.bizId ?? '',
                status: payload.status || 'UNREAD',
                receiver_id: payload.receiverId ?? null,
                receiver_name: payload.receiverName || '',
                created_at: nowIso()
            });
        });
    } catch (error) {
        console.warn('[notification] append failed:', error?.message || error);
    }
};

const resolveApiPermissionPath = (apiPath) => {
    for (const rule of API_PERMISSION_RULES) {
        if (rule.matcher.test(apiPath)) return rule.permissionPath;
    }
    return '';
};

const resolveMasterPermissionPath = (req) => {
    const rawPath = normalizePath(String(req.path || req.originalUrl || '').split('?')[0]);
    const pathNoApi = rawPath.startsWith('/api/') ? rawPath.slice(4) : rawPath;
    const pathLower = pathNoApi.toLowerCase();

    if (pathLower === '/master/import') {
        const tableType = String(req.body?.tableType || '').toUpperCase();
        if (tableType === 'SKU') return '/mdm/sku';
        if (tableType === 'RESELLER_RLTN') return '/mdm/reseller-relation';
        return '/mdm/governance';
    }

    const rules = [
        [/^\/master\/sku(?:\/|$)/, '/mdm/sku'],
        [/^\/master\/spu(?:\/|$)/, '/mdm/spu'],
        [/^\/master\/reseller_rltn(?:\/|$)/, '/mdm/reseller-relation'],
        [/^\/master\/category(?:\/|$)/, '/mdm/category'],
        [/^\/master\/warehouse(?:\/|$)/, '/mdm/warehouse'],
        [/^\/master\/factory(?:\/|$)/, '/mdm/factory'],
        [/^\/master\/channel(?:\/|$)/, '/mdm/channel'],
        [/^\/master\/reseller(?:\/|$)/, '/mdm/reseller'],
        [/^\/master\/org(?:\/|$)/, '/mdm/org'],
        [/^\/master\/calendar(?:\/|$)/, '/mdm/calendar'],
        [/^\/master\/rltn\/warehouse-sku(?:\/|$)/, '/mdm/rltn/warehouse-sku'],
        [/^\/master\/rltn\/org-reseller(?:\/|$)/, '/mdm/rltn/org-reseller'],
        [/^\/master\/rltn\/product-sku(?:\/|$)/, '/mdm/rltn/product-sku'],
        [/^\/master\/governance(?:\/|$)/, '/mdm/governance']
    ];

    for (const [matcher, permissionPath] of rules) {
        if (matcher.test(pathLower)) return permissionPath;
    }
    return '';
};

const userHasPermissionPath = (req, permissionPath) => {
    if (!permissionPath) return false;
    const userPathSet = new Set((req.user?.permissionPaths || []).map(normalizePath));
    return userPathSet.has(normalizePath(permissionPath));
};

const getRoleIdsByAccount = (db, accountId) =>
    db.system.account_roles.filter(r => Number(r.account_id) === Number(accountId)).map(r => Number(r.role_id));

const getPostIdsByAccount = (db, accountId) =>
    db.system.account_posts.filter(r => Number(r.account_id) === Number(accountId)).map(r => String(r.job_id));

const getRoleRows = (db, roleIds) => db.system.roles.filter(r => roleIds.includes(Number(r.id)) && Number(r.status) === 1);

const buildRbacContext = (db, accountId) => {
    const roleIds = getRoleIdsByAccount(db, accountId);
    const roleRows = getRoleRows(db, roleIds);
    const roleNames = roleRows.map(r => r.name);
    const permissionPageIds = [...new Set(db.system.role_pages.filter(rp => roleIds.includes(Number(rp.role_id))).map(rp => Number(rp.page_id)))];
    const pageRows = db.system.pages.filter(p => permissionPageIds.includes(Number(p.id)));
    const permissionIds = pageRows.map(p => Number(p.id));
    const permissionPaths = [...new Set(pageRows.map(p => normalizePath(p.path)).filter(Boolean))];
    const permissionCodes = [...new Set(pageRows.map(p => p.permission).filter(Boolean))];
    return { roleIds, roleNames, permissionIds, permissionPaths, permissionCodes };
};

const isSuperAdminUser = ({ loginId, roleIds, roleNames }) => {
    if (SUPER_ADMIN_LOGIN_IDS.has(String(loginId))) return true;
    if (roleIds.some(id => SUPER_ADMIN_ROLE_IDS.has(Number(id)))) return true;
    if (roleNames.some(name => SUPER_ADMIN_ROLE_NAMES.has(String(name)))) return true;
    return false;
};

const sanitizeUser = (account, rbac) => {
    const isSuperAdmin = isSuperAdminUser({
        loginId: account.login_id,
        roleIds: rbac.roleIds,
        roleNames: rbac.roleNames
    });
    return {
        id: account.id,
        username: account.login_id,
        nickname: account.nick_name || account.login_id,
        role: isSuperAdmin ? '超级管理员' : (rbac.roleNames[0] || '普通用户'),
        roleIds: rbac.roleIds,
        roleNames: rbac.roleNames,
        permissionIds: rbac.permissionIds,
        permissionPaths: rbac.permissionPaths,
        permissionCodes: rbac.permissionCodes,
        isSuperAdmin
    };
};

const ensureAuthedUser = (req, res) => {
    if (req.user?.id) return true;
    const token = extractToken(req);
    if (!token) {
        apiErr(res, req, 401, '未登录或登录已过期');
        return false;
    }
    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch {
        apiErr(res, req, 401, '登录状态无效，请重新登录');
        return false;
    }
    const db = readDb();
    const account = db.system.accounts.find(a => Number(a.id) === Number(payload.id));
    if (!account) {
        apiErr(res, req, 401, '用户不存在');
        return false;
    }
    if (Number(account.status) !== 1) {
        apiErr(res, req, 403, '账号已停用');
        return false;
    }
    const rbac = buildRbacContext(db, account.id);
    req.user = sanitizeUser(account, rbac);
    return true;
};

const authRequired = (req, res, next) => {
    if (!ensureAuthedUser(req, res)) return;
    next();
};

const superAdminRequired = (req, res, next) => {
    if (!ensureAuthedUser(req, res)) return;
    if (req.user.isSuperAdmin) return next();

    const masterPermissionPath = resolveMasterPermissionPath(req);
    if (masterPermissionPath) {
        if (userHasPermissionPath(req, masterPermissionPath)) return next();
        return apiErr(res, req, 403, '无权限访问该接口');
    }

    return apiErr(res, req, 403, '仅超级管理员可访问');
};

const apiPermissionRequired = (req, res, next) => {
    const apiPath = normalizePath(req.path || '/');
    if (apiPath.startsWith('/profile/')) return next();
    if (OPEN_API_PATHS.has(apiPath)) return next();
    if (!ensureAuthedUser(req, res)) return;

    if (apiPath.startsWith('/master')) {
        return next();
    }

    const requiredPath = resolveApiPermissionPath(apiPath);
    if (!requiredPath || req.user.isSuperAdmin) return next();
    if (!userHasPermissionPath(req, requiredPath)) return apiErr(res, req, 403, '无权限访问该接口');
    next();
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (!['.xlsx', '.xls'].includes(ext)) {
            const err = new Error('仅支持上传 Excel 文件');
            err.statusCode = 400;
            return cb(err);
        }
        return cb(null, true);
    }
});

app.set('trust proxy', 1);
app.use((req, res, next) => {
    req.traceId = createTraceId();
    res.setHeader('x-trace-id', req.traceId);
    next();
});
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', (req, res, next) => {
    const beginAt = Date.now();
    res.on('finish', () => {
        const routePath = normalizePath(String(req.path || '').split('?')[0]);
        if (!routePath || routePath === '/ping') return;
        const durationMs = Date.now() - beginAt;
        pushRuntimeApiMetric({
            path: routePath,
            method: req.method || 'GET',
            status: res.statusCode,
            duration_ms: durationMs,
            trace_id: req.traceId || '',
            created_at: nowIso()
        });
    });
    next();
});
app.use('/api', rateLimit({
    windowMs: Number(process.env.API_LIMIT_WINDOW_MS || 60 * 1000),
    max: Number(process.env.API_LIMIT_MAX || 400),
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 429, msg: '请求过于频繁，请稍后再试' }
}));
app.use('/api', apiPermissionRequired);

app.get('/api/ping', (req, res) => apiOk(res, req, { now: nowIso(), storage: 'local-json' }, '服务可用'));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return apiErr(res, req, 400, '账号和密码不能为空');
    const db = readDb();
    const account = db.system.accounts.find(a => a.login_id === username);
    if (!account) {
        appendOperationLog(req, {
            moduleCode: 'auth',
            bizObjectType: 'account',
            bizObjectId: username || '',
            actionType: 'LOGIN',
            resultStatus: 'FAILED',
            message: `登录失败，账号不存在 ${username}`,
            requestSummary: { username }
        });
        appendSecurityLog(req, {
            eventType: 'LOGIN',
            actionType: 'LOGIN_FAIL',
            username,
            result: 'FAILED',
            moduleCode: 'auth',
            message: `账号不存在：${username}`,
            metadata: { reason: 'ACCOUNT_NOT_FOUND' }
        });
        return apiErr(res, req, 401, '账号或密码错误');
    }
    const passOk = (account.password_hash && bcrypt.compareSync(String(password), String(account.password_hash))) || String(password) === String(account.password_hash);
    if (!passOk) {
        appendOperationLog(req, {
            moduleCode: 'auth',
            bizObjectType: 'account',
            bizObjectId: account.id,
            actionType: 'LOGIN',
            resultStatus: 'FAILED',
            message: `登录失败，密码错误 ${username}`,
            requestSummary: { username }
        });
        appendSecurityLog(req, {
            eventType: 'LOGIN',
            actionType: 'LOGIN_FAIL',
            username,
            userId: account.id,
            result: 'FAILED',
            moduleCode: 'auth',
            message: `密码错误：${username}`,
            metadata: { reason: 'WRONG_PASSWORD' }
        });
        return apiErr(res, req, 401, '账号或密码错误');
    }
    if (Number(account.status) !== 1) {
        appendOperationLog(req, {
            moduleCode: 'auth',
            bizObjectType: 'account',
            bizObjectId: account.id,
            actionType: 'LOGIN',
            resultStatus: 'FAILED',
            message: `登录失败，账号停用 ${username}`,
            requestSummary: { username }
        });
        appendSecurityLog(req, {
            eventType: 'LOGIN',
            actionType: 'LOGIN_FAIL',
            username,
            userId: account.id,
            result: 'FAILED',
            moduleCode: 'auth',
            message: `账号已停用：${username}`,
            metadata: { reason: 'ACCOUNT_DISABLED' }
        });
        return apiErr(res, req, 403, '该账号已被停用');
    }
    const rbac = buildRbacContext(db, account.id);
    const userPayload = sanitizeUser(account, rbac);
    const token = jwt.sign({ id: account.id, username: account.login_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    req.user = userPayload;
    appendOperationLog(req, {
        moduleCode: 'auth',
        bizObjectType: 'account',
        bizObjectId: account.id,
        actionType: 'LOGIN',
        message: `用户登录 ${account.login_id}`,
        requestSummary: { username }
    });
    appendSecurityLog(req, {
        eventType: 'LOGIN',
        actionType: 'LOGIN_SUCCESS',
        username,
        userId: account.id,
        result: 'SUCCESS',
        moduleCode: 'auth',
        message: `登录成功：${username}`
    });
    apiOk(res, req, { ...userPayload, token }, '登录成功');
});

app.get('/api/me', authRequired, (req, res) => apiOk(res, req, req.user, '获取成功'));

app.get('/api/admin/helper-code', superAdminRequired, (req, res) => {
    const db = readDb();
    apiOk(res, req, {
        helperCode: db.meta.helper_code,
        updatedAt: db.meta.helper_code_updated_at
    }, '获取成功');
});

app.post('/api/admin/refresh-helper-code', superAdminRequired, (req, res) => {
    let helperCode = '';
    updateDb((db) => {
        helperCode = String(Math.floor(100000 + Math.random() * 900000));
        db.meta.helper_code = helperCode;
        db.meta.helper_code_updated_at = nowIso();
    });
    apiOk(res, req, { helperCode }, '刷新成功');
});

app.post('/api/admin/verify-helper-code', (req, res) => {
    const { helperCode } = req.body || {};
    if (!helperCode) return apiErr(res, req, 400, '辅助动态码不能为空');
    const db = readDb();
    if (String(helperCode) !== String(db.meta.helper_code)) return apiErr(res, req, 400, '辅助动态码错误');
    apiOk(res, req, { passed: true }, '校验成功');
});

app.post('/api/sms/send-code', (req, res) => {
    const { username, mobile } = req.body || {};
    if (!username || !mobile) return apiErr(res, req, 400, '用户名和手机号不能为空');
    const db = readDb();
    const account = db.system.accounts.find(a => a.login_id === username);
    if (!account) return apiErr(res, req, 404, '账号不存在');
    if (String(account.mobile) !== String(mobile)) return apiErr(res, req, 400, '手机号与账号不匹配');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    updateDb((raw) => {
        raw.meta.sms_codes[username] = {
            code,
            mobile: String(mobile),
            expires_at: Date.now() + 5 * 60 * 1000,
            verified: false,
            updated_at: nowIso()
        };
    });
    const data = { sent: true };
    if ((process.env.NODE_ENV || '').toLowerCase() !== 'production') data.debugCode = code;
    apiOk(res, req, data, '验证码已发送');
});

app.post('/api/sms/verify-code', (req, res) => {
    const { username, smsCode } = req.body || {};
    if (!username || !smsCode) return apiErr(res, req, 400, '参数不完整');
    const db = readDb();
    const record = db.meta.sms_codes[username];
    if (!record) return apiErr(res, req, 400, '请先获取验证码');
    if (Date.now() > Number(record.expires_at || 0)) return apiErr(res, req, 400, '验证码已过期');
    if (String(record.code) !== String(smsCode)) return apiErr(res, req, 400, '验证码错误');
    updateDb((raw) => {
        raw.meta.sms_codes[username] = { ...raw.meta.sms_codes[username], verified: true, verified_at: nowIso() };
    });
    apiOk(res, req, { verified: true }, '验证成功');
});

app.post('/api/reset-password', (req, res) => {
    const { username, smsCode, helperCode, newPassword } = req.body || {};
    if (!username || !smsCode || !helperCode || !newPassword) return apiErr(res, req, 400, '参数不完整');
    if (String(newPassword).length < 6) return apiErr(res, req, 400, '密码长度不能少于6位');
    const db = readDb();
    const account = db.system.accounts.find(a => a.login_id === username);
    if (!account) return apiErr(res, req, 404, '账号不存在');
    const sms = db.meta.sms_codes[username];
    if (!sms || String(sms.code) !== String(smsCode) || Date.now() > Number(sms.expires_at || 0)) return apiErr(res, req, 400, '短信验证码无效');
    if (String(helperCode) !== String(db.meta.helper_code)) return apiErr(res, req, 400, '辅助动态码错误');
    updateDb((raw) => {
        const target = raw.system.accounts.find(a => Number(a.id) === Number(account.id));
        target.password_hash = bcrypt.hashSync(String(newPassword), 10);
        delete raw.meta.sms_codes[username];
    });
    appendOperationLog(req, {
        moduleCode: 'auth',
        bizObjectType: 'account',
        bizObjectId: account.id,
        actionType: 'RESET_PASSWORD',
        message: `重置密码 ${username}`,
        requestSummary: { username, smsCode: '***', helperCode: '***' }
    });
    appendSecurityLog(req, {
        eventType: 'PASSWORD_RESET',
        actionType: 'RESET_PASSWORD',
        username,
        userId: account.id,
        result: 'SUCCESS',
        moduleCode: 'auth',
        message: `密码重置成功：${username}`
    });
    apiOk(res, req, { changed: true }, '密码重置成功');
});
const accountToListRow = (db, account) => {
    const roleIds = getRoleIdsByAccount(db, account.id);
    const postIds = getPostIdsByAccount(db, account.id);
    return {
        ...account,
        role_ids: roleIds.join(','),
        post_ids: postIds.join(',')
    };
};

app.get('/api/accounts', authRequired, (req, res) => {
    const db = readDb();
    const list = db.system.accounts.map(a => accountToListRow(db, a)).sort((a, b) => Number(a.id) - Number(b.id));
    apiOk(res, req, list, '获取成功');
});

app.post('/api/register', (req, res) => {
    const { username, password, nickname, phone, email, deptId, status, roleIds, postIds } = req.body || {};
    if (!username || !password) return apiErr(res, req, 400, '用户名和密码不能为空');
    let normalizedUsername = '';
    let normalizedNickname = '';
    let normalizedPhone = '';
    let normalizedEmail = '';
    let created = null;
    try {
        normalizedUsername = String(username || '').trim();
        normalizedNickname = String(nickname || username || '').trim();
        normalizedPhone = validatePhoneOrThrow(phone);
        normalizedEmail = validateEmailOrThrow(email);
        updateDb((db) => {
            if (db.system.accounts.some(a => a.login_id === normalizedUsername)) throw new Error('用户名已存在');
            const id = nextId(db.system.accounts);
            created = {
                id,
                login_id: normalizedUsername,
                nick_name: normalizedNickname,
                password_hash: bcrypt.hashSync(String(password), 10),
                mobile: normalizedPhone,
                email: normalizedEmail,
                department_id: String(deptId || '100'),
                status: toNum(status, 1),
                created_time: nowIso()
            };
            db.system.accounts.push(created);
            (Array.isArray(roleIds) ? roleIds : []).map(Number).filter(v => !Number.isNaN(v)).forEach(roleId => {
                db.system.account_roles.push({ account_id: id, role_id: roleId });
            });
            (Array.isArray(postIds) ? postIds : []).forEach(jobId => {
                db.system.account_posts.push({ account_id: id, job_id: String(jobId) });
            });
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '创建失败');
    }
    if (!created) return apiErr(res, req, 500, '创建失败');
    appendOperationLog(req, {
        moduleCode: 'account',
        bizObjectType: 'account',
        bizObjectId: created.id,
        actionType: 'CREATE',
        message: `注册用户 ${created.login_id}`,
        requestSummary: { username: normalizedUsername, nickname: normalizedNickname, phone: normalizedPhone, email: normalizedEmail, deptId, roleIds, postIds },
        afterSnapshot: created
    });
    apiOk(res, req, { id: created.id }, '注册成功');
});

app.put('/api/accounts/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const payload = req.body || {};
    let updated = false;
    let beforeSnapshot = null;
    let afterSnapshot = null;
    try {
        updateDb((db) => {
            const account = db.system.accounts.find(a => Number(a.id) === id);
            if (!account) throw new Error('用户不存在');
            beforeSnapshot = safeClone(account);
            account.login_id = payload.username ? String(payload.username).trim() : account.login_id;
            account.nick_name = payload.nickname ? String(payload.nickname).trim() : account.nick_name;
            if (payload.phone !== undefined) {
                account.mobile = validatePhoneOrThrow(payload.phone);
            }
            if (payload.email !== undefined) {
                account.email = validateEmailOrThrow(payload.email);
            }
            account.department_id = payload.deptId !== undefined ? String(payload.deptId) : account.department_id;
            account.status = payload.status !== undefined ? toNum(payload.status, 1) : account.status;
            if (payload.password) account.password_hash = bcrypt.hashSync(String(payload.password), 10);
            if (Array.isArray(payload.roleIds)) {
                db.system.account_roles = db.system.account_roles.filter(r => Number(r.account_id) !== id);
                payload.roleIds.map(Number).filter(v => !Number.isNaN(v)).forEach(roleId => {
                    db.system.account_roles.push({ account_id: id, role_id: roleId });
                });
            }
            if (Array.isArray(payload.postIds)) {
                db.system.account_posts = db.system.account_posts.filter(r => Number(r.account_id) !== id);
                payload.postIds.forEach(jobId => db.system.account_posts.push({ account_id: id, job_id: String(jobId) }));
            }
            afterSnapshot = safeClone(account);
            updated = true;
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '更新失败');
    }
    if (!updated) return apiErr(res, req, 500, '更新失败');
    appendOperationLog(req, {
        moduleCode: 'account',
        bizObjectType: 'account',
        bizObjectId: id,
        actionType: 'UPDATE',
        message: `更新用户 ${afterSnapshot?.login_id || id}`,
        requestSummary: payload,
        beforeSnapshot,
        afterSnapshot
    });
    if (Array.isArray(payload.roleIds)) {
        appendSecurityLog(req, {
            eventType: 'PERMISSION_CHANGE',
            actionType: 'ACCOUNT_ROLE_UPDATE',
            username: afterSnapshot?.login_id || '',
            userId: id,
            result: 'SUCCESS',
            moduleCode: 'account',
            message: `变更用户角色：${afterSnapshot?.login_id || id}`,
            metadata: {
                accountId: id,
                accountName: afterSnapshot?.login_id || '',
                roleCount: payload.roleIds.length
            }
        });
    }
    apiOk(res, req, true, '更新成功');
});

app.put('/api/accounts/:id/status', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const { status } = req.body || {};
    let found = false;
    let beforeSnapshot = null;
    let afterSnapshot = null;
    updateDb((db) => {
        const account = db.system.accounts.find(a => Number(a.id) === id);
        if (!account) return;
        beforeSnapshot = safeClone(account);
        account.status = toNum(status, account.status);
        afterSnapshot = safeClone(account);
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '用户不存在');
    appendOperationLog(req, {
        moduleCode: 'account',
        bizObjectType: 'account',
        bizObjectId: id,
        actionType: 'STATUS_CHANGE',
        message: `变更用户状态 ${afterSnapshot?.login_id || id}`,
        requestSummary: { status },
        beforeSnapshot,
        afterSnapshot
    });
    apiOk(res, req, true, '状态更新成功');
});

app.delete('/api/accounts/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const db = readDb();
    const account = db.system.accounts.find(a => Number(a.id) === id);
    if (!account) return apiErr(res, req, 404, '用户不存在');
    if (SUPER_ADMIN_LOGIN_IDS.has(account.login_id)) return apiErr(res, req, 400, '超级管理员账号不可删除');
    updateDb((raw) => {
        raw.system.accounts = raw.system.accounts.filter(a => Number(a.id) !== id);
        raw.system.account_roles = raw.system.account_roles.filter(a => Number(a.account_id) !== id);
        raw.system.account_posts = raw.system.account_posts.filter(a => Number(a.account_id) !== id);
    });
    appendOperationLog(req, {
        moduleCode: 'account',
        bizObjectType: 'account',
        bizObjectId: id,
        actionType: 'DELETE',
        message: `删除用户 ${account.login_id}`,
        beforeSnapshot: account
    });
    apiOk(res, req, true, '删除成功');
});

app.get('/api/departments', authRequired, (req, res) => {
    const db = readDb();
    const rows = [...db.system.departments].sort((a, b) => toNum(a.level) - toNum(b.level) || toNum(a.sort_no) - toNum(b.sort_no));
    apiOk(res, req, rows, '获取成功');
});

app.post('/api/departments', authRequired, (req, res) => {
    const body = req.body || {};
    if (!body.label) return apiErr(res, req, 400, '部门名称不能为空');
    let createdRow = null;
    updateDb((db) => {
        const id = String(body.id || nextId(db.system.departments));
        const parent = String(body.parentId || '0');
        const levelMap = { center: 1, department: 2, team: 3 };
        const level = levelMap[body.type] || 3;
        createdRow = {
            id,
            department_mark: `DEP-${id}`,
            department_name: String(body.label),
            department_code: `CODE-${id}`,
            sub_company_id: '1',
            sup_dep_id: parent,
            sup_dep_ids: parent === '0' ? '0' : `0,${parent}`,
            level,
            sort_no: toNum(body.sort, 0),
            leader: String(body.leader || ''),
            phone: String(body.phone || ''),
            email: String(body.email || ''),
            created_time: nowIso()
        };
        db.system.departments.push(createdRow);
    });
    appendOperationLog(req, {
        moduleCode: 'department',
        bizObjectType: 'department',
        bizObjectId: createdRow?.id,
        actionType: 'CREATE',
        message: `新增部门 ${createdRow?.department_name || ''}`,
        requestSummary: body,
        afterSnapshot: createdRow
    });
    apiOk(res, req, true, '新增成功');
});

app.put('/api/departments/:id', authRequired, (req, res) => {
    const id = String(req.params.id);
    const body = req.body || {};
    let found = false;
    let beforeSnapshot = null;
    let afterSnapshot = null;
    updateDb((db) => {
        const row = db.system.departments.find(d => String(d.id) === id);
        if (!row) return;
        const levelMap = { center: 1, department: 2, team: 3 };
        beforeSnapshot = safeClone(row);
        row.department_name = body.label !== undefined ? String(body.label) : row.department_name;
        row.level = body.type ? (levelMap[body.type] || row.level) : row.level;
        row.sort_no = body.sort !== undefined ? toNum(body.sort, row.sort_no) : row.sort_no;
        row.leader = body.leader !== undefined ? String(body.leader) : row.leader;
        row.phone = body.phone !== undefined ? String(body.phone) : row.phone;
        row.email = body.email !== undefined ? String(body.email) : row.email;
        afterSnapshot = safeClone(row);
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '部门不存在');
    appendOperationLog(req, {
        moduleCode: 'department',
        bizObjectType: 'department',
        bizObjectId: id,
        actionType: 'UPDATE',
        message: `更新部门 ${afterSnapshot?.department_name || id}`,
        requestSummary: body,
        beforeSnapshot,
        afterSnapshot
    });
    apiOk(res, req, true, '更新成功');
});

app.delete('/api/departments/:id', authRequired, (req, res) => {
    const id = String(req.params.id);
    const db = readDb();
    const target = db.system.departments.find(d => String(d.id) === id);
    if (!target) return apiErr(res, req, 404, '部门不存在');
    if (db.system.departments.some(d => String(d.sup_dep_id) === id)) return apiErr(res, req, 400, '该部门下存在子部门，请先删除子部门');
    if (db.system.accounts.some(a => String(a.department_id) === id)) return apiErr(res, req, 400, '该部门下仍有关联用户，无法删除');
    updateDb((raw) => {
        raw.system.departments = raw.system.departments.filter(d => String(d.id) !== id);
    });
    appendOperationLog(req, {
        moduleCode: 'department',
        bizObjectType: 'department',
        bizObjectId: id,
        actionType: 'DELETE',
        message: `删除部门 ${target.department_name || id}`,
        beforeSnapshot: target
    });
    apiOk(res, req, true, '删除成功');
});

app.get('/api/jobtitles', authRequired, (req, res) => {
    const db = readDb();
    const rows = [...db.system.jobtitles].sort((a, b) => toNum(a.sort_no) - toNum(b.sort_no));
    apiOk(res, req, rows, '获取成功');
});

app.post('/api/jobtitles', authRequired, (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.code || !body.deptId) return apiErr(res, req, 400, '岗位名称、编码、部门不能为空');
    let createdRow = null;
    updateDb((db) => {
        const id = String(body.id || `J${Date.now()}`);
        createdRow = {
            id,
            job_title_mark: String(body.code),
            job_title_name: String(body.name),
            job_department_id: String(body.deptId),
            status: toNum(body.status, 1),
            sort_no: toNum(body.sort, 0),
            remark: String(body.remark || ''),
            created_time: nowIso()
        };
        db.system.jobtitles.push(createdRow);
    });
    appendOperationLog(req, {
        moduleCode: 'jobtitle',
        bizObjectType: 'jobtitle',
        bizObjectId: createdRow?.id,
        actionType: 'CREATE',
        message: `新增岗位 ${createdRow?.job_title_name || ''}`,
        requestSummary: body,
        afterSnapshot: createdRow
    });
    apiOk(res, req, true, '新增成功');
});

app.put('/api/jobtitles/:id', authRequired, (req, res) => {
    const id = String(req.params.id);
    const body = req.body || {};
    let found = false;
    let beforeSnapshot = null;
    let afterSnapshot = null;
    updateDb((db) => {
        const row = db.system.jobtitles.find(j => String(j.id) === id);
        if (!row) return;
        beforeSnapshot = safeClone(row);
        row.job_title_mark = body.code !== undefined ? String(body.code) : row.job_title_mark;
        row.job_title_name = body.name !== undefined ? String(body.name) : row.job_title_name;
        row.job_department_id = body.deptId !== undefined ? String(body.deptId) : row.job_department_id;
        row.status = body.status !== undefined ? toNum(body.status, row.status) : row.status;
        row.sort_no = body.sort !== undefined ? toNum(body.sort, row.sort_no) : row.sort_no;
        row.remark = body.remark !== undefined ? String(body.remark) : row.remark;
        afterSnapshot = safeClone(row);
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '岗位不存在');
    appendOperationLog(req, {
        moduleCode: 'jobtitle',
        bizObjectType: 'jobtitle',
        bizObjectId: id,
        actionType: 'UPDATE',
        message: `更新岗位 ${afterSnapshot?.job_title_name || id}`,
        requestSummary: body,
        beforeSnapshot,
        afterSnapshot
    });
    apiOk(res, req, true, '更新成功');
});

app.delete('/api/jobtitles/:id', authRequired, (req, res) => {
    const id = String(req.params.id);
    const db = readDb();
    const target = db.system.jobtitles.find(j => String(j.id) === id);
    if (!target) return apiErr(res, req, 404, '岗位不存在');
    if (db.system.account_posts.some(ap => String(ap.job_id) === id)) return apiErr(res, req, 400, '该岗位已被用户关联，无法删除');
    updateDb((raw) => {
        raw.system.jobtitles = raw.system.jobtitles.filter(j => String(j.id) !== id);
        raw.system.role_jobs = raw.system.role_jobs.filter(j => String(j.job_id) !== id);
    });
    appendOperationLog(req, {
        moduleCode: 'jobtitle',
        bizObjectType: 'jobtitle',
        bizObjectId: id,
        actionType: 'DELETE',
        message: `删除岗位 ${target.job_title_name || id}`,
        beforeSnapshot: target
    });
    apiOk(res, req, true, '删除成功');
});

app.get('/api/permissions', authRequired, (req, res) => {
    const db = readDb();
    apiOk(res, req, [...db.system.pages].sort((a, b) => toNum(a.sort_no) - toNum(b.sort_no)), '获取成功');
});

app.get('/api/dict/types', authRequired, (req, res) => {
    const { keyword = '', status = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.dict_types);
    if (keyword) rows = rows.filter((row) => contains(row.dict_type_code, keyword) || contains(row.dict_type_name, keyword));
    if (status !== '' && status !== undefined) rows = rows.filter((row) => String(row.status) === String(status));
    rows = [...rows].sort((a, b) => toNum(a.sort_order) - toNum(b.sort_order) || toNum(a.id) - toNum(b.id));
    apiOk(res, req, rows, '获取成功');
});

app.post('/api/dict/types', authRequired, (req, res) => {
    const body = req.body || {};
    const dictTypeCode = normalizeDictCode(body.dict_type_code);
    const dictTypeName = String(body.dict_type_name || '').trim();
    if (!dictTypeCode || !dictTypeName) return apiErr(res, req, 400, '字典类型编码和名称不能为空');
    try {
        validateDictCodeOrThrow(dictTypeCode, '字典类型编码');
    } catch (error) {
        return apiErr(res, req, 400, error.message || '字典类型编码格式不正确');
    }
    let createdRow = null;
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const rows = ensureArray(db.platform.dict_types);
            db.platform.dict_types = rows;
            if (rows.some((row) => normalizeDictCode(row.dict_type_code) === dictTypeCode)) throw new Error('字典类型编码已存在');
            createdRow = {
                id: nextId(rows),
                dict_type_code: dictTypeCode,
                dict_type_name: dictTypeName,
                status: normalizeBinaryStatus(body.status, 1),
                sort_order: Math.max(1, toNum(body.sort_order, rows.length + 1)),
                remark: String(body.remark || ''),
                system_flag: 0,
                created_at: nowIso(),
                updated_at: nowIso()
            };
            rows.push(createdRow);
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '新增失败');
    }
    appendOperationLog(req, {
        moduleCode: 'dict',
        bizObjectType: 'dict_type',
        bizObjectId: createdRow?.id,
        actionType: 'CREATE',
        message: `新增字典类型 ${createdRow?.dict_type_code || ''}`,
        afterSnapshot: createdRow
    });
    apiOk(res, req, createdRow, '新增成功');
});

app.put('/api/dict/types/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    let beforeSnapshot = null;
    let afterSnapshot = null;
    let linkedItemCount = 0;
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const typeRows = ensureArray(db.platform.dict_types);
            const itemRows = ensureArray(db.platform.dict_items);
            db.platform.dict_types = typeRows;
            db.platform.dict_items = itemRows;
            const row = typeRows.find((item) => Number(item.id) === id);
            if (!row) throw new Error('字典类型不存在');
            beforeSnapshot = safeClone(row);
            const currentDictTypeCode = normalizeDictCode(row.dict_type_code);
            let nextDictTypeCode = currentDictTypeCode;
            if (body.dict_type_code !== undefined) {
                nextDictTypeCode = normalizeDictCode(body.dict_type_code);
                if (!nextDictTypeCode) throw new Error('字典类型编码不能为空');
                validateDictCodeOrThrow(nextDictTypeCode, '字典类型编码');
                if (
                    nextDictTypeCode !== currentDictTypeCode &&
                    typeRows.some((item) => Number(item.id) !== id && normalizeDictCode(item.dict_type_code) === nextDictTypeCode)
                ) {
                    throw new Error('字典类型编码已存在');
                }
                if (toNum(row.system_flag, 0) === 1 && nextDictTypeCode !== currentDictTypeCode) {
                    throw new Error('系统内置字典类型不允许修改编码');
                }
            }
            if (body.dict_type_name !== undefined && !String(body.dict_type_name).trim()) throw new Error('字典类型名称不能为空');
            if (nextDictTypeCode !== currentDictTypeCode) {
                itemRows.forEach((item) => {
                    if (normalizeDictCode(item.dict_type_code) !== currentDictTypeCode) return;
                    item.dict_type_code = nextDictTypeCode;
                    item.updated_at = nowIso();
                    linkedItemCount += 1;
                });
            }
            row.dict_type_code = nextDictTypeCode;
            row.dict_type_name = body.dict_type_name !== undefined ? String(body.dict_type_name).trim() : row.dict_type_name;
            row.status = body.status !== undefined ? normalizeBinaryStatus(body.status, row.status) : row.status;
            row.sort_order = body.sort_order !== undefined ? Math.max(1, toNum(body.sort_order, row.sort_order)) : row.sort_order;
            row.remark = body.remark !== undefined ? String(body.remark) : row.remark;
            row.updated_at = nowIso();
            afterSnapshot = safeClone(row);
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '更新失败');
    }
    appendOperationLog(req, {
        moduleCode: 'dict',
        bizObjectType: 'dict_type',
        bizObjectId: id,
        actionType: 'UPDATE',
        message: `更新字典类型 ${afterSnapshot?.dict_type_code || ''}${linkedItemCount ? `，级联更新${linkedItemCount}个字典项` : ''}`,
        beforeSnapshot,
        afterSnapshot
    });
    apiOk(res, req, afterSnapshot, '更新成功');
});

app.delete('/api/dict/types/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    let beforeSnapshot = null;
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const typeRows = ensureArray(db.platform.dict_types);
            const itemRows = ensureArray(db.platform.dict_items);
            db.platform.dict_types = typeRows;
            db.platform.dict_items = itemRows;
            const row = typeRows.find((item) => Number(item.id) === id);
            if (!row) throw new Error('字典类型不存在');
            if (toNum(row.system_flag, 0) === 1) throw new Error('系统内置字典类型不可删除');
            const typeCode = normalizeDictCode(row.dict_type_code);
            if (itemRows.some((item) => normalizeDictCode(item.dict_type_code) === typeCode)) throw new Error('该字典类型下仍有字典项，无法删除');
            beforeSnapshot = safeClone(row);
            db.platform.dict_types = typeRows.filter((item) => Number(item.id) !== id);
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '删除失败');
    }
    appendOperationLog(req, {
        moduleCode: 'dict',
        bizObjectType: 'dict_type',
        bizObjectId: id,
        actionType: 'DELETE',
        message: `删除字典类型 ${beforeSnapshot?.dict_type_code || ''}`,
        beforeSnapshot
    });
    apiOk(res, req, true, '删除成功');
});

app.patch('/api/dict/types/batch-status', authRequired, (req, res) => {
    const body = req.body || {};
    const ids = parseBatchIds(body.ids);
    if (!ids.length) return apiErr(res, req, 400, '请至少选择一条字典类型记录');
    if (body.status === '' || body.status === undefined || body.status === null) return apiErr(res, req, 400, '状态参数不能为空');
    const targetStatus = normalizeBinaryStatus(body.status, -1);
    if (targetStatus !== 0 && targetStatus !== 1) return apiErr(res, req, 400, '状态参数仅支持0或1');

    const beforeSnapshots = [];
    const afterSnapshots = [];
    const skipped = [];
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const rows = ensureArray(db.platform.dict_types);
            db.platform.dict_types = rows;
            ids.forEach((id) => {
                const row = rows.find((item) => Number(item.id) === id);
                if (!row) {
                    skipped.push({ id, reason: 'NOT_FOUND' });
                    return;
                }
                if (toNum(row.system_flag, 0) === 1 && targetStatus === 0) {
                    skipped.push({ id, reason: 'SYSTEM_BUILTIN' });
                    return;
                }
                if (toNum(row.status, 1) === targetStatus) {
                    skipped.push({ id, reason: 'UNCHANGED' });
                    return;
                }
                beforeSnapshots.push(safeClone(row));
                row.status = targetStatus;
                row.updated_at = nowIso();
                afterSnapshots.push(safeClone(row));
            });
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '批量更新失败');
    }

    if (afterSnapshots.length) {
        appendOperationLog(req, {
            moduleCode: 'dict',
            bizObjectType: 'dict_type',
            bizObjectId: ids.join(','),
            actionType: 'UPDATE',
            message: `批量${targetStatus === 1 ? '启用' : '停用'}字典类型，成功${afterSnapshots.length}条`,
            requestSummary: { ids, status: targetStatus, skipped },
            beforeSnapshot: beforeSnapshots,
            afterSnapshot: afterSnapshots
        });
    }

    apiOk(res, req, {
        updatedCount: afterSnapshots.length,
        skippedCount: skipped.length,
        skipped,
        updatedIds: afterSnapshots.map((row) => row.id)
    }, `批量处理完成，成功${afterSnapshots.length}条`);
});

app.get('/api/dict/items', authRequired, (req, res) => {
    const { dictTypeCode = '', keyword = '', status = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.dict_items);
    if (dictTypeCode) {
        const normalizedTypeCode = normalizeDictCode(dictTypeCode);
        rows = rows.filter((row) => normalizeDictCode(row.dict_type_code) === normalizedTypeCode);
    }
    if (keyword) rows = rows.filter((row) => contains(row.item_code, keyword) || contains(row.item_name, keyword) || contains(row.item_value, keyword));
    if (status !== '' && status !== undefined) rows = rows.filter((row) => String(row.status) === String(status));
    rows = [...rows].sort((a, b) => toNum(a.sort_order) - toNum(b.sort_order) || toNum(a.id) - toNum(b.id));
    apiOk(res, req, rows, '获取成功');
});

app.post('/api/dict/items', authRequired, (req, res) => {
    const body = req.body || {};
    const dictTypeCode = normalizeDictCode(body.dict_type_code);
    const itemCode = normalizeDictCode(body.item_code);
    const itemName = String(body.item_name || '').trim();
    if (!dictTypeCode || !itemCode || !itemName) return apiErr(res, req, 400, '字典类型、字典项编码、字典项名称不能为空');
    try {
        validateDictCodeOrThrow(dictTypeCode, '字典类型编码');
        validateDictCodeOrThrow(itemCode, '字典项编码');
    } catch (error) {
        return apiErr(res, req, 400, error.message || '编码格式不正确');
    }
    let createdRow = null;
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const typeRows = ensureArray(db.platform.dict_types);
            const itemRows = ensureArray(db.platform.dict_items);
            db.platform.dict_types = typeRows;
            db.platform.dict_items = itemRows;
            const dictTypeRow = typeRows.find((row) => normalizeDictCode(row.dict_type_code) === dictTypeCode);
            if (!dictTypeRow) throw new Error('字典类型不存在');
            if (itemRows.some((row) => normalizeDictCode(row.dict_type_code) === dictTypeCode && normalizeDictCode(row.item_code) === itemCode)) {
                throw new Error('字典项编码已存在');
            }
            createdRow = {
                id: nextId(itemRows),
                dict_type_code: String(dictTypeRow.dict_type_code || dictTypeCode),
                item_code: itemCode,
                item_name: itemName,
                item_value: String(body.item_value || itemCode).trim(),
                item_color: String(body.item_color || ''),
                sort_order: Math.max(1, toNum(body.sort_order, itemRows.length + 1)),
                status: normalizeBinaryStatus(body.status, 1),
                remark: String(body.remark || ''),
                system_flag: 0,
                created_at: nowIso(),
                updated_at: nowIso()
            };
            itemRows.push(createdRow);
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '新增失败');
    }
    appendOperationLog(req, {
        moduleCode: 'dict',
        bizObjectType: 'dict_item',
        bizObjectId: createdRow?.id,
        actionType: 'CREATE',
        message: `新增字典项 ${createdRow?.dict_type_code || ''}:${createdRow?.item_code || ''}`,
        afterSnapshot: createdRow
    });
    apiOk(res, req, createdRow, '新增成功');
});

app.put('/api/dict/items/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    let beforeSnapshot = null;
    let afterSnapshot = null;
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const typeRows = ensureArray(db.platform.dict_types);
            const itemRows = ensureArray(db.platform.dict_items);
            db.platform.dict_types = typeRows;
            db.platform.dict_items = itemRows;
            const row = itemRows.find((item) => Number(item.id) === id);
            if (!row) throw new Error('字典项不存在');
            const currentDictTypeCode = normalizeDictCode(row.dict_type_code);
            const currentItemCode = normalizeDictCode(row.item_code);
            let nextDictTypeCode = currentDictTypeCode;
            let nextItemCode = currentItemCode;

            if (body.dict_type_code !== undefined) {
                nextDictTypeCode = normalizeDictCode(body.dict_type_code);
                if (!nextDictTypeCode) throw new Error('字典类型不能为空');
                validateDictCodeOrThrow(nextDictTypeCode, '字典类型编码');
            }
            if (body.item_code !== undefined) {
                nextItemCode = normalizeDictCode(body.item_code);
                if (!nextItemCode) throw new Error('字典项编码不能为空');
                validateDictCodeOrThrow(nextItemCode, '字典项编码');
                if (toNum(row.system_flag, 0) === 1 && nextItemCode !== currentItemCode) {
                    throw new Error('系统内置字典项不允许修改编码');
                }
            }
            const targetTypeRow = typeRows.find((item) => normalizeDictCode(item.dict_type_code) === nextDictTypeCode);
            if (!targetTypeRow) throw new Error('字典类型不存在');
            if (itemRows.some((item) => Number(item.id) !== id && normalizeDictCode(item.dict_type_code) === nextDictTypeCode && normalizeDictCode(item.item_code) === nextItemCode)) {
                throw new Error('字典项编码已存在');
            }
            if (body.item_name !== undefined && !String(body.item_name).trim()) throw new Error('字典项名称不能为空');
            beforeSnapshot = safeClone(row);
            row.dict_type_code = String(targetTypeRow.dict_type_code || nextDictTypeCode);
            row.item_code = nextItemCode;
            row.item_name = body.item_name !== undefined ? String(body.item_name).trim() : row.item_name;
            row.item_value = body.item_value !== undefined ? String(body.item_value).trim() || nextItemCode : row.item_value;
            row.item_color = body.item_color !== undefined ? String(body.item_color).trim() : row.item_color;
            row.sort_order = body.sort_order !== undefined ? Math.max(1, toNum(body.sort_order, row.sort_order)) : row.sort_order;
            row.status = body.status !== undefined ? normalizeBinaryStatus(body.status, row.status) : row.status;
            row.remark = body.remark !== undefined ? String(body.remark) : row.remark;
            row.updated_at = nowIso();
            afterSnapshot = safeClone(row);
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '更新失败');
    }
    appendOperationLog(req, {
        moduleCode: 'dict',
        bizObjectType: 'dict_item',
        bizObjectId: id,
        actionType: 'UPDATE',
        message: `更新字典项 ${afterSnapshot?.dict_type_code || ''}:${afterSnapshot?.item_code || ''}`,
        beforeSnapshot,
        afterSnapshot
    });
    apiOk(res, req, afterSnapshot, '更新成功');
});

app.delete('/api/dict/items/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    let beforeSnapshot = null;
    try {
        updateDb((db) => {
            const itemRows = ensureArray(db.platform?.dict_items);
            db.platform.dict_items = itemRows;
            const row = itemRows.find((item) => Number(item.id) === id);
            if (!row) throw new Error('字典项不存在');
            if (toNum(row.system_flag, 0) === 1) throw new Error('系统内置字典项不可删除');
            beforeSnapshot = safeClone(row);
            db.platform.dict_items = itemRows.filter((item) => Number(item.id) !== id);
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '删除失败');
    }
    appendOperationLog(req, {
        moduleCode: 'dict',
        bizObjectType: 'dict_item',
        bizObjectId: id,
        actionType: 'DELETE',
        message: `删除字典项 ${beforeSnapshot?.dict_type_code || ''}:${beforeSnapshot?.item_code || ''}`,
        beforeSnapshot
    });
    apiOk(res, req, true, '删除成功');
});

app.patch('/api/dict/items/batch-status', authRequired, (req, res) => {
    const body = req.body || {};
    const ids = parseBatchIds(body.ids);
    if (!ids.length) return apiErr(res, req, 400, '请至少选择一条字典项记录');
    if (body.status === '' || body.status === undefined || body.status === null) return apiErr(res, req, 400, '状态参数不能为空');
    const targetStatus = normalizeBinaryStatus(body.status, -1);
    if (targetStatus !== 0 && targetStatus !== 1) return apiErr(res, req, 400, '状态参数仅支持0或1');

    const beforeSnapshots = [];
    const afterSnapshots = [];
    const skipped = [];
    try {
        updateDb((db) => {
            if (!db.platform) db.platform = {};
            const rows = ensureArray(db.platform.dict_items);
            db.platform.dict_items = rows;
            ids.forEach((id) => {
                const row = rows.find((item) => Number(item.id) === id);
                if (!row) {
                    skipped.push({ id, reason: 'NOT_FOUND' });
                    return;
                }
                if (toNum(row.system_flag, 0) === 1 && targetStatus === 0) {
                    skipped.push({ id, reason: 'SYSTEM_BUILTIN' });
                    return;
                }
                if (toNum(row.status, 1) === targetStatus) {
                    skipped.push({ id, reason: 'UNCHANGED' });
                    return;
                }
                beforeSnapshots.push(safeClone(row));
                row.status = targetStatus;
                row.updated_at = nowIso();
                afterSnapshots.push(safeClone(row));
            });
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '批量更新失败');
    }

    if (afterSnapshots.length) {
        appendOperationLog(req, {
            moduleCode: 'dict',
            bizObjectType: 'dict_item',
            bizObjectId: ids.join(','),
            actionType: 'UPDATE',
            message: `批量${targetStatus === 1 ? '启用' : '停用'}字典项，成功${afterSnapshots.length}条`,
            requestSummary: { ids, status: targetStatus, skipped },
            beforeSnapshot: beforeSnapshots,
            afterSnapshot: afterSnapshots
        });
    }

    apiOk(res, req, {
        updatedCount: afterSnapshots.length,
        skippedCount: skipped.length,
        skipped,
        updatedIds: afterSnapshots.map((row) => row.id)
    }, `批量处理完成，成功${afterSnapshots.length}条`);
});

app.get('/api/dict/lookup', authRequired, (req, res) => {
    const { dictTypeCode = '' } = req.query || {};
    const normalizedTypeCode = normalizeDictCode(dictTypeCode);
    const db = readDb();
    const typeRows = ensureArray(db.platform?.dict_types)
        .filter((row) => toNum(row.status, 1) === 1)
        .filter((row) => !normalizedTypeCode || normalizeDictCode(row.dict_type_code) === normalizedTypeCode)
        .sort((a, b) => toNum(a.sort_order) - toNum(b.sort_order) || toNum(a.id) - toNum(b.id));
    const itemRows = ensureArray(db.platform?.dict_items)
        .filter((row) => toNum(row.status, 1) === 1)
        .sort((a, b) => toNum(a.sort_order) - toNum(b.sort_order) || toNum(a.id) - toNum(b.id));
    const list = typeRows.map((typeRow) => {
        const typeCode = normalizeDictCode(typeRow.dict_type_code);
        const options = itemRows
            .filter((itemRow) => normalizeDictCode(itemRow.dict_type_code) === typeCode)
            .map((itemRow) => ({
                id: itemRow.id,
                itemCode: itemRow.item_code,
                itemName: itemRow.item_name,
                itemValue: itemRow.item_value,
                itemColor: itemRow.item_color,
                sortOrder: itemRow.sort_order,
                remark: itemRow.remark || ''
            }));
        return {
            dictTypeCode: typeRow.dict_type_code,
            dictTypeName: typeRow.dict_type_name,
            options
        };
    });
    const map = {};
    list.forEach((group) => {
        map[group.dictTypeCode] = group.options;
    });
    apiOk(res, req, { list, map }, '获取成功');
});

const filterOperationLogRows = (rows, query = {}) => {
    const {
        keyword = '',
        moduleCode = '',
        actionType = '',
        resultStatus = '',
        operatorName = '',
        bizObjectType = '',
        bizObjectId = '',
        dateFrom = '',
        dateTo = ''
    } = query || {};
    let list = ensureArray(rows);
    if (keyword) list = list.filter((row) => contains(row.message, keyword) || contains(row.biz_object_type, keyword) || contains(row.biz_object_id, keyword));
    if (moduleCode) list = list.filter((row) => String(row.module_code) === String(moduleCode));
    if (actionType) list = list.filter((row) => String(row.action_type) === String(actionType));
    if (resultStatus) list = list.filter((row) => String(row.result_status) === String(resultStatus));
    if (operatorName) list = list.filter((row) => contains(row.operator_name, operatorName));
    if (bizObjectType) list = list.filter((row) => contains(row.biz_object_type, bizObjectType));
    if (bizObjectId) list = list.filter((row) => contains(row.biz_object_id, bizObjectId));
    if (dateFrom) list = list.filter((row) => String(row.created_at).slice(0, 10) >= String(dateFrom));
    if (dateTo) list = list.filter((row) => String(row.created_at).slice(0, 10) <= String(dateTo));
    return [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

app.get('/api/operation-logs', authRequired, (req, res) => {
    const { page = 1, pageSize = 20 } = req.query || {};
    const rows = filterOperationLogRows(readDb().platform?.operation_logs, req.query || {});
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
});

app.get('/api/operation-logs/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const row = ensureArray(readDb().platform?.operation_logs).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '日志不存在');
    apiOk(res, req, row, '获取成功');
});

app.get('/api/import-tasks', authRequired, (req, res) => {
    const { page = 1, pageSize = 20, bizType = '', status = '', keyword = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.import_tasks);
    if (bizType) rows = rows.filter((row) => String(row.biz_type) === String(bizType));
    if (status) rows = rows.filter((row) => String(row.status) === String(status));
    if (keyword) rows = rows.filter((row) => contains(row.task_name, keyword) || contains(row.file_name, keyword) || contains(row.operator_name, keyword));
    rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
});

app.get('/api/import-tasks/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const row = ensureArray(readDb().platform?.import_tasks).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '导入任务不存在');
    apiOk(res, req, row, '获取成功');
});

app.get('/api/export-tasks', authRequired, (req, res) => {
    const { page = 1, pageSize = 20, bizType = '', status = '', keyword = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.export_tasks);
    if (bizType) rows = rows.filter((row) => String(row.biz_type) === String(bizType));
    if (status) rows = rows.filter((row) => String(row.status) === String(status));
    if (keyword) rows = rows.filter((row) => contains(row.task_name, keyword) || contains(row.file_name, keyword) || contains(row.operator_name, keyword));
    rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
});

app.get('/api/export-tasks/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const row = ensureArray(readDb().platform?.export_tasks).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '导出任务不存在');
    apiOk(res, req, row, '获取成功');
});

app.get('/api/export-tasks/:id/download', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const row = ensureArray(readDb().platform?.export_tasks).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '导出任务不存在');
    const bizType = String(row.biz_type || '');
    const querySnapshot = row.query_snapshot && typeof row.query_snapshot === 'object' ? row.query_snapshot : {};
    const rows = buildExportRowsByBizType(bizType, querySnapshot);
    apiOk(res, req, {
        taskId: row.id,
        bizType,
        fileName: row.file_name || '',
        list: rows
    }, '获取成功');
});

app.get('/api/import-tasks/:id/errors', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const row = ensureArray(readDb().platform?.import_tasks).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '导入任务不存在');
    const errors = ensureArray(row?.result_payload?.errors);
    const lines = ['rowNumber,error', ...errors.map((item) => `${toNum(item?.rowNumber || 0, 0)},"${String(item?.error || '').replace(/"/g, '""')}"`)];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=import_task_${id}_errors.csv`);
    res.send(`\uFEFF${lines.join('\n')}`);
});

app.get('/api/notifications', authRequired, (req, res) => {
    const { status = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.notifications).filter((row) => Number(row.receiver_id) === Number(req.user?.id));
    if (status) rows = rows.filter((row) => String(row.status) === String(status));
    rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    apiOk(res, req, rows, '获取成功');
});

app.patch('/api/notifications/:id/read', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    let found = false;
    updateDb((db) => {
        const rows = ensureArray(db.platform?.notifications);
        db.platform.notifications = rows;
        const row = rows.find((item) => Number(item.id) === id && Number(item.receiver_id) === Number(req.user?.id));
        if (!row) return;
        row.status = 'READ';
        row.read_at = nowIso();
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '通知不存在');
    apiOk(res, req, true, '已读成功');
});

app.get('/api/platform/audit-logs', authRequired, (req, res) => {
    const { page = 1, pageSize = 20 } = req.query || {};
    const rows = filterOperationLogRows(readDb().platform?.operation_logs, req.query || {}).map((row) => ({
        ...row,
        diff_summary: buildDiffSummary(row.before_snapshot, row.after_snapshot)
    }));
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
});

app.get('/api/platform/audit-logs/export', authRequired, (req, res) => {
    const rows = filterOperationLogRows(readDb().platform?.operation_logs, req.query || {});
    const csvRows = rows.map((row) => {
        const diff = buildDiffSummary(row.before_snapshot, row.after_snapshot);
        return [
            row.id,
            row.module_code,
            row.action_type,
            row.biz_object_type,
            row.biz_object_id,
            row.operator_name,
            row.result_status,
            row.created_at,
            String(row.message || '').replace(/"/g, '""'),
            diff.changedCount,
            diff.changedKeys.join('|')
        ];
    });
    const lines = [
        'id,module_code,action_type,biz_object_type,biz_object_id,operator_name,result_status,created_at,message,diff_count,diff_keys',
        ...csvRows.map((row) => row.map((cell) => `"${String(cell ?? '')}"`).join(','))
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${Date.now()}.csv`);
    res.send(`\uFEFF${lines.join('\n')}`);
});

app.get('/api/platform/audit-logs/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id, -1);
    if (id < 0) return apiErr(res, req, 404, '审计记录不存在');
    const row = ensureArray(readDb().platform?.operation_logs).find((item) => Number(item.id) === id);
    if (!row) return apiErr(res, req, 404, '审计记录不存在');
    apiOk(res, req, { ...row, diff_summary: buildDiffSummary(row.before_snapshot, row.after_snapshot) }, '获取成功');
});

const filterSecurityLogRows = (rows, query = {}) => {
    const { eventType = '', result = '', riskLevel = '', username = '', dateFrom = '', dateTo = '' } = query || {};
    let list = ensureArray(rows);
    if (eventType) list = list.filter((row) => String(row.event_type) === String(eventType));
    if (result) list = list.filter((row) => String(row.result) === String(result));
    if (riskLevel) list = list.filter((row) => String(row.risk_level) === String(riskLevel));
    if (username) list = list.filter((row) => contains(row.username, username));
    if (dateFrom) list = list.filter((row) => String(row.created_at).slice(0, 10) >= String(dateFrom));
    if (dateTo) list = list.filter((row) => String(row.created_at).slice(0, 10) <= String(dateTo));
    return [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

app.get('/api/platform/security/summary', authRequired, (req, res) => {
    const rows = ensureArray(readDb().platform?.security_logs);
    const loginRows = rows.filter((row) => String(row.event_type) === 'LOGIN');
    const loginSuccess = loginRows.filter((row) => String(row.result) === 'SUCCESS').length;
    const loginFailed = loginRows.filter((row) => String(row.result) === 'FAILED').length;
    const passwordResetCount = rows.filter((row) => String(row.event_type) === 'PASSWORD_RESET').length;
    const permissionChangeCount = rows.filter((row) => String(row.event_type) === 'PERMISSION_CHANGE').length;
    const abnormalLoginCount = loginRows.filter((row) => ['MEDIUM', 'HIGH', 'CRITICAL'].includes(String(row.risk_level))).length;
    apiOk(res, req, {
        loginSuccess,
        loginFailed,
        passwordResetCount,
        permissionChangeCount,
        abnormalLoginCount
    }, '获取成功');
});

app.get('/api/platform/security/logs', authRequired, (req, res) => {
    const { page = 1, pageSize = 20 } = req.query || {};
    const rows = filterSecurityLogRows(readDb().platform?.security_logs, req.query || {});
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
});

app.get('/api/platform/system-configs', authRequired, (req, res) => {
    const { configType = '', keyword = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.system_configs);
    if (configType) rows = rows.filter((row) => String(row.config_type) === String(configType));
    if (keyword) rows = rows.filter((row) => contains(row.config_code, keyword) || contains(row.config_name, keyword));
    rows = [...rows].sort((a, b) => String(a.config_code).localeCompare(String(b.config_code)));
    apiOk(res, req, rows, '获取成功');
});

app.put('/api/platform/system-configs/:configCode', authRequired, (req, res) => {
    const configCode = String(req.params.configCode || '');
    const body = req.body || {};
    let found = false;
    let afterSnapshot = null;
    updateDb((db) => {
        if (!db.platform) db.platform = {};
        const rows = ensureArray(db.platform.system_configs);
        const versions = ensureArray(db.platform.system_config_versions);
        db.platform.system_configs = rows;
        db.platform.system_config_versions = versions;
        const row = rows.find((item) => String(item.config_code) === configCode);
        if (!row) return;
        row.config_value = body.configValue !== undefined ? safeClone(body.configValue) : row.config_value;
        row.status = body.status !== undefined ? normalizeBinaryStatus(body.status, row.status) : row.status;
        row.version = toNum(row.version, 1) + 1;
        row.updated_by = req.user?.username || 'system';
        row.updated_at = nowIso();
        versions.push({
            id: nextId(versions),
            config_id: row.id,
            config_code: row.config_code,
            version: row.version,
            status: row.status,
            config_value: safeClone(row.config_value),
            change_note: String(body.changeNote || '配置更新'),
            changed_by: req.user?.username || 'system',
            changed_at: nowIso()
        });
        afterSnapshot = safeClone(row);
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '配置项不存在');
    appendOperationLog(req, {
        moduleCode: 'system_config',
        bizObjectType: 'system_config',
        bizObjectId: configCode,
        actionType: 'UPDATE',
        message: `更新系统配置 ${configCode}`,
        requestSummary: { configCode, status: body.status },
        afterSnapshot
    });
    apiOk(res, req, afterSnapshot, '更新成功');
});

app.get('/api/platform/system-configs/:configCode/versions', authRequired, (req, res) => {
    const configCode = String(req.params.configCode || '');
    const rows = ensureArray(readDb().platform?.system_config_versions)
        .filter((row) => String(row.config_code) === configCode)
        .sort((a, b) => Number(b.version) - Number(a.version));
    apiOk(res, req, rows, '获取成功');
});

app.get('/api/platform/archive/policies', authRequired, (req, res) => {
    const rows = ensureArray(readDb().platform?.archive_policies)
        .sort((a, b) => String(a.policy_code).localeCompare(String(b.policy_code)));
    apiOk(res, req, rows, '获取成功');
});

app.put('/api/platform/archive/policies/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    let found = false;
    let afterSnapshot = null;
    updateDb((db) => {
        if (!db.platform) db.platform = {};
        const rows = ensureArray(db.platform.archive_policies);
        db.platform.archive_policies = rows;
        const row = rows.find((item) => Number(item.id) === id);
        if (!row) return;
        row.retention_days = body.retentionDays !== undefined ? Math.max(1, toNum(body.retentionDays, row.retention_days)) : row.retention_days;
        row.status = body.status !== undefined ? normalizeBinaryStatus(body.status, row.status) : row.status;
        row.updated_at = nowIso();
        afterSnapshot = safeClone(row);
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '归档策略不存在');
    apiOk(res, req, afterSnapshot, '更新成功');
});

const pickArchiveCandidates = (rows, retentionDays) => {
    const cutoff = Date.now() - Math.max(1, toNum(retentionDays, 180)) * 24 * 60 * 60 * 1000;
    return ensureArray(rows).filter((row) => {
        const timeSource = row.created_at || row.create_time || row.updated_at || row.finished_at || '';
        const millis = new Date(timeSource).getTime();
        if (Number.isNaN(millis) || millis <= 0) return false;
        if (row.archived_at) return false;
        return millis <= cutoff;
    });
};

app.post('/api/platform/archive/run', authRequired, (req, res) => {
    const policyCode = String(req.body?.policyCode || '');
    if (!policyCode) return apiErr(res, req, 400, 'policyCode 不能为空');
    let createdJob = null;
    let archivedCount = 0;
    updateDb((db) => {
        if (!db.platform) db.platform = {};
        const policies = ensureArray(db.platform.archive_policies);
        const jobs = ensureArray(db.platform.archive_jobs);
        db.platform.archive_policies = policies;
        db.platform.archive_jobs = jobs;
        const policy = policies.find((item) => String(item.policy_code) === policyCode);
        if (!policy || Number(policy.status) !== 1) return;
        const retentionDays = Math.max(1, toNum(policy.retention_days, 180));
        const archivedAt = nowIso();

        if (String(policy.target_type) === 'ORDER') {
            const targets = pickArchiveCandidates(db.biz?.orders, retentionDays);
            targets.forEach((row) => { row.archived_at = archivedAt; row.archive_policy = policyCode; });
            archivedCount += targets.length;
        } else if (String(policy.target_type) === 'LOG') {
            const targets = pickArchiveCandidates(db.platform?.operation_logs, retentionDays);
            targets.forEach((row) => { row.archived_at = archivedAt; row.archive_policy = policyCode; });
            archivedCount += targets.length;
        } else if (String(policy.target_type) === 'IMPORT_EXPORT') {
            const importTargets = pickArchiveCandidates(db.platform?.import_tasks, retentionDays);
            const exportTargets = pickArchiveCandidates(db.platform?.export_tasks, retentionDays);
            importTargets.forEach((row) => { row.archived_at = archivedAt; row.archive_policy = policyCode; });
            exportTargets.forEach((row) => { row.archived_at = archivedAt; row.archive_policy = policyCode; });
            archivedCount += importTargets.length + exportTargets.length;
        }

        policy.last_run_at = archivedAt;
        policy.updated_at = archivedAt;
        createdJob = {
            id: nextId(jobs),
            policy_code: policy.policy_code,
            policy_name: policy.policy_name,
            target_type: policy.target_type,
            retention_days: retentionDays,
            archived_count: archivedCount,
            status: 'SUCCESS',
            operator_name: req.user?.nickname || req.user?.username || 'system',
            started_at: archivedAt,
            finished_at: nowIso(),
            message: `归档完成，共处理 ${archivedCount} 条`
        };
        jobs.push(createdJob);
    });
    if (!createdJob) return apiErr(res, req, 400, '策略不存在或已停用');
    appendOperationLog(req, {
        moduleCode: 'archive',
        bizObjectType: 'archive_job',
        bizObjectId: createdJob.id,
        actionType: 'ARCHIVE_RUN',
        message: `执行归档策略 ${createdJob.policy_code}`,
        afterSnapshot: createdJob
    });
    apiOk(res, req, createdJob, '执行成功');
});

app.get('/api/platform/archive/jobs', authRequired, (req, res) => {
    const { page = 1, pageSize = 20, policyCode = '', targetType = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.archive_jobs);
    if (policyCode) rows = rows.filter((row) => String(row.policy_code) === String(policyCode));
    if (targetType) rows = rows.filter((row) => String(row.target_type) === String(targetType));
    rows = [...rows].sort((a, b) => String(b.started_at || b.created_at).localeCompare(String(a.started_at || a.created_at)));
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
});

app.get('/api/platform/monitor/overview', authRequired, (req, res) => {
    const windowMinutes = Math.max(1, toNum(req.query?.windowMinutes, 1440));
    const fromMillis = Date.now() - windowMinutes * 60 * 1000;
    const metrics = runtimeApiMetrics.filter((item) => new Date(item.created_at).getTime() >= fromMillis);
    const totalCalls = metrics.length;
    const errorCalls = metrics.filter((item) => toNum(item.status, 200) >= 400).length;
    const errorRate = totalCalls > 0 ? Number(((errorCalls / totalCalls) * 100).toFixed(2)) : 0;

    const grouped = {};
    metrics.forEach((item) => {
        const key = `${item.method} ${item.path}`;
        if (!grouped[key]) {
            grouped[key] = {
                api: key,
                call_count: 0,
                error_count: 0,
                total_duration_ms: 0,
                max_duration_ms: 0
            };
        }
        grouped[key].call_count += 1;
        grouped[key].total_duration_ms += toNum(item.duration_ms, 0);
        grouped[key].max_duration_ms = Math.max(grouped[key].max_duration_ms, toNum(item.duration_ms, 0));
        if (toNum(item.status, 200) >= 400) grouped[key].error_count += 1;
    });

    const apiTop = Object.values(grouped)
        .map((item) => ({
            ...item,
            avg_duration_ms: item.call_count > 0 ? Number((item.total_duration_ms / item.call_count).toFixed(1)) : 0,
            error_rate: item.call_count > 0 ? Number(((item.error_count / item.call_count) * 100).toFixed(2)) : 0
        }))
        .sort((a, b) => b.call_count - a.call_count)
        .slice(0, 12);

    const slowApis = [...apiTop]
        .filter((item) => item.avg_duration_ms >= 800 || item.max_duration_ms >= 1200)
        .sort((a, b) => b.avg_duration_ms - a.avg_duration_ms)
        .slice(0, 8);

    const db = readDb();
    const allTasks = [
        ...ensureArray(db.platform?.import_tasks),
        ...ensureArray(db.platform?.export_tasks),
        ...ensureArray(db.platform?.workflow_tasks),
        ...ensureArray(db.platform?.task_runs)
    ];
    const successTasks = allTasks.filter((item) => String(item.status) === 'SUCCESS').length;
    const failedTasks = allTasks.filter((item) => String(item.status) === 'FAILED').length;
    const runningTasks = allTasks.filter((item) => String(item.status) === 'RUNNING').length;
    const finishedTasks = successTasks + failedTasks;
    const taskSuccessRate = finishedTasks > 0 ? Number(((successTasks / finishedTasks) * 100).toFixed(2)) : 0;

    apiOk(res, req, {
        windowMinutes,
        totalCalls,
        errorCalls,
        errorRate,
        slowApiCount: slowApis.length,
        apiTop,
        slowApis,
        taskSummary: {
            totalTasks: allTasks.length,
            successTasks,
            failedTasks,
            runningTasks,
            taskSuccessRate
        }
    }, '获取成功');
});

app.get('/api/platform/fine-permissions', authRequired, (req, res) => {
    const { roleId = '', modulePath = '' } = req.query || {};
    let rows = ensureArray(readDb().platform?.fine_permissions);
    if (roleId) rows = rows.filter((row) => Number(row.role_id) === toNum(roleId, -1));
    if (modulePath) rows = rows.filter((row) => String(row.module_path) === String(modulePath));
    rows = [...rows].sort((a, b) => Number(a.role_id) - Number(b.role_id) || String(a.module_path).localeCompare(String(b.module_path)));
    apiOk(res, req, rows, '获取成功');
});

app.put('/api/platform/fine-permissions/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    let found = false;
    let beforeSnapshot = null;
    let afterSnapshot = null;
    updateDb((db) => {
        if (!db.platform) db.platform = {};
        const rows = ensureArray(db.platform.fine_permissions);
        db.platform.fine_permissions = rows;
        const row = rows.find((item) => Number(item.id) === id);
        if (!row) return;
        beforeSnapshot = safeClone(row);
        if (body.buttonCodes !== undefined) {
            if (Array.isArray(body.buttonCodes)) {
                row.button_codes = [...new Set(body.buttonCodes.map((item) => String(item).trim()).filter(Boolean))];
            } else {
                row.button_codes = [...new Set(String(body.buttonCodes).split(',').map((item) => item.trim()).filter(Boolean))];
            }
        }
        if (body.dataScopeType !== undefined) row.data_scope_type = String(body.dataScopeType || 'ALL');
        if (body.dataScopeConfig !== undefined) row.data_scope_config = toSafeObject(body.dataScopeConfig, {});
        if (body.fieldPermissions !== undefined) {
            row.field_permissions = ensureArray(body.fieldPermissions).map((item) => ({
                field: String(item.field || ''),
                label: String(item.label || item.field || ''),
                visible: normalizeBinaryStatus(item.visible, 1),
                editable: normalizeBinaryStatus(item.editable, 1)
            })).filter((item) => item.field);
        }
        row.updated_at = nowIso();
        afterSnapshot = safeClone(row);
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '权限配置不存在');
    appendOperationLog(req, {
        moduleCode: 'fine_permission',
        bizObjectType: 'fine_permission',
        bizObjectId: id,
        actionType: 'UPDATE',
        message: `更新精细权限配置 ${id}`,
        beforeSnapshot,
        afterSnapshot
    });
    appendSecurityLog(req, {
        eventType: 'PERMISSION_CHANGE',
        actionType: 'FINE_PERMISSION_UPDATE',
        username: req.user?.username || '',
        userId: req.user?.id ?? null,
        result: 'SUCCESS',
        moduleCode: 'fine_permission',
        message: `更新精细权限配置 ${id}`,
        metadata: { configId: id, roleId: afterSnapshot?.role_id, modulePath: afterSnapshot?.module_path }
    });
    apiOk(res, req, afterSnapshot, '更新成功');
});

app.get('/api/platform/health', authRequired, (req, res) => {
    let dbFileSizeBytes = 0;
    let storageStatus = 'UP';
    try {
        const stat = fs.statSync(DB_FILE);
        dbFileSizeBytes = Number(stat.size || 0);
    } catch (error) {
        storageStatus = 'DOWN';
    }

    const db = readDb();
    const allTasks = [
        ...ensureArray(db.platform?.import_tasks),
        ...ensureArray(db.platform?.export_tasks),
        ...ensureArray(db.platform?.workflow_tasks),
        ...ensureArray(db.platform?.task_runs)
    ];
    const successTasks = allTasks.filter((item) => String(item.status) === 'SUCCESS').length;
    const failedTasks = allTasks.filter((item) => String(item.status) === 'FAILED').length;
    const runningTasks = allTasks.filter((item) => String(item.status) === 'RUNNING').length;
    const recentApiErrors = runtimeApiMetrics
        .filter((item) => toNum(item.status, 200) >= 500)
        .slice(-10)
        .reverse()
        .map((item) => ({
            type: 'API',
            message: `${item.method} ${item.path} => ${item.status}`,
            created_at: item.created_at,
            trace_id: item.trace_id || ''
        }));
    const recentBizErrors = ensureArray(db.platform?.operation_logs)
        .filter((item) => String(item.result_status) === 'FAILED')
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 10)
        .map((item) => ({
            type: 'BIZ',
            message: `${item.module_code}:${item.action_type} ${item.message || ''}`,
            created_at: item.created_at,
            trace_id: item.trace_id || ''
        }));

    const services = [
        { service_key: 'api-service', service_name: 'API 服务', status: 'UP', message: '运行正常' },
        { service_key: 'auth-service', service_name: '认证服务', status: ensureArray(db.system?.accounts).length > 0 ? 'UP' : 'DOWN', message: ensureArray(db.system?.accounts).length > 0 ? '账号数据可用' : '账号数据缺失' },
        { service_key: 'storage-service', service_name: '存储服务', status: storageStatus, message: storageStatus === 'UP' ? '本地数据文件可访问' : '本地数据文件不可访问' },
        { service_key: 'task-service', service_name: '任务服务', status: failedTasks > successTasks && failedTasks > 0 ? 'WARN' : 'UP', message: failedTasks > 0 ? `失败任务 ${failedTasks} 条` : '任务执行稳定' }
    ];

    apiOk(res, req, {
        runtime: {
            uptime_seconds: Math.floor(process.uptime()),
            node_version: process.version
        },
        services,
        task_status: {
            total: allTasks.length,
            running: runningTasks,
            success: successTasks,
            failed: failedTasks
        },
        storage: {
            db_file: DB_FILE,
            db_file_size_bytes: dbFileSizeBytes,
            db_file_size_mb: Number((dbFileSizeBytes / 1024 / 1024).toFixed(3)),
            rss_memory_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2))
        },
        recent_errors: [...recentApiErrors, ...recentBizErrors]
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, 20)
    }, '获取成功');
});

app.get('/api/roles', authRequired, (req, res) => {
    const db = readDb();
    const list = db.system.roles.map((role) => {
        const permissionIds = db.system.role_pages.filter(rp => Number(rp.role_id) === Number(role.id)).map(rp => Number(rp.page_id));
        const postIds = db.system.role_jobs.filter(rj => Number(rj.role_id) === Number(role.id)).map(rj => String(rj.job_id));
        return {
            ...role,
            permissionIds,
            postIds,
            dataScopeType: role.data_scope_type || 'ALL',
            dataScopeConfig: role.data_scope_config || {}
        };
    }).sort((a, b) => toNum(a.sort_no) - toNum(b.sort_no));
    apiOk(res, req, list, '获取成功');
});

app.post('/api/roles', authRequired, (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.code) return apiErr(res, req, 400, '角色名称和编码不能为空');
    let createdRole = null;
    try {
        updateDb((db) => {
            if (db.system.roles.some((role) => String(role.code) === String(body.code))) throw new Error('角色编码已存在');
            const id = nextId(db.system.roles);
            createdRole = {
                id,
                name: String(body.name),
                code: String(body.code),
                status: toNum(body.status, 1),
                sort_no: toNum(body.sort, db.system.roles.length + 1),
                data_type: 2,
                data_scope_type: String(body.dataScopeType || 'ALL'),
                data_scope_config: body.dataScopeConfig && typeof body.dataScopeConfig === 'object' ? safeClone(body.dataScopeConfig) : {},
                description: String(body.remark || ''),
                created_time: nowIso()
            };
            db.system.roles.push(createdRole);
            (Array.isArray(body.permissionIds) ? body.permissionIds : []).forEach(pid => db.system.role_pages.push({ role_id: id, page_id: toNum(pid) }));
            (Array.isArray(body.postIds) ? body.postIds : []).forEach(jid => db.system.role_jobs.push({ role_id: id, job_id: String(jid) }));
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '新增失败');
    }
    appendOperationLog(req, {
        moduleCode: 'role',
        bizObjectType: 'role',
        bizObjectId: createdRole?.id,
        actionType: 'CREATE',
        message: `新增角色 ${createdRole?.name || ''}`,
        requestSummary: body,
        afterSnapshot: createdRole
    });
    appendSecurityLog(req, {
        eventType: 'PERMISSION_CHANGE',
        actionType: 'ROLE_CREATE',
        username: req.user?.username || '',
        userId: req.user?.id ?? null,
        result: 'SUCCESS',
        moduleCode: 'role',
        message: `新增角色并初始化权限：${createdRole?.name || ''}`,
        metadata: {
            roleId: createdRole?.id,
            roleName: createdRole?.name || '',
            permissionCount: Array.isArray(body.permissionIds) ? body.permissionIds.length : 0
        }
    });
    apiOk(res, req, true, '新增成功');
});

app.put('/api/roles/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    let found = false;
    let beforeSnapshot = null;
    let afterSnapshot = null;
    try {
        updateDb((db) => {
            const role = db.system.roles.find(r => Number(r.id) === id);
            if (!role) return;
            if (body.code !== undefined && db.system.roles.some((row) => Number(row.id) !== id && String(row.code) === String(body.code))) {
                throw new Error('角色编码已存在');
            }
            beforeSnapshot = safeClone(role);
            role.name = body.name !== undefined ? String(body.name) : role.name;
            role.code = body.code !== undefined ? String(body.code) : role.code;
            role.status = body.status !== undefined ? toNum(body.status, role.status) : role.status;
            role.sort_no = body.sort !== undefined ? toNum(body.sort, role.sort_no) : role.sort_no;
            role.data_scope_type = body.dataScopeType !== undefined ? String(body.dataScopeType || 'ALL') : (role.data_scope_type || 'ALL');
            if (body.dataScopeConfig !== undefined) {
                role.data_scope_config = body.dataScopeConfig && typeof body.dataScopeConfig === 'object' ? safeClone(body.dataScopeConfig) : {};
            } else if (!role.data_scope_config || typeof role.data_scope_config !== 'object') {
                role.data_scope_config = {};
            }
            role.description = body.remark !== undefined ? String(body.remark) : role.description;
            if (Array.isArray(body.permissionIds)) {
                db.system.role_pages = db.system.role_pages.filter(rp => Number(rp.role_id) !== id);
                body.permissionIds.forEach(pid => db.system.role_pages.push({ role_id: id, page_id: toNum(pid) }));
            }
            if (Array.isArray(body.postIds)) {
                db.system.role_jobs = db.system.role_jobs.filter(rj => Number(rj.role_id) !== id);
                body.postIds.forEach(jid => db.system.role_jobs.push({ role_id: id, job_id: String(jid) }));
            }
            afterSnapshot = safeClone(role);
            found = true;
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '更新失败');
    }
    if (!found) return apiErr(res, req, 404, '角色不存在');
    appendOperationLog(req, {
        moduleCode: 'role',
        bizObjectType: 'role',
        bizObjectId: id,
        actionType: 'UPDATE',
        message: `更新角色 ${afterSnapshot?.name || id}`,
        requestSummary: body,
        beforeSnapshot,
        afterSnapshot
    });
    if (body.permissionIds !== undefined || body.dataScopeType !== undefined || body.dataScopeConfig !== undefined) {
        appendSecurityLog(req, {
            eventType: 'PERMISSION_CHANGE',
            actionType: 'ROLE_PERMISSION_UPDATE',
            username: req.user?.username || '',
            userId: req.user?.id ?? null,
            result: 'SUCCESS',
            moduleCode: 'role',
            message: `更新角色权限：${afterSnapshot?.name || id}`,
            metadata: {
                roleId: id,
                roleName: afterSnapshot?.name || '',
                permissionCount: Array.isArray(body.permissionIds) ? body.permissionIds.length : null,
                dataScopeType: body.dataScopeType !== undefined ? body.dataScopeType : null
            }
        });
    }
    apiOk(res, req, true, '更新成功');
});

app.delete('/api/roles/:id', authRequired, (req, res) => {
    const id = toNum(req.params.id);
    if (id === 1) return apiErr(res, req, 400, '超级管理员角色不可删除');
    const db = readDb();
    const target = db.system.roles.find(r => Number(r.id) === id);
    if (!target) return apiErr(res, req, 404, '角色不存在');
    if (db.system.account_roles.some(ar => Number(ar.role_id) === id)) return apiErr(res, req, 400, '角色已关联用户，无法删除');
    updateDb((raw) => {
        raw.system.roles = raw.system.roles.filter(r => Number(r.id) !== id);
        raw.system.role_pages = raw.system.role_pages.filter(rp => Number(rp.role_id) !== id);
        raw.system.role_jobs = raw.system.role_jobs.filter(rj => Number(rj.role_id) !== id);
    });
    appendOperationLog(req, {
        moduleCode: 'role',
        bizObjectType: 'role',
        bizObjectId: id,
        actionType: 'DELETE',
        message: `删除角色 ${target.name || id}`,
        beforeSnapshot: target
    });
    appendSecurityLog(req, {
        eventType: 'PERMISSION_CHANGE',
        actionType: 'ROLE_DELETE',
        username: req.user?.username || '',
        userId: req.user?.id ?? null,
        result: 'SUCCESS',
        moduleCode: 'role',
        message: `删除角色：${target.name || id}`,
        metadata: { roleId: id, roleName: target.name || '' }
    });
    apiOk(res, req, true, '删除成功');
});

app.get('/api/profile/:username', (req, res) => {
    const { username } = req.params;
    const db = readDb();
    const account = db.system.accounts.find(a => a.login_id === username);
    if (!account) return apiErr(res, req, 404, '用户不存在');
    const roleIds = getRoleIdsByAccount(db, account.id);
    const postIds = getPostIdsByAccount(db, account.id);
    const roleRows = db.system.roles.filter(r => roleIds.includes(Number(r.id))).map(r => ({ id: r.id, name: r.name, code: r.code }));
    const postRows = db.system.jobtitles.filter(j => postIds.includes(String(j.id))).map(j => ({ id: j.id, name: j.job_title_name, code: j.job_title_mark }));
    const dept = db.system.departments.find(d => String(d.id) === String(account.department_id));
    const isSuperAdmin = isSuperAdminUser({ loginId: account.login_id, roleIds, roleNames: roleRows.map(r => r.name) });
    apiOk(res, req, {
        id: account.id,
        username: account.login_id,
        nickname: account.nick_name,
        mobile: account.mobile,
        email: account.email,
        status: account.status,
        createdTime: account.created_time,
        departmentId: account.department_id,
        departmentName: dept?.department_name || '暂无部门',
        roles: roleRows,
        posts: postRows,
        isSuperAdmin
    }, '获取成功');
});

app.get('/api/pasture-stats', authRequired, (req, res) => apiOk(res, req, readDb().biz.pasture_stats, '获取成功'));
app.get('/api/products', authRequired, (req, res) => apiOk(res, req, readDb().biz.products, '获取成功'));
app.get('/api/warehouses', authRequired, (req, res) => apiOk(res, req, readDb().master.warehouse, '获取成功'));

const PHASE2_MATCHED_FULFILLMENT_STATUS = new Set(['ALLOCATED', 'WAIT_OUTBOUND', 'OUTBOUND', 'IN_TRANSIT', 'SIGNED', 'CLOSED']);
const buildLegacyOrderRowsFromPhase2 = (db) => {
    const headerRows = ensureArray(db?.biz?.order_headers);
    const lineRows = ensureArray(db?.biz?.order_lines);
    const warehouseRows = ensureArray(db?.master?.warehouse);

    const headerMap = new Map(headerRows.map((row) => [String(row.order_no), row]));
    const lineCountMap = new Map();
    lineRows.forEach((line) => {
        const orderNo = String(line.order_no || '');
        lineCountMap.set(orderNo, toNum(lineCountMap.get(orderNo), 0) + 1);
    });
    const warehouseIdByCode = new Map(warehouseRows.map((row) => [String(row.warehouse_code), row.id]));

    const rows = lineRows.map((line) => {
        const orderNo = String(line.order_no || '');
        const header = headerMap.get(orderNo) || {};
        const lineNo = toNum(line.line_no, 0);
        const lineCount = toNum(lineCountMap.get(orderNo), 0);
        const firstAlloc = ensureArray(line.allocation_result)[0] || null;
        const matchedByAlloc = toNum(line.allocated_qty, 0) > 0;
        const matchedByStatus = PHASE2_MATCHED_FULFILLMENT_STATUS.has(String(header.fulfillment_status || '')) || String(header.order_status) === 'CLOSED';
        const sourceWarehouseCode = String(firstAlloc?.warehouse_code || '');
        const sourceWarehouseId = warehouseIdByCode.get(sourceWarehouseCode);

        return {
            order_id: lineCount > 1 ? `${orderNo}-${String(lineNo || 1).padStart(2, '0')}` : orderNo,
            distributor_id: String(header.customer_code || header.reseller_code || ''),
            sku_id: String(line.sku_code || ''),
            request_liters: toNum(line.order_qty, 0),
            source_pasture_id: sourceWarehouseId || sourceWarehouseCode || '',
            match_score: toNum(firstAlloc?.score, 0),
            status: matchedByAlloc || matchedByStatus ? 'Matched' : 'Pending',
            create_time: String(header.created_at || header.updated_at || ''),
            region: String(header.region || '其他')
        };
    });
    return rows.sort((a, b) => String(b.create_time || '').localeCompare(String(a.create_time || '')));
};
const buildLegacyOrderAnalysisFromPhase2 = (db) => {
    const rows = buildLegacyOrderRowsFromPhase2(db);
    const productMap = new Map(ensureArray(db?.biz?.products).map(item => [item.product_code, item]));
    const coreRegions = ['华东', '华中', '华南', '华北'];
    const fallbackWeights = { 华东: 0.31, 华中: 0.22, 华南: 0.24, 华北: 0.23 };
    const sumLiters = (list) => list.reduce((sum, row) => sum + toNum(row.request_liters, 0), 0);
    const sumRegionLiters = (list) => list.reduce((acc, row) => {
        const key = row.region || '其他';
        acc[key] = (acc[key] || 0) + toNum(row.request_liters, 0);
        return acc;
    }, {});
    const allocateCoreRegionStats = (rawStats, forcedWeights = null) => {
        const coreBaseStats = coreRegions.reduce((acc, key) => {
            acc[key] = toNum(rawStats[key], 0);
            return acc;
        }, {});
        const coreBaseTotal = Object.values(coreBaseStats).reduce((sum, value) => sum + toNum(value, 0), 0);
        const nationalDirectLiters = toNum(rawStats['全国'], 0);
        const weights = coreRegions.reduce((acc, key) => {
            acc[key] = forcedWeights?.[key] ?? (coreBaseTotal > 0 ? toNum(coreBaseStats[key], 0) / coreBaseTotal : fallbackWeights[key]);
            return acc;
        }, {});
        const allocatedNational = coreRegions.reduce((acc, key, index) => {
            if (index === coreRegions.length - 1) {
                const allocated = Object.values(acc).reduce((sum, value) => sum + toNum(value, 0), 0);
                acc[key] = Math.max(0, nationalDirectLiters - allocated);
                return acc;
            }
            acc[key] = Math.round(nationalDirectLiters * toNum(weights[key], 0));
            return acc;
        }, {});
        const stats = coreRegions.reduce((acc, key) => {
            acc[key] = toNum(coreBaseStats[key], 0) + toNum(allocatedNational[key], 0);
            return acc;
        }, {});
        return {
            stats,
            weights,
            nationalDirectLiters
        };
    };

    const pendingRows = rows.filter(row => row.status === 'Pending');
    const matchedRows = rows.filter(row => row.status === 'Matched');
    const rawRegionStats = sumRegionLiters(rows);
    const pendingRawRegionStats = sumRegionLiters(pendingRows);
    const matchedRawRegionStats = sumRegionLiters(matchedRows);
    const regionAllocation = allocateCoreRegionStats(rawRegionStats);
    const pendingAllocation = allocateCoreRegionStats(pendingRawRegionStats, regionAllocation.weights);
    const matchedAllocation = allocateCoreRegionStats(matchedRawRegionStats, regionAllocation.weights);
    const regionStats = regionAllocation.stats;
    const pendingRegionStats = pendingAllocation.stats;
    const matchedRegionStats = matchedAllocation.stats;
    const totalOrders = rows.length;
    const pendingOrders = pendingRows.length;
    const matchedOrders = matchedRows.length;
    const totalLiters = sumLiters(rows);
    const pendingLiters = sumLiters(pendingRows);
    const matchedLiters = sumLiters(matchedRows);
    const coreRegionLiters = Object.values(regionStats).reduce((sum, value) => sum + toNum(value, 0), 0);
    const corePendingLiters = Object.values(pendingRegionStats).reduce((sum, value) => sum + toNum(value, 0), 0);
    const lowTempPendingRows = pendingRows.filter(row => productMap.get(row.sku_id)?.material_type === 'LowTemp');
    const lowTempPendingOrders = lowTempPendingRows.length;
    const lowTempPendingLiters = sumLiters(lowTempPendingRows);
    const regionLoad = coreRegions.map((region) => {
        const liters = toNum(regionStats[region], 0);
        const regionPendingLiters = toNum(pendingRegionStats[region], 0);
        const regionPendingRate = liters > 0 ? (regionPendingLiters / liters) * 100 : 0;
        let alertLevel = 'healthy';
        if (regionPendingRate >= 55) {
            alertLevel = 'critical';
        } else if (regionPendingRate >= 25) {
            alertLevel = 'attention';
        }
        return {
            region,
            liters,
            matchedLiters: toNum(matchedRegionStats[region], 0),
            pendingLiters: regionPendingLiters,
            share: coreRegionLiters > 0 ? Number(((liters / coreRegionLiters) * 100).toFixed(1)) : 0,
            pendingRate: Number(regionPendingRate.toFixed(1)),
            alertLevel
        };
    }).sort((a, b) => b.pendingRate - a.pendingRate || b.pendingLiters - a.pendingLiters);
    const criticalRegions = regionLoad.filter(item => item.alertLevel === 'critical');
    const attentionRegions = regionLoad.filter(item => item.alertLevel === 'attention');
    const westRegionLiters = toNum(rawRegionStats['西南'], 0);
    const westPendingLiters = toNum(pendingRawRegionStats['西南'], 0);
    const sevenDayTrend = [];
    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = toDateKey(d);
        const dayRows = rows.filter(row => String(row.create_time).slice(0, 10) === key);
        const dayPendingRows = dayRows.filter(row => row.status === 'Pending');
        const dayAllocation = allocateCoreRegionStats(sumRegionLiters(dayRows));
        const dayPendingAllocation = allocateCoreRegionStats(sumRegionLiters(dayPendingRows), dayAllocation.weights);
        sevenDayTrend.push({
            date: key,
            coreLiters: Object.values(dayAllocation.stats).reduce((sum, value) => sum + toNum(value, 0), 0),
            westLiters: toNum(sumRegionLiters(dayRows)['西南'], 0),
            pendingCoreLiters: Object.values(dayPendingAllocation.stats).reduce((sum, value) => sum + toNum(value, 0), 0),
            totalLiters: sumLiters(dayRows)
        });
    }
    return {
        totalOrders,
        totalLiters,
        pendingOrders,
        pendingLiters,
        matchedOrders,
        matchedLiters,
        matchRate: totalOrders > 0 ? Number(((matchedOrders / totalOrders) * 100).toFixed(1)) : 0,
        coreRegionLiters,
        corePendingLiters,
        regionStats,
        pendingRegionStats,
        matchedRegionStats,
        regionLoad,
        rawRegionStats,
        nationalDirectLiters: regionAllocation.nationalDirectLiters,
        nationalPendingLiters: pendingAllocation.nationalDirectLiters,
        westRegionLiters,
        westPendingLiters,
        alertSummary: {
            totalRiskCount: criticalRegions.length + attentionRegions.length + (lowTempPendingOrders > 0 ? 1 : 0),
            criticalRegionCount: criticalRegions.length,
            attentionRegionCount: attentionRegions.length,
            lowTempPendingOrders,
            lowTempPendingLiters
        },
        chartMeta: {
            title: '四大核心区域订单需求量对比',
            note: '全国直营/电商需求已按四大区承接份额分摊，西南需求单列观察'
        },
        sevenDayTrend
    };
};
app.get('/api/orders', authRequired, (req, res) => {
    const db = readDb();
    const { page = 1, limit = 15, status = '' } = req.query || {};
    let rows = buildLegacyOrderRowsFromPhase2(db);
    if (status) rows = rows.filter((row) => String(row.status) === String(status));
    const { list, total } = paginate(rows, page, limit);
    apiOk(res, req, { list, total }, '获取成功');
});

app.get('/api/order-analysis', authRequired, (req, res) => {
    const db = readDb();
    apiOk(res, req, buildLegacyOrderAnalysisFromPhase2(db), '获取成功');
});

registerOrderPhase2Routes({
    app,
    authRequired,
    apiOk,
    apiErr,
    appendOperationLog,
    appendTaskRecord,
    appendNotification,
    paginate,
    contains,
    safeClone
});

registerInventoryOpsRoutes({
    app,
    authRequired,
    apiOk,
    apiErr,
    paginate,
    contains
});

registerChannelDealerOpsRoutes({
    app,
    authRequired,
    apiOk,
    apiErr,
    paginate,
    contains
});

registerWorkflowCenterRoutes({
    app,
    authRequired,
    apiOk,
    apiErr,
    paginate
});

registerManagementCockpitRoutes({
    app,
    authRequired,
    apiOk,
    apiErr,
    paginate
});

registerMdmGovernanceRoutes({
    app,
    superAdminRequired,
    apiOk,
    apiErr
});

const withMasterFilter = (rows, { keyword = '', status = '' }, fields) => {
    let list = [...rows];
    if (keyword) list = list.filter(r => fields.some(f => contains(r[f], keyword)));
    if (status !== '' && status !== undefined) list = list.filter(r => String(r.status) === String(status));
    return list;
};

const getSpuPayload = (body, db) => {
    const payload = normalizeSpuRow(body, {
        categoryRows: db.master?.category || [],
        timeIso: nowIso()
    });
    if (!/^SPU-[A-Z0-9-]{2,60}$/.test(payload.spu_code)) {
        throw new Error('SPU编码需以 SPU- 开头，仅支持大写字母、数字和连字符');
    }
    return payload;
};

const formatSkuRow = (row) => ({
    ...row,
    sku_code: row.sku_code === undefined ? '' : normalizeSkuCode(row.sku_code),
    sku_name: row.sku_name === undefined ? '' : String(row.sku_name).trim(),
    bar_code: row.bar_code === undefined ? '' : String(row.bar_code).trim(),
    category_code: row.category_code === undefined ? '' : String(row.category_code).trim(),
    lifecycle_status: String(row.lifecycle_status || 'ACTIVE').trim().toUpperCase() || 'ACTIVE',
    created_time: row.created_time || nowIso(),
    updated_time: row.updated_time || nowIso(),
    status: row.status === undefined ? 1 : row.status
});

const getSkuRulePayload = (db, body = {}) => {
    const validation = validateSkuCode(body.sku_code, db.platform?.dict_items);
    if (!validation.ok) throw new Error(validation.errors[0] || 'SKU编码格式不正确');
    const skuName = String(body.sku_name || '').trim();
    if (!skuName) throw new Error('SKU名称不能为空');
    return formatSkuRow({
        sku_code: validation.normalizedCode,
        sku_name: skuName,
        bar_code: String(body.bar_code || '').trim(),
        category_code: String(body.category_code || '').trim(),
        lifecycle_status: String(body.lifecycle_status || 'ACTIVE').trim().toUpperCase() || 'ACTIVE',
        shelf_life_days: toNum(body.shelf_life_days, 0),
        unit_ratio: toNum(body.unit_ratio, 1),
        volume_m3: Number(body.volume_m3 || 0),
        status: 1,
        created_time: nowIso(),
        updated_time: nowIso()
    });
};

const ensureSkuCodeMappingRows = (db) => {
    if (!db.platform) db.platform = {};
    db.platform.mdm_sku_code_mappings = ensureArray(db.platform.mdm_sku_code_mappings);
    return db.platform.mdm_sku_code_mappings;
};

const buildSkuMappingSummary = (rows, skuRows = []) => {
    const list = ensureArray(rows);
    const activeSkuRows = ensureArray(skuRows).filter((row) => Number(row.status ?? 1) !== 0);
    return {
        total: list.length,
        activeSkuCount: activeSkuRows.length,
        legacySkuCount: activeSkuRows.filter((row) => !isStandardSkuCode(row.sku_code)).length,
        generatedCount: list.filter((row) => String(row.mapping_status) === 'GENERATED').length,
        confirmedCount: list.filter((row) => String(row.mapping_status) === 'CONFIRMED').length,
        appliedCount: list.filter((row) => String(row.mapping_status) === 'APPLIED').length,
        skippedCount: list.filter((row) => String(row.mapping_status) === 'SKIPPED').length
    };
};

const buildSkuCodeMappings = (db, options = {}) => {
    const forceRefresh = Boolean(options.forceRefresh);
    const rows = ensureSkuCodeMappingRows(db);
    const skuRows = ensureArray(db.master?.sku).filter((row) => Number(row.status ?? 1) !== 0);
    const existingByOld = new Map(rows.map((row) => [normalizeSkuCode(row.old_sku_code), row]));
    const reservedCodes = new Set(
        skuRows
            .map((row) => normalizeSkuCode(row.sku_code))
            .filter((code) => code && isStandardSkuCode(code))
    );
    let created = 0;
    let refreshed = 0;

    skuRows
        .filter((row) => !isStandardSkuCode(row.sku_code))
        .sort((a, b) => toNum(a.id) - toNum(b.id))
        .forEach((sku) => {
            const oldCode = normalizeSkuCode(sku.sku_code);
            const existing = existingByOld.get(oldCode);
            const keepExistingCode = Boolean(existing?.new_sku_code) && !forceRefresh;
            const candidate = keepExistingCode ? null : inferStandardSkuCode(sku, { reservedCodes });
            const newCode = keepExistingCode ? normalizeSkuCode(existing.new_sku_code) : candidate.newCode;
            reservedCodes.add(newCode);

            if (existing) {
                Object.assign(existing, {
                    sku_id: sku.id || 0,
                    sku_name: sku.sku_name || '',
                    category_code: sku.category_code || '',
                    lifecycle_status: sku.lifecycle_status || '',
                    new_sku_code: newCode,
                    confidence: keepExistingCode ? existing.confidence : candidate.confidence,
                    infer_reason: keepExistingCode ? existing.infer_reason : candidate.reason,
                    quality_status: existing.mapping_status === 'APPLIED' ? 'RESOLVED' : 'OPEN',
                    updated_at: nowIso()
                });
                refreshed += 1;
                return;
            }

            rows.push({
                id: nextId(rows),
                sku_id: sku.id || 0,
                old_sku_code: oldCode,
                new_sku_code: newCode,
                sku_name: sku.sku_name || '',
                category_code: sku.category_code || '',
                lifecycle_status: sku.lifecycle_status || '',
                source: 'AUTO_RULE',
                confidence: candidate.confidence,
                infer_reason: candidate.reason,
                mapping_status: 'GENERATED',
                convergence_stage: '待业务确认',
                quality_status: 'OPEN',
                created_at: nowIso(),
                updated_at: nowIso(),
                applied_by: '',
                applied_at: ''
            });
            created += 1;
        });

    return {
        created,
        refreshed,
        summary: buildSkuMappingSummary(rows, skuRows),
        preview: rows.slice(0, 100)
    };
};

const filterSkuCodeMappings = (rows, query = {}) => {
    const { keyword = '', status = '', qualityStatus = '' } = query || {};
    let list = ensureArray(rows).map((row) => ({ ...row }));
    if (keyword) {
        list = list.filter((row) => (
            contains(row.old_sku_code, keyword)
            || contains(row.new_sku_code, keyword)
            || contains(row.sku_name, keyword)
            || contains(row.infer_reason, keyword)
        ));
    }
    if (status) list = list.filter((row) => String(row.mapping_status) === String(status).toUpperCase());
    if (qualityStatus) list = list.filter((row) => String(row.quality_status) === String(qualityStatus).toUpperCase());
    const order = { GENERATED: 1, CONFIRMED: 2, SKIPPED: 3, APPLIED: 4 };
    return list.sort((a, b) => (order[a.mapping_status] || 9) - (order[b.mapping_status] || 9) || toNum(a.id) - toNum(b.id));
};

const replaceSkuCodeReferences = (db, oldCode, newCode) => {
    const touched = [];
    const updateRowCollection = (scope, table, rows) => {
        ensureArray(rows).forEach((row) => {
            let changed = 0;
            Object.keys(row || {}).forEach((field) => {
                if (!['sku_code', 'sku_id'].includes(field)) return;
                if (normalizeSkuCode(row[field]) !== oldCode) return;
                row[field] = newCode;
                changed += 1;
            });
            if (changed) touched.push({ scope, table, id: row.id || row.order_no || '', changed });
        });
    };

    Object.entries(db.master || {}).forEach(([table, rows]) => {
        if (table === 'sku') return;
        updateRowCollection('master', table, rows);
    });
    Object.entries(db.biz || {}).forEach(([table, rows]) => {
        updateRowCollection('biz', table, rows);
    });
    return touched;
};

app.get('/api/master/SKU/rule-config', superAdminRequired, (req, res) => {
    apiOk(res, req, buildSkuRuleConfig(readDb().platform?.dict_items), '获取成功');
});

app.get('/api/master/SKU/code-mappings', superAdminRequired, (req, res) => {
    const { page = 1, pageSize = 20 } = req.query || {};
    const db = readDb();
    const rows = ensureSkuCodeMappingRows(db);
    const filtered = filterSkuCodeMappings(rows, req.query || {});
    apiOk(res, req, {
        ...paginate(filtered, page, pageSize),
        summary: buildSkuMappingSummary(rows, db.master?.sku)
    }, '获取成功');
});

app.post('/api/master/SKU/code-mappings/build', superAdminRequired, (req, res) => {
    let out = null;
    updateDb((db) => {
        out = buildSkuCodeMappings(db, { forceRefresh: Boolean(req.body?.forceRefresh) });
    });
    apiOk(res, req, out, '映射表已生成');
});

app.post('/api/master/SKU/code-mappings/:id/apply', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id);
    let out = null;
    try {
        updateDb((db) => {
            const rows = ensureSkuCodeMappingRows(db);
            const mapping = rows.find((row) => Number(row.id) === id);
            if (!mapping) throw new Error('映射记录不存在');
            if (String(mapping.mapping_status) === 'APPLIED') throw new Error('该映射已应用');

            const oldCode = normalizeSkuCode(mapping.old_sku_code);
            const newCode = normalizeSkuCode(req.body?.new_sku_code || mapping.new_sku_code);
            const validation = validateSkuCode(newCode, db.platform?.dict_items);
            if (!validation.ok) throw new Error(validation.errors[0] || '新标准码格式不正确');

            const skuRow = ensureArray(db.master?.sku).find((row) => normalizeSkuCode(row.sku_code) === oldCode && Number(row.status ?? 1) !== 0);
            if (!skuRow) throw new Error('旧码对应的SKU不存在或已停用');
            const duplicated = ensureArray(db.master?.sku).some((row) => (
                Number(row.id) !== Number(skuRow.id)
                && Number(row.status ?? 1) !== 0
                && normalizeSkuCode(row.sku_code) === newCode
            ));
            if (duplicated) throw new Error('新标准码已被其他SKU使用');

            skuRow.sku_code = newCode;
            skuRow.updated_time = nowIso();
            const touched = replaceSkuCodeReferences(db, oldCode, newCode);
            ensureArray(db.platform?.mdm_quality_issues).forEach((issue) => {
                if (String(issue.rule_code) !== 'SKU_FORMAT_STANDARD') return;
                if (normalizeSkuCode(issue.target_code) !== oldCode) return;
                if (String(issue.status) === 'RESOLVED') return;
                issue.status = 'RESOLVED';
                issue.resolution = `已按映射切换为 ${newCode}`;
                issue.resolved_by = req.user?.nickname || req.user?.username || '系统';
                issue.resolved_at = nowIso();
                issue.updated_at = nowIso();
            });

            Object.assign(mapping, {
                sku_id: skuRow.id || mapping.sku_id,
                new_sku_code: newCode,
                mapping_status: 'APPLIED',
                convergence_stage: '已切换',
                quality_status: 'RESOLVED',
                applied_by: req.user?.nickname || req.user?.username || '系统',
                applied_at: nowIso(),
                updated_at: nowIso(),
                reference_updates: touched
            });
            out = { mapping, touchedCount: touched.length, touchedPreview: touched.slice(0, 100) };
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '应用映射失败');
    }
    apiOk(res, req, out, '映射已应用');
});

app.post('/api/master/SKU/quality-check', superAdminRequired, (req, res) => {
    let runSummary = null;
    try {
        updateDb((db) => {
            runSummary = runQualityCheckCore(db, {
                trigger_mode: req.body?.trigger_mode || 'MANUAL',
                object_types: ['SKU'],
                rule_codes: ['SKU_FORMAT_STANDARD']
            }, req.user?.nickname || req.user?.username || '系统');
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || 'SKU格式质量检查失败');
    }
    apiOk(res, req, runSummary, 'SKU格式质量检查完成');
});

app.get('/api/master/SKU/list', superAdminRequired, (req, res) => {
    const { page = 1, pageSize = 20, keyword = '', lifecycleStatus = '' } = req.query || {};
    let list = withMasterFilter(readDb().master.sku, { keyword }, ['sku_code', 'sku_name', 'bar_code', 'category_code']);
    if (lifecycleStatus) list = list.filter(r => String(r.lifecycle_status) === String(lifecycleStatus));
    list = list.filter(r => Number(r.status) !== 0).sort((a, b) => toNum(b.id) - toNum(a.id));
    const paged = paginate(list, page, pageSize);
    apiOk(res, req, paged, '获取成功');
});

app.post('/api/master/SKU', superAdminRequired, (req, res) => {
    const body = req.body || {};
    if (!body.sku_code || !body.sku_name) return apiErr(res, req, 400, 'SKU编码和名称不能为空');
    try {
        updateDb((db) => {
            const payload = getSkuRulePayload(db, body);
            if (db.master.sku.some((s) => normalizeSkuCode(s.sku_code) === payload.sku_code)) throw new Error('SKU编码已存在');
            db.master.sku.push({ id: nextId(db.master.sku), ...payload });
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '新增失败');
    }
    apiOk(res, req, true, '新增成功');
});

app.put('/api/master/SKU/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    let found = false;
    try {
        updateDb((db) => {
            const row = db.master.sku.find(s => Number(s.id) === id);
            if (!row) return;
            if (body.sku_code !== undefined && normalizeSkuCode(body.sku_code) !== normalizeSkuCode(row.sku_code)) {
                throw new Error('编辑时不支持修改SKU编码');
            }
            const nextSkuName = body.sku_name !== undefined ? String(body.sku_name).trim() : row.sku_name;
            if (!nextSkuName) throw new Error('SKU名称不能为空');
            Object.assign(row, {
                sku_name: nextSkuName,
                bar_code: body.bar_code !== undefined ? String(body.bar_code).trim() : row.bar_code,
                category_code: body.category_code !== undefined ? String(body.category_code).trim() : row.category_code,
                lifecycle_status: body.lifecycle_status !== undefined ? String(body.lifecycle_status).trim().toUpperCase() : row.lifecycle_status,
                shelf_life_days: body.shelf_life_days !== undefined ? toNum(body.shelf_life_days, row.shelf_life_days) : row.shelf_life_days,
                unit_ratio: body.unit_ratio !== undefined ? Number(body.unit_ratio) : row.unit_ratio,
                volume_m3: body.volume_m3 !== undefined ? Number(body.volume_m3) : row.volume_m3,
                updated_time: nowIso()
            });
            found = true;
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '编辑失败');
    }
    if (!found) return apiErr(res, req, 404, '数据不存在');
    apiOk(res, req, true, '编辑成功');
});

app.delete('/api/master/SKU/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id);
    let found = false;
    updateDb((db) => {
        const row = db.master.sku.find(s => Number(s.id) === id);
        if (!row) return;
        row.status = 0;
        row.lifecycle_status = 'INACTIVE';
        row.updated_time = nowIso();
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '数据不存在');
    apiOk(res, req, true, '删除成功');
});

app.delete('/api/master/SKU/batch', superAdminRequired, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => toNum(v)).filter(v => !Number.isNaN(v)) : [];
    if (!ids.length) return apiErr(res, req, 400, '请选择要删除的数据');
    updateDb((db) => {
        db.master.sku.forEach(row => {
            if (ids.includes(Number(row.id))) {
                row.status = 0;
                row.lifecycle_status = 'INACTIVE';
                row.updated_time = nowIso();
            }
        });
    });
    apiOk(res, req, true, `已处理 ${ids.length} 条数据`);
});

app.patch('/api/master/SKU/batch-status', superAdminRequired, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => toNum(v)).filter(v => !Number.isNaN(v)) : [];
    const lifecycleStatus = String(req.body?.lifecycleStatus || '').toUpperCase();
    if (!ids.length || !lifecycleStatus) return apiErr(res, req, 400, '参数错误');
    updateDb((db) => {
        db.master.sku.forEach(row => {
            if (ids.includes(Number(row.id))) {
                row.lifecycle_status = lifecycleStatus;
                row.updated_time = nowIso();
            }
        });
    });
    apiOk(res, req, true, '批量状态更新成功');
});

const buildSkuExportRows = (query = {}) => {
    const { keyword = '', lifecycleStatus = '' } = query || {};
    let list = withMasterFilter(readDb().master.sku, { keyword }, ['sku_code', 'sku_name', 'bar_code', 'category_code']);
    if (lifecycleStatus) list = list.filter(r => String(r.lifecycle_status) === String(lifecycleStatus));
    return list.filter(r => Number(r.status) !== 0);
};

const relationValidity = (row) => {
    const today = toDateKey(new Date());
    const begin = toDateKey(row.begin_date);
    const end = toDateKey(row.end_date);
    if (!begin || !end) return 'invalid';
    if (today < begin) return 'upcoming';
    if (today > end) return 'expired';
    return 'active';
};

const filterResellerRelation = (rows, query) => {
    const { keyword = '', region = '', channelType = '', validity = '' } = query || {};
    let list = [...rows].filter(r => Number(r.status) !== 0);
    if (keyword) list = list.filter(r => ['sku_code', 'reseller_code', 'reseller_name', 'region'].some(k => contains(r[k], keyword)));
    if (region) list = list.filter(r => String(r.region) === String(region));
    if (channelType) list = list.filter(r => String(r.channel_type) === String(channelType));
    if (validity) list = list.filter(r => relationValidity(r) === String(validity));
    return list;
};

const buildResellerRelationExportRows = (query = {}) => filterResellerRelation(readDb().master.reseller_relation, query);

const buildExportRowsByBizType = (bizType, querySnapshot) => {
    if (bizType === 'SKU') return buildSkuExportRows(querySnapshot);
    if (bizType === 'RESELLER_RLTN') return buildResellerRelationExportRows(querySnapshot);
    return [];
};

const createExportTaskRecord = (req, payload) => {
    const task = appendTaskRecord('EXPORT', {
        bizType: payload.bizType,
        taskName: payload.taskName,
        fileName: payload.fileName,
        operatorId: req.user?.id,
        operatorName: req.user?.nickname || req.user?.username || '',
        requestPath: req.originalUrl || req.path || '',
        querySnapshot: payload.querySnapshot,
        status: payload.status || 'SUCCESS',
        totalCount: payload.totalCount,
        successCount: payload.successCount,
        failCount: payload.failCount,
        resultMessage: payload.resultMessage,
        resultPayload: payload.resultPayload
    });
    if (task) {
        appendNotification({
            title: '导出任务完成',
            content: `${payload.taskName || payload.bizType} 导出完成，共 ${toNum(payload.totalCount, 0)} 条`,
            bizType: 'EXPORT_TASK',
            bizId: task.id,
            receiverId: req.user?.id,
            receiverName: req.user?.nickname || req.user?.username || ''
        });
    }
    appendOperationLog(req, {
        moduleCode: 'export_task',
        bizObjectType: 'export_task',
        bizObjectId: task?.id || '',
        actionType: 'EXPORT',
        resultStatus: payload.status || 'SUCCESS',
        message: `导出 ${payload.bizType} 数据，共 ${toNum(payload.totalCount, 0)} 条`,
        requestSummary: payload.querySnapshot,
        afterSnapshot: task
    });
    return task;
};

app.get('/api/master/SKU/export', superAdminRequired, (req, res) => {
    const list = buildSkuExportRows(req.query || {});
    const now = new Date();
    const fileName = `sku_export_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
    const task = createExportTaskRecord(req, {
        bizType: 'SKU',
        taskName: 'SKU导出',
        fileName,
        querySnapshot: req.query || {},
        totalCount: list.length,
        successCount: list.length,
        failCount: 0,
        resultMessage: `导出完成，共 ${list.length} 条`,
        resultPayload: { previewRows: list.slice(0, 100), totalRows: list.length }
    });
    apiOk(res, req, { list, taskId: task?.id || null }, '获取成功');
});

app.get('/api/master/RESELLER_RLTN/list', superAdminRequired, (req, res) => {
    const { page = 1, pageSize = 20 } = req.query || {};
    const list = filterResellerRelation(readDb().master.reseller_relation, req.query).sort((a, b) => toNum(b.id) - toNum(a.id));
    apiOk(res, req, paginate(list, page, pageSize), '获取成功');
});

app.post('/api/master/RESELLER_RLTN', superAdminRequired, (req, res) => {
    const body = req.body || {};
    if (!body.sku_code || !body.reseller_code || !body.begin_date || !body.end_date) return apiErr(res, req, 400, '关键字段不能为空');
    if (toDateKey(body.begin_date) > toDateKey(body.end_date)) return apiErr(res, req, 400, '开始日期不能晚于结束日期');
    try {
        updateDb((db) => {
            const exists = db.master.reseller_relation.find(r => r.sku_code === body.sku_code && r.reseller_code === body.reseller_code);
            if (exists) throw new Error('同一SKU与经销商关系已存在');
            db.master.reseller_relation.push({
                id: nextId(db.master.reseller_relation),
                sku_code: String(body.sku_code),
                reseller_code: String(body.reseller_code),
                reseller_name: String(body.reseller_name || ''),
                region: String(body.region || ''),
                channel_type: String(body.channel_type || 'DIST'),
                begin_date: toDateKey(body.begin_date),
                end_date: toDateKey(body.end_date),
                price_grade: String(body.price_grade || 'A'),
                quota_cases: toNum(body.quota_cases, 0),
                status: 1,
                created_time: nowIso(),
                updated_time: nowIso()
            });
        });
    } catch (error) {
        return apiErr(res, req, 400, error.message || '新增失败');
    }
    apiOk(res, req, true, '新增成功');
});

app.put('/api/master/RESELLER_RLTN/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    if (body.begin_date && body.end_date && toDateKey(body.begin_date) > toDateKey(body.end_date)) return apiErr(res, req, 400, '开始日期不能晚于结束日期');
    let found = false;
    updateDb((db) => {
        const row = db.master.reseller_relation.find(r => Number(r.id) === id);
        if (!row) return;
        Object.assign(row, {
            reseller_name: body.reseller_name !== undefined ? String(body.reseller_name) : row.reseller_name,
            region: body.region !== undefined ? String(body.region) : row.region,
            channel_type: body.channel_type !== undefined ? String(body.channel_type) : row.channel_type,
            begin_date: body.begin_date !== undefined ? toDateKey(body.begin_date) : row.begin_date,
            end_date: body.end_date !== undefined ? toDateKey(body.end_date) : row.end_date,
            price_grade: body.price_grade !== undefined ? String(body.price_grade) : row.price_grade,
            quota_cases: body.quota_cases !== undefined ? toNum(body.quota_cases, row.quota_cases) : row.quota_cases,
            updated_time: nowIso()
        });
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '数据不存在');
    apiOk(res, req, true, '编辑成功');
});

app.delete('/api/master/RESELLER_RLTN/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id);
    let found = false;
    updateDb((db) => {
        const row = db.master.reseller_relation.find(r => Number(r.id) === id);
        if (!row) return;
        row.status = 0;
        row.updated_time = nowIso();
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '数据不存在');
    apiOk(res, req, true, '撤销成功');
});

app.delete('/api/master/RESELLER_RLTN/batch', superAdminRequired, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => toNum(v)).filter(v => !Number.isNaN(v)) : [];
    if (!ids.length) return apiErr(res, req, 400, '请选择要撤销的数据');
    updateDb((db) => {
        db.master.reseller_relation.forEach(row => {
            if (ids.includes(Number(row.id))) {
                row.status = 0;
                row.updated_time = nowIso();
            }
        });
    });
    apiOk(res, req, true, `已处理 ${ids.length} 条数据`);
});

app.get('/api/master/RESELLER_RLTN/export', superAdminRequired, (req, res) => {
    const list = buildResellerRelationExportRows(req.query || {});
    const now = new Date();
    const fileName = `reseller_relation_export_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
    const task = createExportTaskRecord(req, {
        bizType: 'RESELLER_RLTN',
        taskName: '经销关系导出',
        fileName,
        querySnapshot: req.query || {},
        totalCount: list.length,
        successCount: list.length,
        failCount: 0,
        resultMessage: `导出完成，共 ${list.length} 条`,
        resultPayload: { previewRows: list.slice(0, 100), totalRows: list.length }
    });
    apiOk(res, req, { list, taskId: task?.id || null }, '获取成功');
});
const genericListConfigs = [
    {
        route: 'spu',
        table: 'spu',
        codeField: 'spu_code',
        nameField: 'spu_name',
        keywordFields: ['spu_code', 'spu_name', 'category_code', 'category_name', 'product_line', 'process_type', 'origin_region'],
        extraFilter: (rows, q) => rows.filter(r =>
            (!q.categoryCode || contains(r.category_code, q.categoryCode)) &&
            (!q.productLine || contains(r.product_line, q.productLine)) &&
            (!q.lifecycleStatus || String(r.lifecycle_status) === String(q.lifecycleStatus))
        ),
        decorateRows: (rows, db) => withSpuMetrics(rows, db.master?.sku || []),
        formatPayload: getSpuPayload
    },
    {
        route: 'warehouse',
        table: 'warehouse',
        codeField: 'warehouse_code',
        keywordFields: ['warehouse_code', 'warehouse_name', 'factory_name', 'city_name'],
        extraFilter: (rows, q) => rows.filter(r =>
            (!q.lv1TypeName || contains(r.lv1_type_name, q.lv1TypeName)) &&
            (!q.factoryCode || contains(r.factory_code, q.factoryCode)) &&
            (q.isOwn === undefined || q.isOwn === '' || String(r.is_own) === String(q.isOwn))
        )
    },
    {
        route: 'factory',
        table: 'factory',
        codeField: 'factory_code',
        keywordFields: ['factory_code', 'factory_name', 'company_name', 'city_name'],
        extraFilter: (rows, q) => rows.filter(r => (q.isOwn === undefined || q.isOwn === '' || String(r.is_own) === String(q.isOwn)))
    },
    {
        route: 'reseller',
        table: 'reseller',
        codeField: 'reseller_code',
        keywordFields: ['reseller_code', 'reseller_name', 'sale_region_name', 'city_name'],
        extraFilter: (rows, q) => rows.filter(r =>
            (!q.lv1ChannelCode || contains(r.lv1_channel_code, q.lv1ChannelCode)) &&
            (q.isOwn === undefined || q.isOwn === '' || String(r.is_own) === String(q.isOwn))
        )
    }
];

genericListConfigs.forEach((cfg) => {
    app.get(`/api/master/${cfg.route}`, superAdminRequired, (req, res) => {
        const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query || {};
        const db = readDb();
        let rows = withMasterFilter(db.master[cfg.table], { keyword, status }, cfg.keywordFields);
        rows = cfg.extraFilter ? cfg.extraFilter(rows, req.query || {}) : rows;
        rows = cfg.decorateRows ? cfg.decorateRows(rows, db) : rows;
        rows.sort((a, b) => toNum(b.id) - toNum(a.id));
        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.post(`/api/master/${cfg.route}`, superAdminRequired, (req, res) => {
        const body = req.body || {};
        try {
            updateDb((db) => {
                const payload = cfg.formatPayload ? cfg.formatPayload(body, db) : body;
                if (!payload[cfg.codeField]) throw new Error('编码不能为空');
                if (cfg.nameField && !payload[cfg.nameField]) throw new Error('名称不能为空');
                const rows = db.master[cfg.table];
                if (rows.some(r => String(r[cfg.codeField]) === String(payload[cfg.codeField]))) throw new Error('编码已存在');
                rows.push({ id: nextId(rows), ...payload, status: toNum(payload.status, 1), created_time: nowIso(), updated_time: nowIso() });
            });
        } catch (error) {
            return apiErr(res, req, 400, error.message || '新增失败');
        }
        apiOk(res, req, true, '新增成功');
    });

    app.put(`/api/master/${cfg.route}/:id`, superAdminRequired, (req, res) => {
        const id = toNum(req.params.id);
        let found = false;
        updateDb((db) => {
            const row = db.master[cfg.table].find(r => Number(r.id) === id);
            if (!row) return;
            const payload = cfg.formatPayload ? cfg.formatPayload({ ...row, ...req.body }, db) : req.body;
            Object.assign(row, { ...payload, id: row.id, updated_time: nowIso() });
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '数据不存在');
        apiOk(res, req, true, '编辑成功');
    });

    app.delete(`/api/master/${cfg.route}/:id`, superAdminRequired, (req, res) => {
        const id = toNum(req.params.id);
        let found = false;
        updateDb((db) => {
            const row = db.master[cfg.table].find(r => Number(r.id) === id);
            if (!row) return;
            row.status = 0;
            row.updated_time = nowIso();
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '数据不存在');
        apiOk(res, req, true, '删除成功');
    });

    app.delete(`/api/master/${cfg.route}/batch`, superAdminRequired, (req, res) => {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => toNum(v)).filter(v => !Number.isNaN(v)) : [];
        if (!ids.length) return apiErr(res, req, 400, '请先选择数据');
        updateDb((db) => {
            db.master[cfg.table].forEach(row => {
                if (ids.includes(Number(row.id))) {
                    row.status = 0;
                    row.updated_time = nowIso();
                }
            });
        });
        apiOk(res, req, true, `已处理 ${ids.length} 条数据`);
    });
});

const treeConfigs = [
    { route: 'category', table: 'category', codeField: 'category_code', nameField: 'category_name' },
    { route: 'channel', table: 'channel', codeField: 'channel_code', nameField: 'channel_name' },
    { route: 'org', table: 'org', codeField: 'org_code', nameField: 'org_name' }
];

treeConfigs.forEach((cfg) => {
    app.get(`/api/master/${cfg.route}/tree`, superAdminRequired, (req, res) => {
        const rows = [...readDb().master[cfg.table]].sort((a, b) => toNum(a.level) - toNum(b.level) || toNum(a.sort_order) - toNum(b.sort_order));
        apiOk(res, req, rows, '获取成功');
    });

    app.post(`/api/master/${cfg.route}`, superAdminRequired, (req, res) => {
        const body = req.body || {};
        if (!body[cfg.codeField] || !body[cfg.nameField]) return apiErr(res, req, 400, '编码和名称不能为空');
        try {
            updateDb((db) => {
                const rows = db.master[cfg.table];
                if (rows.some(r => String(r[cfg.codeField]) === String(body[cfg.codeField]))) throw new Error('编码已存在');
                rows.push({
                    id: nextId(rows),
                    ...body,
                    level: toNum(body.level, body.parent_code ? 2 : 1),
                    sort_order: toNum(body.sort_order, rows.length + 1),
                    status: toNum(body.status, 1),
                    created_time: nowIso(),
                    updated_time: nowIso()
                });
            });
        } catch (error) {
            return apiErr(res, req, 400, error.message || '新增失败');
        }
        apiOk(res, req, true, '新增成功');
    });

    app.put(`/api/master/${cfg.route}/:id`, superAdminRequired, (req, res) => {
        const id = toNum(req.params.id);
        let found = false;
        updateDb((db) => {
            const row = db.master[cfg.table].find(r => Number(r.id) === id);
            if (!row) return;
            Object.assign(row, { ...req.body, updated_time: nowIso() });
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '数据不存在');
        apiOk(res, req, true, '编辑成功');
    });

    app.delete(`/api/master/${cfg.route}/:id`, superAdminRequired, (req, res) => {
        const id = toNum(req.params.id);
        const db = readDb();
        const row = db.master[cfg.table].find(r => Number(r.id) === id);
        if (!row) return apiErr(res, req, 404, '数据不存在');
        if (db.master[cfg.table].some(r => String(r.parent_code || '') === String(row[cfg.codeField]))) {
            return apiErr(res, req, 400, '存在子节点，无法删除');
        }
        updateDb((raw) => {
            raw.master[cfg.table] = raw.master[cfg.table].filter(r => Number(r.id) !== id);
        });
        apiOk(res, req, true, '删除成功');
    });
});

const relationConfigs = [
    { route: 'rltn/warehouse-sku', table: 'rltn_warehouse_sku', uniqueKey: ['warehouse_code', 'sku_code'], keywordFields: ['warehouse_code', 'warehouse_name', 'sku_code', 'sku_name'] },
    { route: 'rltn/org-reseller', table: 'rltn_org_reseller', uniqueKey: ['org_code', 'reseller_code'], keywordFields: ['org_code', 'org_name', 'reseller_code', 'reseller_name'] },
    { route: 'rltn/product-sku', table: 'rltn_product_sku', uniqueKey: ['product_code', 'sku_code'], keywordFields: ['product_code', 'product_name', 'sku_code', 'sku_name'] }
];

relationConfigs.forEach((cfg) => {
    app.get(`/api/master/${cfg.route}`, superAdminRequired, (req, res) => {
        const { page = 1, pageSize = 20, keyword = '', dateStatus = '', status = '' } = req.query || {};
        let rows = withMasterFilter(readDb().master[cfg.table], { keyword, status }, cfg.keywordFields);
        if (dateStatus) rows = rows.filter(r => relationValidity(r) === String(dateStatus));
        rows.sort((a, b) => toNum(b.id) - toNum(a.id));
        apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
    });

    app.post(`/api/master/${cfg.route}`, superAdminRequired, (req, res) => {
        const body = req.body || {};
        for (const k of cfg.uniqueKey) {
            if (!body[k]) return apiErr(res, req, 400, `${k}不能为空`);
        }
        try {
            updateDb((db) => {
                const rows = db.master[cfg.table];
                const exists = rows.find(r => cfg.uniqueKey.every(k => String(r[k]) === String(body[k])));
                if (exists) throw new Error('关系已存在');
                rows.push({
                    id: nextId(rows),
                    ...body,
                    begin_date: toDateKey(body.begin_date),
                    end_date: toDateKey(body.end_date),
                    status: toNum(body.status, 1),
                    created_time: nowIso(),
                    updated_time: nowIso()
                });
            });
        } catch (error) {
            return apiErr(res, req, 400, error.message || '新增失败');
        }
        apiOk(res, req, true, '新增成功');
    });

    app.put(`/api/master/${cfg.route}/:id`, superAdminRequired, (req, res) => {
        const id = toNum(req.params.id);
        let found = false;
        updateDb((db) => {
            const row = db.master[cfg.table].find(r => Number(r.id) === id);
            if (!row) return;
            Object.assign(row, {
                ...req.body,
                begin_date: req.body?.begin_date !== undefined ? toDateKey(req.body.begin_date) : row.begin_date,
                end_date: req.body?.end_date !== undefined ? toDateKey(req.body.end_date) : row.end_date,
                updated_time: nowIso()
            });
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '数据不存在');
        apiOk(res, req, true, '编辑成功');
    });

    app.delete(`/api/master/${cfg.route}/:id`, superAdminRequired, (req, res) => {
        const id = toNum(req.params.id);
        let found = false;
        updateDb((db) => {
            const row = db.master[cfg.table].find(r => Number(r.id) === id);
            if (!row) return;
            row.status = 0;
            row.updated_time = nowIso();
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '数据不存在');
        apiOk(res, req, true, '删除成功');
    });

    app.delete(`/api/master/${cfg.route}/batch`, superAdminRequired, (req, res) => {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(v => toNum(v)).filter(v => !Number.isNaN(v)) : [];
        if (!ids.length) return apiErr(res, req, 400, '请先选择数据');
        updateDb((db) => {
            db.master[cfg.table].forEach(row => {
                if (ids.includes(Number(row.id))) {
                    row.status = 0;
                    row.updated_time = nowIso();
                }
            });
        });
        apiOk(res, req, true, `已处理 ${ids.length} 条数据`);
    });
});

app.get('/api/master/calendar/month', superAdminRequired, (req, res) => {
    const year = String(req.query?.year || '');
    const month = String(req.query?.month || '').padStart(2, '0');
    const prefix = `${year}-${month}-`;
    const rows = readDb().master.calendar.filter(r => String(r.cal_date).startsWith(prefix));
    apiOk(res, req, rows, '获取成功');
});

app.get('/api/master/calendar', superAdminRequired, (req, res) => {
    const { year = '2026', month = '', isHoliday = '', isWorkday = '', page = 1, pageSize = 50 } = req.query || {};
    let rows = readDb().master.calendar.filter(r => String(r.cal_date).startsWith(`${year}-`));
    if (month) rows = rows.filter(r => String(r.cal_date).slice(5, 7) === String(month).padStart(2, '0'));
    if (isHoliday !== '') rows = rows.filter(r => String(r.is_holiday) === String(isHoliday));
    if (isWorkday !== '') rows = rows.filter(r => String(r.is_workday) === String(isWorkday));
    rows.sort((a, b) => String(a.cal_date).localeCompare(String(b.cal_date)));
    apiOk(res, req, paginate(rows, page, pageSize), '获取成功');
});

app.put('/api/master/calendar/:id', superAdminRequired, (req, res) => {
    const id = toNum(req.params.id);
    const body = req.body || {};
    let found = false;
    updateDb((db) => {
        const row = db.master.calendar.find(c => Number(c.id) === id);
        if (!row) return;
        row.is_workday = body.is_workday !== undefined ? toNum(body.is_workday, row.is_workday) : row.is_workday;
        row.is_holiday = body.is_holiday !== undefined ? toNum(body.is_holiday, row.is_holiday) : row.is_holiday;
        row.holiday_name = body.holiday_name !== undefined ? String(body.holiday_name) : row.holiday_name;
        row.remark = body.remark !== undefined ? String(body.remark) : row.remark;
        row.updated_time = nowIso();
        found = true;
    });
    if (!found) return apiErr(res, req, 404, '数据不存在');
    apiOk(res, req, true, '更新成功');
});

app.post('/api/master/import', superAdminRequired, upload.single('file'), (req, res) => {
    const tableType = String(req.body?.tableType || '').toUpperCase();
    if (!req.file) return apiErr(res, req, 400, '请上传文件');
    if (!['SKU', 'RESELLER_RLTN'].includes(tableType)) return apiErr(res, req, 400, '暂不支持该表类型导入');

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    let successCount = 0;
    const errors = [];

    updateDb((db) => {
        if (tableType === 'SKU') {
            rows.forEach((r, idx) => {
                const skuCode = normalizeSkuCode(r.sku_code || r['SKU编码'] || r['编码'] || '');
                const skuName = String(r.sku_name || r['SKU名称'] || r['名称'] || '').trim();
                if (!skuCode || !skuName) {
                    errors.push({ rowNumber: idx + 2, error: '缺少SKU编码或SKU名称' });
                    return;
                }
                const target = db.master.sku.find((s) => normalizeSkuCode(s.sku_code) === skuCode);
                const validation = validateSkuCode(skuCode, db.platform?.dict_items);
                if (!validation.ok && !target) {
                    errors.push({ rowNumber: idx + 2, error: validation.errors[0] || 'SKU编码格式不正确' });
                    return;
                }
                const payload = formatSkuRow({
                    sku_code: validation.normalizedCode || skuCode,
                    sku_name: skuName,
                    bar_code: String(r.bar_code || r['69码'] || r['69码/国际码'] || '').trim(),
                    category_code: String(r.category_code || r['品类编码'] || '').trim(),
                    lifecycle_status: String(r.lifecycle_status || r['生命周期'] || 'ACTIVE').trim().toUpperCase(),
                    shelf_life_days: toNum(r.shelf_life_days || r['保质期(天)'] || r['保质期'] || 0),
                    unit_ratio: Number(r.unit_ratio || r['单位换算'] || 1),
                    volume_m3: Number(r.volume_m3 || r['规格体积(m³)'] || 0),
                    status: 1,
                    created_time: target?.created_time || nowIso(),
                    updated_time: nowIso()
                });
                if (target) Object.assign(target, payload);
                else db.master.sku.push({ id: nextId(db.master.sku), ...payload, created_time: nowIso() });
                successCount += 1;
            });
        } else {
            rows.forEach((r, idx) => {
                const skuCode = String(r.sku_code || r['SKU编码'] || '').trim();
                const resellerCode = String(r.reseller_code || r['经销商编码'] || '').trim();
                const beginDate = toDateKey(r.begin_date || r['生效开始日期'] || r['开始日期']);
                const endDate = toDateKey(r.end_date || r['生效结束日期'] || r['结束日期']);
                if (!skuCode || !resellerCode || !beginDate || !endDate) {
                    errors.push({ rowNumber: idx + 2, error: '缺少关键字段' });
                    return;
                }
                if (beginDate > endDate) {
                    errors.push({ rowNumber: idx + 2, error: '开始日期晚于结束日期' });
                    return;
                }
                const payload = {
                    sku_code: skuCode,
                    reseller_code: resellerCode,
                    reseller_name: String(r.reseller_name || r['经销商名称'] || ''),
                    region: String(r.region || r['所属大区'] || ''),
                    channel_type: String(r.channel_type || r['渠道类型'] || 'DIST'),
                    begin_date: beginDate,
                    end_date: endDate,
                    price_grade: String(r.price_grade || r['价格等级'] || 'A'),
                    quota_cases: toNum(r.quota_cases || r['月度配额(箱)'] || 0),
                    status: 1,
                    updated_time: nowIso()
                };
                const target = db.master.reseller_relation.find(s => s.sku_code === skuCode && s.reseller_code === resellerCode);
                if (target) Object.assign(target, payload);
                else db.master.reseller_relation.push({ id: nextId(db.master.reseller_relation), ...payload, created_time: nowIso() });
                successCount += 1;
            });
        }
    });

    const failCount = errors.length;
    const totalCount = rows.length;
    const status = failCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL_SUCCESS' : 'FAILED');
    const summary = {
        tableType,
        totalRows: totalCount,
        totalCount,
        successCount,
        failCount,
        errorCount: failCount,
        errors
    };
    const task = appendTaskRecord('IMPORT', {
        bizType: tableType,
        taskName: `${tableType} 导入`,
        fileName: req.file.originalname || '',
        operatorId: req.user?.id,
        operatorName: req.user?.nickname || req.user?.username || '',
        requestPath: req.originalUrl || req.path || '',
        querySnapshot: { tableType },
        status,
        totalCount,
        successCount,
        failCount,
        resultMessage: `导入处理完成：成功 ${successCount}，失败 ${failCount}`,
        resultPayload: summary
    });
    if (task) {
        appendNotification({
            title: '导入任务完成',
            content: `${tableType} 导入完成，成功 ${successCount}，失败 ${failCount}`,
            bizType: 'IMPORT_TASK',
            bizId: task.id,
            receiverId: req.user?.id,
            receiverName: req.user?.nickname || req.user?.username || ''
        });
    }
    appendOperationLog(req, {
        moduleCode: 'import_task',
        bizObjectType: 'import_task',
        bizObjectId: task?.id || '',
        actionType: 'IMPORT',
        resultStatus: status === 'FAILED' ? 'FAILED' : 'SUCCESS',
        message: `${tableType} 导入，成功 ${successCount}，失败 ${failCount}`,
        requestSummary: { tableType, fileName: req.file.originalname || '' },
        afterSnapshot: task
    });

    apiOk(res, req, {
        ...summary,
        taskId: task?.id || null
    }, '导入处理完成');
});

app.use((err, req, res, next) => {
    console.error('[Unhandled Error]', err);
    if (res.headersSent) return next(err);
    apiErr(res, req, 500, err?.message || '服务器内部错误');
});

app.listen(PORT, () => {
    console.log(`[Local API] Server running on http://localhost:${PORT}`);
    console.log(`[Local API] Data file: ${DB_FILE}`);
});
