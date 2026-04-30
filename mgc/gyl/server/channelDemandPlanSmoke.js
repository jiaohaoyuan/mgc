const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000/api';
const LOGIN_USER = process.env.SMOKE_USER || 'jiaohaoyuan';
const PASSWORD_CANDIDATES = [
    process.env.SMOKE_PASSWORD,
    '123456',
    '123456789'
].filter(Boolean);

const client = axios.create({
    baseURL: API_BASE,
    timeout: 15000
});

const log = (message) => console.log(`[channel-demand-smoke] ${message}`);

const login = async () => {
    for (const password of PASSWORD_CANDIDATES) {
        try {
            const res = await client.post('/login', {
                username: LOGIN_USER,
                password
            });
            const token = res.data?.data?.token;
            if (!token) continue;
            client.defaults.headers.common.Authorization = `Bearer ${token}`;
            log(`login ok with password ${'*'.repeat(String(password).length)}`);
            return;
        } catch (error) {
            if (error.response?.status !== 401) throw error;
        }
    }
    throw new Error(`unable to login as ${LOGIN_USER}; checked ${PASSWORD_CANDIDATES.length} passwords`);
};

const getDraftPlan = (plans) =>
    plans.find((row) => String(row.plan_code) === 'CDP-DEMO-ECOM-PRIVATE')
    || plans.find((row) => Number(row.status) === 0);

async function main() {
    log(`API base: ${API_BASE}`);
    await login();

    const meRes = await client.get('/me');
    if (!meRes.data?.data?.isSuperAdmin) {
        throw new Error('expected super admin smoke user');
    }
    log('me ok');

    const optionsRes = await client.get('/demand/channel-plan/options');
    const channels = optionsRes.data?.data?.channels || [];
    const skus = optionsRes.data?.data?.skus || [];
    if (!channels.length || !skus.length) {
        throw new Error('options missing channels or skus');
    }
    log(`options ok: ${channels.length} channels, ${skus.length} skus`);

    const plansRes = await client.get('/demand/channel-plan', {
        params: { page: 1, pageSize: 50 }
    });
    const plans = plansRes.data?.data?.list || [];
    const draftPlan = getDraftPlan(plans);
    if (!draftPlan) {
        throw new Error('expected seeded draft plan, run node seedChannelDemandPlanMock.js first');
    }
    log(`plan list ok: using ${draftPlan.plan_code}`);

    const rulesRes = await client.get('/demand/channel-plan/product-lock-rules');
    const rules = rulesRes.data?.data || [];
    const statuses = new Set(rules.map((row) => row.lifecycle_status));
    ['ACTIVE', 'FUTURE', 'EXPIRED'].forEach((status) => {
        if (!statuses.has(status)) {
            throw new Error(`expected lock rule lifecycle ${status}`);
        }
    });
    log(`lock rules ok: ${rules.length} rules`);

    const versionsRes = await client.get(`/demand/channel-plan/${draftPlan.plan_code}/version`);
    const versions = versionsRes.data?.data || [];
    const version = versions[0];
    if (!version) throw new Error('expected draft plan version');
    log(`version list ok: ${version.version_code}`);

    const detailRes = await client.get(`/demand/channel-plan/version/${version.version_code}/data`);
    const detail = detailRes.data?.data || {};
    const selectedChannelCode = detail.selected_channel_code;
    const dataRows = detail.data_rows || [];
    if (!selectedChannelCode || !dataRows.length) {
        throw new Error('version detail missing selected channel or rows');
    }
    const lockedRow = dataRows.find((row) => Number(row.is_locked) === 1);
    if (!lockedRow) {
        throw new Error('expected at least one locked cell in seeded draft plan');
    }
    log(`version detail ok: ${dataRows.length} rows, locked cell ${lockedRow.id}`);

    const nextValue = Number(lockedRow.plan_value || 0) + 7;
    const saveRes = await client.put(`/demand/channel-plan/version/${version.version_code}/data`, {
        channel_code: selectedChannelCode,
        force_edit: true,
        force_reason: 'smoke verify locked cell override',
        entries: [
            {
                id: lockedRow.id,
                sku_code: lockedRow.sku_code,
                plan_week: lockedRow.plan_week,
                plan_value: nextValue
            }
        ]
    });
    const changed = (saveRes.data?.data?.data_rows || []).find((row) => Number(row.id) === Number(lockedRow.id));
    if (!changed || Number(changed.plan_value) !== nextValue || changed.force_edit_reason !== 'smoke verify locked cell override') {
        throw new Error('forced edit verification failed');
    }
    log('forced locked-cell save ok');

    await client.post(`/demand/channel-plan/version/${version.version_code}/rebuild-locks`);
    const rebuiltDetailRes = await client.get(`/demand/channel-plan/version/${version.version_code}/data`);
    const rebuiltRows = rebuiltDetailRes.data?.data?.data_rows || [];
    const rebuilt = rebuiltRows.find((row) => Number(row.id) === Number(lockedRow.id));
    if (!rebuilt || Number(rebuilt.is_locked) !== 1) {
        throw new Error('rebuild locks did not preserve locked state');
    }
    log('rebuild locks ok');

    log('smoke passed');
}

main().catch((error) => {
    console.error('[channel-demand-smoke] failed');
    if (error.response) {
        console.error(error.response.status, JSON.stringify(error.response.data, null, 2));
    } else {
        console.error(error.stack || error.message || error);
    }
    process.exit(1);
});
