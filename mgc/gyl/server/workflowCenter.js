const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const ensureArray = (value) => (Array.isArray(value) ? value : []);
const toNum = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
};
const contains = (text, keyword) => String(text || '').toLowerCase().includes(String(keyword || '').trim().toLowerCase());

const PRIORITY_ORDER = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3
};
const GENERIC_WORKFLOW_PATH = '/workflow-center';

const buildBizLinkPath = ({ bizType, bizId, fallback = '' }) => {
    const safeFallback = String(fallback || '').trim();
    if (safeFallback && safeFallback !== GENERIC_WORKFLOW_PATH) return safeFallback;

    const type = String(bizType || '').toUpperCase();
    const safeBizId = String(bizId || '').trim();
    if (type === 'ORDER' && safeBizId) {
        return `/intelligent-closed-loop?orderNo=${encodeURIComponent(safeBizId)}`;
    }
    if (type === 'TRANSFER' && safeBizId) {
        return `/inventory-ops?transferNo=${encodeURIComponent(safeBizId)}`;
    }
    if (type === 'MDM' && safeBizId) {
        return `/mdm/governance?requestNo=${encodeURIComponent(safeBizId)}`;
    }
    if (type === 'TASK') {
        const taskKey = safeBizId ? (safeBizId.includes('-') ? safeBizId : `WF-${safeBizId}`) : '';
        return taskKey
            ? `${GENERIC_WORKFLOW_PATH}?tab=task&taskKey=${encodeURIComponent(taskKey)}`
            : `${GENERIC_WORKFLOW_PATH}?tab=task`;
    }
    return safeFallback || GENERIC_WORKFLOW_PATH;
};

const DEFAULT_TIMEOUT_RULES = [
    { id: 1, biz_type: 'ORDER', timeout_hours: 12, escalate_hours: 24, escalate_to: '运营经理', enabled: 1 },
    { id: 2, biz_type: 'MDM', timeout_hours: 24, escalate_hours: 48, escalate_to: '主数据负责人', enabled: 1 },
    { id: 3, biz_type: 'TRANSFER', timeout_hours: 8, escalate_hours: 16, escalate_to: '仓配负责人', enabled: 1 },
    { id: 4, biz_type: 'TASK', timeout_hours: 4, escalate_hours: 8, escalate_to: '系统管理员', enabled: 1 }
];

const ensureWorkflowStructures = (db) => {
    db.platform = db.platform && typeof db.platform === 'object' ? db.platform : {};
    db.platform.workflow_todos = ensureArray(db.platform.workflow_todos);
    db.platform.workflow_approvals = ensureArray(db.platform.workflow_approvals);
    db.platform.workflow_messages = ensureArray(db.platform.workflow_messages);
    db.platform.workflow_tasks = ensureArray(db.platform.workflow_tasks);
    db.platform.workflow_reminders = ensureArray(db.platform.workflow_reminders);
    db.platform.workflow_timeout_rules = ensureArray(db.platform.workflow_timeout_rules);

    if (!db.platform.workflow_timeout_rules.length) {
        db.platform.workflow_timeout_rules = DEFAULT_TIMEOUT_RULES.map((item) => ({
            ...item,
            updated_by: 'system',
            updated_at: nowIso()
        }));
    }
};

const appendWorkflowMessage = (db, payload) => {
    const rows = ensureArray(db.platform.workflow_messages);
    db.platform.workflow_messages = rows;
    rows.push({
        id: nextId(rows),
        category: payload.category || 'GENERAL',
        title: payload.title || '',
        content: payload.content || '',
        status: payload.status || 'UNREAD',
        priority: payload.priority || 'P2',
        receiver_id: payload.receiverId ?? null,
        receiver_name: payload.receiverName || '',
        link_path: buildBizLinkPath({ bizType: payload.bizType, bizId: payload.bizId, fallback: payload.linkPath || '' }),
        biz_type: payload.bizType || '',
        biz_id: payload.bizId || '',
        created_at: nowIso(),
        read_at: ''
    });
};

const normalizeWorkflowLinksForUser = (db, userId) => {
    ensureWorkflowStructures(db);
    db.platform.workflow_messages.forEach((row) => {
        if (Number(row.receiver_id) !== userId) return;
        row.link_path = buildBizLinkPath({ bizType: row.biz_type, bizId: row.biz_id, fallback: row.link_path });
    });
    db.platform.workflow_todos.forEach((row) => {
        if (Number(row.assignee_id) !== userId) return;
        row.source_path = buildBizLinkPath({ bizType: row.biz_type, bizId: row.biz_id, fallback: row.source_path });
    });
};

const getUserName = (user) => String(user?.nickname || user?.username || `用户${toNum(user?.id, 0)}`);

const seedWorkflowDataForUser = (db, user) => {
    ensureWorkflowStructures(db);
    const userId = toNum(user?.id, 0);
    if (!userId) return;
    const exists = db.platform.workflow_todos.some((row) => Number(row.assignee_id) === userId);
    if (exists) {
        normalizeWorkflowLinksForUser(db, userId);
        return;
    }

    const userName = getUserName(user);
    const now = new Date();
    const dueIso = (hourOffset) => new Date(now.getTime() + hourOffset * 3600 * 1000).toISOString();

    const createApproval = ({ bizType, bizId, title, priority, dueHours, applicant }) => {
        const approvalRows = db.platform.workflow_approvals;
        const todoRows = db.platform.workflow_todos;
        const approvalId = nextId(approvalRows);
        approvalRows.push({
            id: approvalId,
            biz_type: bizType,
            biz_id: bizId,
            title,
            status: 'PENDING',
            applicant_name: applicant,
            applicant_id: userId,
            reviewer_id: userId,
            reviewer_name: userName,
            submitted_at: nowIso(),
            reviewed_at: '',
            review_comment: '',
            records: [{ action: 'SUBMIT', operator: applicant, comment: '提交审批', created_at: nowIso() }]
        });

        todoRows.push({
            id: nextId(todoRows),
            todo_type: 'APPROVAL',
            title,
            summary: `${bizType} 审批待处理`,
            biz_type: bizType,
            biz_id: bizId,
            priority,
            due_at: dueIso(dueHours),
            status: 'PENDING',
            assignee_id: userId,
            assignee_name: userName,
            source_path: buildBizLinkPath({ bizType, bizId, fallback: GENERIC_WORKFLOW_PATH }),
            approval_id: approvalId,
            task_id: null,
            remind_count: 0,
            last_remind_at: '',
            escalated: 0,
            created_at: nowIso(),
            updated_at: nowIso(),
            done_at: '',
            done_comment: ''
        });
    };

    createApproval({ bizType: 'ORDER', bizId: 'SO202604120001', title: '订单审批：华东鲜奶补货单', priority: 'P0', dueHours: 4, applicant: '陈建国' });
    createApproval({ bizType: 'MDM', bizId: 'CR202604120008', title: '主数据审批：渠道层级变更申请', priority: 'P1', dueHours: 16, applicant: '周维' });
    createApproval({ bizType: 'TRANSFER', bizId: 'TR202604120021', title: '调拨审批：郑州仓紧急补货', priority: 'P1', dueHours: 8, applicant: '李强' });

    const taskRows = db.platform.workflow_tasks;
    const failedTaskId = nextId(taskRows);
    taskRows.push({
        id: failedTaskId,
        task_code: 'SYNC-MDM-20260412-01',
        task_name: '主数据增量同步任务',
        task_type: 'SYNC',
        status: 'FAILED',
        owner_id: userId,
        owner_name: userName,
        started_at: nowIso(),
        finished_at: nowIso(),
        retry_count: 0,
        max_retry: 3,
        last_error: '远程主数据服务 502',
        logs: [
            { id: 1, level: 'INFO', message: '任务启动', created_at: nowIso() },
            { id: 2, level: 'ERROR', message: '下游接口响应超时', created_at: nowIso() }
        ]
    });

    db.platform.workflow_todos.push({
        id: nextId(db.platform.workflow_todos),
        todo_type: 'TASK_FAILED',
        title: '失败任务待查看：主数据增量同步',
        summary: '批处理任务失败，请查看日志并重试',
        biz_type: 'TASK',
        biz_id: String(failedTaskId),
        priority: 'P1',
        due_at: dueIso(2),
        status: 'PENDING',
        assignee_id: userId,
        assignee_name: userName,
        source_path: buildBizLinkPath({ bizType: 'TASK', bizId: String(failedTaskId), fallback: GENERIC_WORKFLOW_PATH }),
        approval_id: null,
        task_id: failedTaskId,
        remind_count: 0,
        last_remind_at: '',
        escalated: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
        done_at: '',
        done_comment: ''
    });

    db.platform.workflow_todos.push({
        id: nextId(db.platform.workflow_todos),
        todo_type: 'EXCEPTION',
        title: '异常待处理：低温运输超时预警',
        summary: '冷链运输时效超阈值，请确认催办',
        biz_type: 'EXCEPTION',
        biz_id: 'EXP-20260412-01',
        priority: 'P2',
        due_at: dueIso(-1),
        status: 'PENDING',
        assignee_id: userId,
        assignee_name: userName,
        source_path: buildBizLinkPath({ bizType: 'EXCEPTION', bizId: 'EXP-20260412-01', fallback: GENERIC_WORKFLOW_PATH }),
        approval_id: null,
        task_id: null,
        remind_count: 0,
        last_remind_at: '',
        escalated: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
        done_at: '',
        done_comment: ''
    });

    db.platform.workflow_todos.push({
        id: nextId(db.platform.workflow_todos),
        todo_type: 'APPROVAL',
        title: '已办：订单审批 SO202604100045',
        summary: '你已完成订单审批',
        biz_type: 'ORDER',
        biz_id: 'SO202604100045',
        priority: 'P2',
        due_at: dueIso(-12),
        status: 'DONE',
        assignee_id: userId,
        assignee_name: userName,
        source_path: buildBizLinkPath({ bizType: 'ORDER', bizId: 'SO202604100045', fallback: GENERIC_WORKFLOW_PATH }),
        approval_id: null,
        task_id: null,
        remind_count: 0,
        last_remind_at: '',
        escalated: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
        done_at: nowIso(),
        done_comment: '审批通过'
    });

    appendWorkflowMessage(db, {
        category: 'TODO',
        title: '你有新的待办审批',
        content: '订单审批 SO202604120001 已流转到你，请及时处理。',
        priority: 'P0',
        receiverId: userId,
        receiverName: userName,
        linkPath: '/workflow-center',
        bizType: 'ORDER',
        bizId: 'SO202604120001'
    });
    appendWorkflowMessage(db, {
        category: 'TASK',
        title: '任务执行失败',
        content: '主数据增量同步任务执行失败，建议查看日志并重试。',
        priority: 'P1',
        receiverId: userId,
        receiverName: userName,
        linkPath: '/workflow-center',
        bizType: 'TASK',
        bizId: String(failedTaskId)
    });
    normalizeWorkflowLinksForUser(db, userId);
};

const buildTodoRow = (row) => {
    const overdue = row.status !== 'DONE' && row.due_at && String(row.due_at) < nowIso();
    return {
        ...row,
        overdue: Boolean(overdue)
    };
};

const sortTodos = (rows) => rows.sort((a, b) => {
    const priorityDiff = toNum(PRIORITY_ORDER[a.priority], 99) - toNum(PRIORITY_ORDER[b.priority], 99);
    if (priorityDiff !== 0) return priorityDiff;
    return String(a.due_at || '').localeCompare(String(b.due_at || ''));
});

const getRuleByBizType = (db, bizType) => db.platform.workflow_timeout_rules.find((rule) => String(rule.biz_type) === String(bizType) && Number(rule.enabled) === 1);

const collectUserTaskRows = (db, userId) => {
    const workflowRows = ensureArray(db.platform.workflow_tasks)
        .filter((row) => Number(row.owner_id) === Number(userId))
        .map((row) => ({
            task_key: `WF-${row.id}`,
            task_name: row.task_name,
            task_type: row.task_type,
            status: row.status,
            owner_name: row.owner_name,
            started_at: row.started_at,
            finished_at: row.finished_at,
            retry_count: toNum(row.retry_count, 0),
            max_retry: toNum(row.max_retry, 0),
            last_error: row.last_error || '',
            retryable: ['FAILED', 'PARTIAL_SUCCESS'].includes(String(row.status))
        }));

    const importRows = ensureArray(db.platform.import_tasks)
        .filter((row) => Number(row.operator_id || userId) === Number(userId))
        .map((row) => ({
            task_key: `IMPORT-${row.id}`,
            task_name: row.task_name,
            task_type: 'IMPORT',
            status: row.status,
            owner_name: row.operator_name,
            started_at: row.created_at,
            finished_at: row.finished_at,
            retry_count: 0,
            max_retry: 0,
            last_error: toNum(row.fail_count, 0) > 0 ? (row.result_message || '存在失败记录') : '',
            retryable: ['FAILED', 'PARTIAL_SUCCESS'].includes(String(row.status))
        }));

    const exportRows = ensureArray(db.platform.export_tasks)
        .filter((row) => Number(row.operator_id || userId) === Number(userId))
        .map((row) => ({
            task_key: `EXPORT-${row.id}`,
            task_name: row.task_name,
            task_type: 'EXPORT',
            status: row.status,
            owner_name: row.operator_name,
            started_at: row.created_at,
            finished_at: row.finished_at,
            retry_count: 0,
            max_retry: 0,
            last_error: toNum(row.fail_count, 0) > 0 ? (row.result_message || '存在失败记录') : '',
            retryable: ['FAILED', 'PARTIAL_SUCCESS'].includes(String(row.status))
        }));

    return [...workflowRows, ...importRows, ...exportRows]
        .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
};

const withPagination = (rows, page, pageSize, paginate) => paginate(rows, page, pageSize);

const registerWorkflowCenterRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {
    app.get('/api/workflow-center/options', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        apiOk(res, req, {
            todo_type: ['APPROVAL', 'EXCEPTION', 'TASK_FAILED'],
            priority: ['P0', 'P1', 'P2', 'P3'],
            approval_status: ['PENDING', 'APPROVED', 'REJECTED'],
            message_status: ['UNREAD', 'READ'],
            task_status: ['RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL_SUCCESS']
        }, '获取成功');
    });

    app.get('/api/workflow-center/dashboard', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const db = readDb();
        ensureWorkflowStructures(db);
        const userId = toNum(req.user?.id, 0);
        const todos = db.platform.workflow_todos.filter((row) => Number(row.assignee_id) === userId && String(row.status) === 'PENDING');
        const dones = db.platform.workflow_todos.filter((row) => Number(row.assignee_id) === userId && String(row.status) === 'DONE');
        const messages = db.platform.workflow_messages.filter((row) => Number(row.receiver_id) === userId);
        const approvals = db.platform.workflow_approvals.filter((row) => Number(row.reviewer_id) === userId);
        const tasks = collectUserTaskRows(db, userId);
        apiOk(res, req, {
            todo_count: todos.length,
            done_count: dones.length,
            unread_message_count: messages.filter((row) => String(row.status) === 'UNREAD').length,
            approval_pending_count: approvals.filter((row) => String(row.status) === 'PENDING').length,
            task_failed_count: tasks.filter((row) => ['FAILED', 'PARTIAL_SUCCESS'].includes(String(row.status))).length,
            overdue_count: todos.filter((row) => row.due_at && String(row.due_at) < nowIso()).length
        }, '获取成功');
    });

    app.get('/api/workflow-center/todos', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const { page = 1, pageSize = 20, keyword = '', priority = '', bizType = '', overdue = '' } = req.query || {};
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        let rows = db.platform.workflow_todos.filter((row) => Number(row.assignee_id) === userId && String(row.status) === 'PENDING');
        if (keyword) rows = rows.filter((row) => contains(row.title, keyword) || contains(row.summary, keyword) || contains(row.biz_id, keyword));
        if (priority) rows = rows.filter((row) => String(row.priority) === String(priority));
        if (bizType) rows = rows.filter((row) => String(row.biz_type) === String(bizType));
        if (String(overdue) === '1') rows = rows.filter((row) => row.due_at && String(row.due_at) < nowIso());
        rows = sortTodos(rows).map(buildTodoRow);
        apiOk(res, req, withPagination(rows, page, pageSize, paginate), '获取成功');
    });

    app.get('/api/workflow-center/dones', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const { page = 1, pageSize = 20, keyword = '', bizType = '' } = req.query || {};
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        let rows = db.platform.workflow_todos.filter((row) => Number(row.assignee_id) === userId && String(row.status) === 'DONE');
        if (keyword) rows = rows.filter((row) => contains(row.title, keyword) || contains(row.summary, keyword) || contains(row.biz_id, keyword));
        if (bizType) rows = rows.filter((row) => String(row.biz_type) === String(bizType));
        rows = rows.sort((a, b) => String(b.done_at || '').localeCompare(String(a.done_at || '')));
        apiOk(res, req, withPagination(rows, page, pageSize, paginate), '获取成功');
    });

    app.post('/api/workflow-center/todos/:id/done', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const comment = String(req.body?.comment || '').trim();
        let found = false;
        updateDb((db) => {
            seedWorkflowDataForUser(db, req.user);
            const userId = toNum(req.user?.id, 0);
            const row = db.platform.workflow_todos.find((item) => Number(item.id) === id && Number(item.assignee_id) === userId && String(item.status) === 'PENDING');
            if (!row) return;
            row.status = 'DONE';
            row.done_at = nowIso();
            row.done_comment = comment;
            row.updated_at = nowIso();
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '待办不存在');
        apiOk(res, req, true, '处理完成');
    });

    app.post('/api/workflow-center/todos/:id/remind', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const comment = String(req.body?.comment || '请尽快处理').trim();
        let out = null;
        updateDb((db) => {
            seedWorkflowDataForUser(db, req.user);
            const userId = toNum(req.user?.id, 0);
            const row = db.platform.workflow_todos.find((item) => Number(item.id) === id && Number(item.assignee_id) === userId && String(item.status) === 'PENDING');
            if (!row) return;
            row.remind_count = toNum(row.remind_count, 0) + 1;
            row.last_remind_at = nowIso();
            row.updated_at = nowIso();
            db.platform.workflow_reminders.push({
                id: nextId(db.platform.workflow_reminders),
                todo_id: row.id,
                action: 'URGE',
                operator_id: userId,
                operator_name: getUserName(req.user),
                comment,
                created_at: nowIso()
            });

            const rule = getRuleByBizType(db, row.biz_type);
            const overdueHours = row.due_at ? Math.floor((Date.now() - new Date(row.due_at).getTime()) / 3600000) : -1;
            if (rule && overdueHours >= toNum(rule.escalate_hours, 9999) && Number(row.escalated) !== 1) {
                row.escalated = 1;
                db.platform.workflow_reminders.push({
                    id: nextId(db.platform.workflow_reminders),
                    todo_id: row.id,
                    action: 'ESCALATE',
                    operator_id: userId,
                    operator_name: getUserName(req.user),
                    comment: `超时升级至 ${rule.escalate_to}`,
                    created_at: nowIso()
                });
                appendWorkflowMessage(db, {
                    category: 'ESCALATION',
                    title: '待办已触发超时升级',
                    content: `${row.title} 已升级提醒给 ${rule.escalate_to}`,
                    priority: 'P0',
                    receiverId: userId,
                    receiverName: getUserName(req.user),
                    linkPath: '/workflow-center',
                    bizType: row.biz_type,
                    bizId: row.biz_id
                });
            }
            out = { ...row };
        });
        if (!out) return apiErr(res, req, 404, '待办不存在');
        apiOk(res, req, out, '催办成功');
    });

    app.get('/api/workflow-center/messages', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const { page = 1, pageSize = 20, status = '', category = '', keyword = '' } = req.query || {};
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        let rows = db.platform.workflow_messages.filter((row) => Number(row.receiver_id) === userId);
        if (status) rows = rows.filter((row) => String(row.status) === String(status));
        if (category) rows = rows.filter((row) => String(row.category) === String(category));
        if (keyword) rows = rows.filter((row) => contains(row.title, keyword) || contains(row.content, keyword));
        rows = rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        apiOk(res, req, withPagination(rows, page, pageSize, paginate), '获取成功');
    });

    app.patch('/api/workflow-center/messages/:id/read', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        let found = false;
        updateDb((db) => {
            seedWorkflowDataForUser(db, req.user);
            const userId = toNum(req.user?.id, 0);
            const row = db.platform.workflow_messages.find((item) => Number(item.id) === id && Number(item.receiver_id) === userId);
            if (!row) return;
            row.status = 'READ';
            row.read_at = nowIso();
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '消息不存在');
        apiOk(res, req, true, '已读成功');
    });

    app.patch('/api/workflow-center/messages/read-batch', authRequired, (req, res) => {
        const ids = ensureArray(req.body?.ids).map((id) => toNum(id, 0)).filter((id) => id > 0);
        const allUnread = Boolean(req.body?.allUnread);
        let changed = 0;
        updateDb((db) => {
            seedWorkflowDataForUser(db, req.user);
            const userId = toNum(req.user?.id, 0);
            db.platform.workflow_messages.forEach((row) => {
                if (Number(row.receiver_id) !== userId) return;
                const matched = allUnread ? String(row.status) === 'UNREAD' : ids.includes(Number(row.id));
                if (!matched) return;
                if (String(row.status) !== 'READ') {
                    row.status = 'READ';
                    row.read_at = nowIso();
                    changed += 1;
                }
            });
        });
        apiOk(res, req, { changed }, '批量已读成功');
    });

    app.get('/api/workflow-center/approvals', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const { page = 1, pageSize = 20, status = '', bizType = '', keyword = '' } = req.query || {};
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        let rows = db.platform.workflow_approvals.filter((row) => Number(row.reviewer_id) === userId);
        if (status) rows = rows.filter((row) => String(row.status) === String(status));
        if (bizType) rows = rows.filter((row) => String(row.biz_type) === String(bizType));
        if (keyword) rows = rows.filter((row) => contains(row.title, keyword) || contains(row.biz_id, keyword) || contains(row.applicant_name, keyword));
        rows = rows.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
        apiOk(res, req, withPagination(rows, page, pageSize, paginate), '获取成功');
    });

    app.get('/api/workflow-center/approvals/:id/records', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const id = toNum(req.params.id, 0);
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        const row = db.platform.workflow_approvals.find((item) => Number(item.id) === id && Number(item.reviewer_id) === userId);
        if (!row) return apiErr(res, req, 404, '审批单不存在');
        apiOk(res, req, ensureArray(row.records), '获取成功');
    });

    app.post('/api/workflow-center/approvals/:id/action', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const action = String(req.body?.action || '').toUpperCase();
        const comment = String(req.body?.comment || '').trim();
        if (!['APPROVE', 'REJECT'].includes(action)) return apiErr(res, req, 400, 'action 仅支持 APPROVE/REJECT');

        let found = false;
        updateDb((db) => {
            seedWorkflowDataForUser(db, req.user);
            const userId = toNum(req.user?.id, 0);
            const row = db.platform.workflow_approvals.find((item) => Number(item.id) === id && Number(item.reviewer_id) === userId);
            if (!row) return;
            if (String(row.status) !== 'PENDING') throw new Error('仅待审批单可操作');
            row.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
            row.reviewed_at = nowIso();
            row.review_comment = comment || (action === 'APPROVE' ? '审批通过' : '审批驳回');
            row.records = ensureArray(row.records);
            row.records.push({
                action,
                operator: getUserName(req.user),
                comment: row.review_comment,
                created_at: nowIso()
            });

            const todo = db.platform.workflow_todos.find((item) => Number(item.approval_id) === Number(row.id) && String(item.status) === 'PENDING');
            if (todo) {
                todo.status = 'DONE';
                todo.done_at = nowIso();
                todo.done_comment = row.review_comment;
                todo.updated_at = nowIso();
            }

            appendWorkflowMessage(db, {
                category: 'APPROVAL',
                title: `审批${action === 'APPROVE' ? '通过' : '驳回'}：${row.title}`,
                content: row.review_comment,
                priority: action === 'REJECT' ? 'P1' : 'P2',
                receiverId: userId,
                receiverName: getUserName(req.user),
                linkPath: '/workflow-center',
                bizType: row.biz_type,
                bizId: row.biz_id
            });
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '审批单不存在');
        apiOk(res, req, true, '审批成功');
    });

    app.get('/api/workflow-center/tasks', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const { page = 1, pageSize = 20, status = '', taskType = '', keyword = '' } = req.query || {};
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        let rows = collectUserTaskRows(db, userId);
        if (status) rows = rows.filter((row) => String(row.status) === String(status));
        if (taskType) rows = rows.filter((row) => String(row.task_type) === String(taskType));
        if (keyword) rows = rows.filter((row) => contains(row.task_name, keyword) || contains(row.task_key, keyword));
        apiOk(res, req, withPagination(rows, page, pageSize, paginate), '获取成功');
    });

    app.get('/api/workflow-center/tasks/:taskKey', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const taskKey = String(req.params.taskKey || '');
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        const row = collectUserTaskRows(db, userId).find((item) => String(item.task_key) === taskKey);
        if (!row) return apiErr(res, req, 404, '任务不存在');
        apiOk(res, req, row, '获取成功');
    });

    app.get('/api/workflow-center/tasks/:taskKey/logs', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const taskKey = String(req.params.taskKey || '');
        const [source, idStr] = taskKey.split('-');
        const id = toNum(idStr, 0);
        const db = readDb();
        if (source === 'WF') {
            const row = db.platform.workflow_tasks.find((item) => Number(item.id) === id && Number(item.owner_id) === toNum(req.user?.id, 0));
            if (!row) return apiErr(res, req, 404, '任务不存在');
            return apiOk(res, req, ensureArray(row.logs), '获取成功');
        }
        return apiOk(res, req, [], '获取成功');
    });

    app.post('/api/workflow-center/tasks/:taskKey/retry', authRequired, (req, res) => {
        const taskKey = String(req.params.taskKey || '');
        const [source, idStr] = taskKey.split('-');
        const id = toNum(idStr, 0);
        let found = false;
        updateDb((db) => {
            seedWorkflowDataForUser(db, req.user);
            if (source !== 'WF') return;
            const userId = toNum(req.user?.id, 0);
            const row = db.platform.workflow_tasks.find((item) => Number(item.id) === id && Number(item.owner_id) === userId);
            if (!row) return;
            if (!['FAILED', 'PARTIAL_SUCCESS'].includes(String(row.status))) throw new Error('仅失败任务支持重试');
            row.retry_count = toNum(row.retry_count, 0) + 1;
            row.status = 'RUNNING';
            row.started_at = nowIso();
            row.logs = ensureArray(row.logs);
            row.logs.push({ id: nextId(row.logs), level: 'INFO', message: '发起重试', created_at: nowIso() });
            row.status = 'SUCCESS';
            row.finished_at = nowIso();
            row.last_error = '';
            row.logs.push({ id: nextId(row.logs), level: 'INFO', message: '重试成功', created_at: nowIso() });

            const todo = db.platform.workflow_todos.find((item) => Number(item.task_id) === Number(row.id) && String(item.status) === 'PENDING');
            if (todo) {
                todo.status = 'DONE';
                todo.done_at = nowIso();
                todo.done_comment = '任务重试成功';
                todo.updated_at = nowIso();
            }

            appendWorkflowMessage(db, {
                category: 'TASK',
                title: `任务重试成功：${row.task_name}`,
                content: `任务 ${row.task_code} 已恢复成功`,
                priority: 'P2',
                receiverId: userId,
                receiverName: getUserName(req.user),
                linkPath: '/workflow-center',
                bizType: 'TASK',
                bizId: String(row.id)
            });
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '任务不存在');
        apiOk(res, req, true, '重试成功');
    });

    app.get('/api/workflow-center/timeout-rules', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const rows = ensureArray(readDb().platform.workflow_timeout_rules).sort((a, b) => toNum(a.id, 0) - toNum(b.id, 0));
        apiOk(res, req, rows, '获取成功');
    });

    app.put('/api/workflow-center/timeout-rules/:id', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const body = req.body || {};
        let found = false;
        updateDb((db) => {
            seedWorkflowDataForUser(db, req.user);
            const row = db.platform.workflow_timeout_rules.find((item) => Number(item.id) === id);
            if (!row) return;
            row.timeout_hours = Math.max(1, toNum(body.timeout_hours, row.timeout_hours));
            row.escalate_hours = Math.max(row.timeout_hours, toNum(body.escalate_hours, row.escalate_hours));
            row.escalate_to = String(body.escalate_to || row.escalate_to || '运营经理');
            row.enabled = toNum(body.enabled, row.enabled) === 0 ? 0 : 1;
            row.updated_by = getUserName(req.user);
            row.updated_at = nowIso();
            found = true;
        });
        if (!found) return apiErr(res, req, 404, '规则不存在');
        apiOk(res, req, true, '规则更新成功');
    });

    app.get('/api/workflow-center/reminders', authRequired, (req, res) => {
        updateDb((db) => seedWorkflowDataForUser(db, req.user));
        const { page = 1, pageSize = 20, todoId = '' } = req.query || {};
        const db = readDb();
        const userId = toNum(req.user?.id, 0);
        const userTodoIds = new Set(db.platform.workflow_todos.filter((row) => Number(row.assignee_id) === userId).map((row) => Number(row.id)));
        let rows = db.platform.workflow_reminders.filter((row) => userTodoIds.has(Number(row.todo_id)));
        if (todoId !== '') rows = rows.filter((row) => Number(row.todo_id) === toNum(todoId, 0));
        rows = rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        apiOk(res, req, withPagination(rows, page, pageSize, paginate), '获取成功');
    });
};

module.exports = { registerWorkflowCenterRoutes };
