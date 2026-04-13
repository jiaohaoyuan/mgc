
const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const AUTH_STATUS = ['ACTIVE', 'INACTIVE', 'EXPIRED'];
const CONTRACT_STATUS = ['COOPERATING', 'PAUSED', 'ENDED'];
const RENEW_STATUS = ['NONE', 'PENDING', 'RENEWED'];
const PRICE_APPROVE_STATUS = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'];
const RISK_TYPES = ['LOW_SALES', 'HIGH_FREQ_ORDER', 'OVERREACH_SALES', 'CONTRACT_EXPIRY'];
const RISK_LEVEL = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const RISK_STATUS = ['OPEN', 'PROCESSING', 'CLOSED'];
const DEFAULT_EXCLUDED_ORDER_STATUS = new Set(['DRAFT', 'REJECTED']);

const normalize = (v) => String(v || '').trim();
const toNum = (v, fb = 0) => {
    const n = Number(v);
    return Number.isNaN(n) ? fb : n;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const dateText = (v) => String(v || '').slice(0, 10);
const contains = (text, keyword) => String(text || '').toLowerCase().includes(String(keyword || '').trim().toLowerCase());
const toBool = (value) => ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
const parseOrderStatusScope = (query = {}) => {
    const statuses = String(query.orderStatuses || query.orderStatus || '')
        .split(',')
        .map((v) => String(v || '').trim().toUpperCase())
        .filter(Boolean);
    return {
        includeAllStatuses: toBool(query.includeAllStatuses),
        statuses: new Set(statuses)
    };
};
const shouldIncludeOrderHeader = (header, scope = {}) => {
    const status = String(header?.order_status || '').toUpperCase();
    const reviewStatus = String(header?.review_status || '').toUpperCase();
    if (scope.statuses instanceof Set && scope.statuses.size) return scope.statuses.has(status);
    if (scope.includeAllStatuses) return true;
    if (DEFAULT_EXCLUDED_ORDER_STATUS.has(status) || reviewStatus === 'REJECTED') return false;
    return true;
};

const paginateRows = (rows, page, pageSize) => {
    const p = Math.max(1, toNum(page, 1));
    const ps = Math.max(1, toNum(pageSize, 20));
    const start = (p - 1) * ps;
    return { list: rows.slice(start, start + ps), total: rows.length };
};

const round2 = (n) => Number(Number(n || 0).toFixed(2));

const addDays = (dateStr, days) => {
    const d = new Date(dateText(dateStr || nowIso()));
    d.setDate(d.getDate() + toNum(days, 0));
    return d.toISOString().slice(0, 10);
};

const daysBetween = (dateA, dateB) => {
    const a = new Date(dateText(dateA || nowIso())).getTime();
    const b = new Date(dateText(dateB || nowIso())).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.floor((a - b) / 86400000);
};

const startOfMonth = (dateStr) => {
    const d = new Date(dateText(dateStr || nowIso()));
    d.setDate(1);
    return d.toISOString().slice(0, 10);
};

const channelTypeFromCode = (channelCode, fallback = 'DIST') => {
    const code = normalize(channelCode).toUpperCase();
    if (!code) return fallback;
    if (code.includes('KA')) return 'KA';
    if (code.includes('ECOM') || code.includes('ONLINE') || code.includes('O2O')) return 'ECOM';
    if (code.includes('MT') || code.includes('TRAD')) return 'TRAD';
    return fallback;
};

const ensureBizArrays = (db) => {
    db.biz = db.biz || {};
    db.master = db.master || {};

    db.biz.channel_dealer_profiles = arr(db.biz.channel_dealer_profiles);
    db.biz.channel_dealer_authorizations = arr(db.biz.channel_dealer_authorizations);
    db.biz.channel_dealer_contracts = arr(db.biz.channel_dealer_contracts);
    db.biz.channel_dealer_price_policies = arr(db.biz.channel_dealer_price_policies);
    db.biz.channel_dealer_risks = arr(db.biz.channel_dealer_risks);
    db.biz.channel_dealer_risk_followups = arr(db.biz.channel_dealer_risk_followups);

    db.master.reseller = arr(db.master.reseller);
    db.master.reseller_relation = arr(db.master.reseller_relation);
    db.master.channel = arr(db.master.channel);
    db.master.sku = arr(db.master.sku);

    db.biz.order_headers = arr(db.biz.order_headers);
    db.biz.order_lines = arr(db.biz.order_lines);
};

const buildOrderPriceMap = (db) => {
    const sumMap = new Map();
    const countMap = new Map();
    arr(db.biz.order_lines).forEach((line) => {
        const skuCode = normalize(line.sku_code);
        if (!skuCode) return;
        const price = toNum(line.unit_price, 0);
        if (price <= 0) return;
        sumMap.set(skuCode, toNum(sumMap.get(skuCode), 0) + price);
        countMap.set(skuCode, toNum(countMap.get(skuCode), 0) + 1);
    });

    const out = new Map();
    sumMap.forEach((sum, skuCode) => {
        const count = Math.max(1, toNum(countMap.get(skuCode), 1));
        out.set(skuCode, round2(sum / count));
    });
    return out;
};

const seedProfiles = (db) => {
    const now = nowIso();
    const currentMap = new Map(arr(db.biz.channel_dealer_profiles).map((item) => [String(item.reseller_code), item]));

    arr(db.master.reseller)
        .filter((row) => Number(row.status) === 1)
        .forEach((row, idx) => {
            const resellerCode = normalize(row.reseller_code);
            if (!resellerCode) return;

            const existed = currentMap.get(resellerCode);
            const baseContact = `联系人${String(idx + 1).padStart(2, '0')}`;
            const mobile = `13${String(700000000 + idx * 791).slice(0, 9)}`;

            const payload = {
                reseller_code: resellerCode,
                reseller_name: normalize(row.reseller_name),
                sale_region_name: existed?.sale_region_name || normalize(row.sale_region_name),
                province_name: normalize(row.province_name),
                city_name: normalize(row.city_name),
                district_name: normalize(row.district_name),
                lv1_channel_code: existed?.lv1_channel_code || normalize(row.lv1_channel_code),
                lv1_channel_name: existed?.lv1_channel_name || normalize(row.lv1_channel_name),
                lv2_channel_code: existed?.lv2_channel_code || normalize(row.lv2_channel_code),
                lv2_channel_name: existed?.lv2_channel_name || normalize(row.lv2_channel_name),
                lv3_channel_code: existed?.lv3_channel_code || normalize(row.lv3_channel_code),
                lv3_channel_name: existed?.lv3_channel_name || normalize(row.lv3_channel_name),
                sales_scope: existed?.sales_scope || `${normalize(row.sale_region_name)}-${normalize(row.city_name)}`,
                contact_name: existed?.contact_name || baseContact,
                contact_mobile: existed?.contact_mobile || mobile,
                owner_name: existed?.owner_name || `客户经理${String((idx % 7) + 1).padStart(2, '0')}`,
                credit_level: existed?.credit_level || ['A', 'A', 'B', 'B', 'C'][idx % 5],
                default_warehouse_code: existed?.default_warehouse_code || normalize(row.default_warehouse_code),
                default_warehouse_name: existed?.default_warehouse_name || normalize(row.default_warehouse_name),
                settlement_type: existed?.settlement_type || ['月结30天', '月结45天', '月结60天'][idx % 3],
                payment_term_days: existed?.payment_term_days || [30, 45, 60][idx % 3],
                status: existed?.status ?? (Number(row.status) === 1 ? 1 : 0),
                created_at: existed?.created_at || now,
                updated_at: now
            };

            if (existed) {
                Object.assign(existed, payload);
            } else {
                db.biz.channel_dealer_profiles.push({ id: nextId(db.biz.channel_dealer_profiles), ...payload });
            }
        });
};
const seedAuthorizations = (db) => {
    const now = nowIso();
    const existedKey = new Set(
        arr(db.biz.channel_dealer_authorizations).map(
            (row) => `${row.reseller_code}|${row.sku_code}|${row.begin_date}|${row.end_date}`
        )
    );

    arr(db.master.reseller_relation)
        .filter((row) => Number(row.status) === 1)
        .forEach((row) => {
            const beginDate = dateText(row.begin_date || addDays(now, -90));
            const endDate = dateText(row.end_date || addDays(now, 270));
            const key = `${normalize(row.reseller_code)}|${normalize(row.sku_code)}|${beginDate}|${endDate}`;
            if (existedKey.has(key)) return;

            db.biz.channel_dealer_authorizations.push({
                id: nextId(db.biz.channel_dealer_authorizations),
                reseller_code: normalize(row.reseller_code),
                reseller_name: normalize(row.reseller_name),
                sku_code: normalize(row.sku_code),
                sku_name: normalize(arr(db.master.sku).find((s) => String(s.sku_code) === String(row.sku_code))?.sku_name),
                region: normalize(row.region),
                channel_type: normalize(row.channel_type || 'DIST').toUpperCase(),
                begin_date: beginDate,
                end_date: endDate,
                quota_cases: Math.max(0, toNum(row.quota_cases, 0)),
                price_grade: normalize(row.price_grade || 'B').toUpperCase(),
                status: 'ACTIVE',
                created_by: '系统初始化',
                created_at: now,
                updated_at: now
            });

            existedKey.add(key);
        });
};

const seedContracts = (db) => {
    const now = nowIso();
    const today = dateText(now);
    const existedByReseller = new Map();

    arr(db.biz.channel_dealer_contracts).forEach((row) => {
        if (!existedByReseller.has(String(row.reseller_code))) existedByReseller.set(String(row.reseller_code), []);
        existedByReseller.get(String(row.reseller_code)).push(row);
    });

    arr(db.master.reseller)
        .filter((row) => Number(row.status) === 1)
        .forEach((row, idx) => {
            const resellerCode = normalize(row.reseller_code);
            if (!resellerCode) return;

            const list = existedByReseller.get(resellerCode) || [];
            if (list.length) return;

            const startDate = dateText(row.contract_begin_date || startOfMonth(today));
            const endDate = dateText(row.contract_end_date || addDays(startDate, 365));
            const remainDays = daysBetween(endDate, today);
            const contractStatus = remainDays < 0 ? 'ENDED' : 'COOPERATING';
            const renewStatus = remainDays <= 45 && remainDays >= 0 ? 'PENDING' : 'NONE';

            db.biz.channel_dealer_contracts.push({
                id: nextId(db.biz.channel_dealer_contracts),
                contract_no: `CT-${startDate.slice(0, 4)}-${String(idx + 1).padStart(4, '0')}`,
                reseller_code: resellerCode,
                reseller_name: normalize(row.reseller_name),
                contract_type: normalize(row.contract_type || '年度框架') || '年度框架',
                start_date: startDate,
                end_date: endDate,
                cooperation_status: contractStatus,
                renew_status: renewStatus,
                renew_contract_no: '',
                reminder_days: 30,
                status: 1,
                created_by: '系统初始化',
                created_at: now,
                updated_at: now
            });
        });
};

const seedPricePolicies = (db) => {
    const now = nowIso();
    const priceAvgMap = buildOrderPriceMap(db);
    const channelMap = new Map(arr(db.master.channel).map((row) => [String(row.channel_code), row]));
    const existedKey = new Set(
        arr(db.biz.channel_dealer_price_policies).map(
            (row) => `${row.reseller_code}|${row.sku_code}|${row.effective_begin}|${row.effective_end}`
        )
    );

    const gradeFactor = { A: 1.08, B: 1, C: 0.94, D: 0.9 };

    arr(db.biz.channel_dealer_authorizations)
        .filter((row) => String(row.status) === 'ACTIVE')
        .forEach((row, idx) => {
            const beginDate = dateText(row.begin_date || addDays(now, -30));
            const endDate = dateText(row.end_date || addDays(now, 180));
            const key = `${row.reseller_code}|${row.sku_code}|${beginDate}|${endDate}`;
            if (existedKey.has(key)) return;

            const grade = normalize(row.price_grade || 'B').toUpperCase() || 'B';
            const base = toNum(priceAvgMap.get(String(row.sku_code)), 56 + (idx % 10) * 2.5);
            const factor = gradeFactor[grade] || 1;
            const jitter = 1 + ((idx % 7) - 3) * 0.004;
            const priceValue = round2(base * factor * jitter);

            const channelCode = normalize(row.channel_code || arr(db.master.reseller).find((r) => String(r.reseller_code) === String(row.reseller_code))?.lv2_channel_code);
            const channelName = normalize(
                row.channel_name
                || channelMap.get(channelCode)?.channel_name
                || arr(db.master.reseller).find((r) => String(r.reseller_code) === String(row.reseller_code))?.lv2_channel_name
            );

            const approveStatus = idx % 11 === 0 ? 'PENDING' : 'APPROVED';

            db.biz.channel_dealer_price_policies.push({
                id: nextId(db.biz.channel_dealer_price_policies),
                reseller_code: normalize(row.reseller_code),
                reseller_name: normalize(row.reseller_name),
                channel_code: channelCode,
                channel_name: channelName,
                sku_code: normalize(row.sku_code),
                sku_name: normalize(row.sku_name),
                price_grade: grade,
                price_value: priceValue,
                effective_begin: beginDate,
                effective_end: endDate,
                approve_status: approveStatus,
                submitter: '系统初始化',
                submitted_at: approveStatus === 'PENDING' ? now : '',
                reviewer: approveStatus === 'APPROVED' ? '系统审核' : '',
                reviewed_at: approveStatus === 'APPROVED' ? now : '',
                review_comment: approveStatus === 'APPROVED' ? '初始化导入通过' : '',
                status: 1,
                created_at: now,
                updated_at: now
            });

            existedKey.add(key);
        });
};

const getRange = (query = {}) => {
    const today = dateText(nowIso());
    const endDate = dateText(query.dateTo || today);
    const startDate = dateText(query.dateFrom || addDays(endDate, -29));
    return {
        startDate: startDate <= endDate ? startDate : endDate,
        endDate
    };
};

const collectOrderFacts = (db, query = {}) => {
    const { startDate, endDate } = getRange(query);
    const statusScope = parseOrderStatusScope(query);
    const headerMap = new Map(
        arr(db.biz.order_headers)
            .filter((header) => {
                const day = dateText(header.created_at);
                return day >= startDate && day <= endDate && shouldIncludeOrderHeader(header, statusScope);
            })
            .map((header) => [String(header.order_no), header])
    );

    const out = [];
    arr(db.biz.order_lines).forEach((line) => {
        const header = headerMap.get(String(line.order_no));
        if (!header) return;

        out.push({
            order_no: normalize(line.order_no),
            order_date: dateText(header.created_at),
            reseller_code: normalize(header.customer_code),
            reseller_name: normalize(header.customer_name),
            region: normalize(header.region),
            channel_code: normalize(header.channel_code),
            channel_name: normalize(header.channel_name),
            channel_type: channelTypeFromCode(header.channel_code),
            sku_code: normalize(line.sku_code),
            sku_name: normalize(line.sku_name),
            qty: Math.max(0, toNum(line.order_qty, 0)),
            amount: Math.max(0, toNum(line.line_amount, 0))
        });
    });

    return { startDate, endDate, facts: out };
};

const groupSum = (rows, keyGetter, valueGetter) => {
    const map = new Map();
    rows.forEach((row) => {
        const key = keyGetter(row);
        const current = map.get(key) || 0;
        map.set(key, current + toNum(valueGetter(row), 0));
    });
    return map;
};
const buildAnalysis = (db, query = {}) => {
    const { startDate, endDate, facts } = collectOrderFacts(db, query);

    const rangeDays = Math.max(1, daysBetween(endDate, startDate) + 1);
    const prevEnd = addDays(startDate, -1);
    const prevStart = addDays(prevEnd, -rangeDays + 1);
    const prevFacts = collectOrderFacts(db, { ...query, dateFrom: prevStart, dateTo: prevEnd }).facts;

    const regionCurrent = groupSum(facts, (row) => row.region || '未分区', (row) => row.qty);
    const regionPrev = groupSum(prevFacts, (row) => row.region || '未分区', (row) => row.qty);

    const regionSales = [...regionCurrent.entries()]
        .map(([region, qty]) => {
            const prevQty = toNum(regionPrev.get(region), 0);
            const growthRate = prevQty > 0 ? round2(((qty - prevQty) / prevQty) * 100) : (qty > 0 ? 100 : 0);
            return { region, qty: round2(qty), prev_qty: round2(prevQty), growth_rate: growthRate };
        })
        .sort((a, b) => b.qty - a.qty);

    const dealerRanking = [...groupSum(facts, (row) => `${row.reseller_code}|${row.reseller_name}`, (row) => row.qty).entries()]
        .map(([key, qty]) => {
            const [reseller_code, reseller_name] = String(key).split('|');
            return { reseller_code, reseller_name, qty: round2(qty) };
        })
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 12);

    const channelStruct = [...groupSum(facts, (row) => row.channel_name || row.channel_code || '未归类', (row) => row.qty).entries()]
        .map(([channel_name, qty]) => ({ channel_name, qty: round2(qty) }))
        .sort((a, b) => b.qty - a.qty);

    const skuStruct = [...groupSum(facts, (row) => row.sku_name || row.sku_code, (row) => row.qty).entries()]
        .map(([sku_name, qty]) => ({ sku_name, qty: round2(qty) }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 15);

    const totalQty = round2(facts.reduce((sum, row) => sum + toNum(row.qty, 0), 0));
    const prevTotalQty = round2(prevFacts.reduce((sum, row) => sum + toNum(row.qty, 0), 0));
    const totalGrowthRate = prevTotalQty > 0 ? round2(((totalQty - prevTotalQty) / prevTotalQty) * 100) : (totalQty > 0 ? 100 : 0);

    return {
        range: { start_date: startDate, end_date: endDate, previous_start_date: prevStart, previous_end_date: prevEnd },
        summary: {
            total_qty: totalQty,
            previous_total_qty: prevTotalQty,
            growth_rate: totalGrowthRate,
            reseller_count: new Set(facts.map((row) => row.reseller_code).filter(Boolean)).size,
            sku_count: new Set(facts.map((row) => row.sku_code).filter(Boolean)).size
        },
        region_sales: regionSales,
        dealer_ranking: dealerRanking,
        channel_structure: channelStruct,
        sku_structure: skuStruct
    };
};

const isAuthActive = (authRow, bizDate) => {
    const day = dateText(bizDate || nowIso());
    if (String(authRow.status) !== 'ACTIVE') return false;
    return day >= dateText(authRow.begin_date || '1900-01-01') && day <= dateText(authRow.end_date || '2999-12-31');
};

const detectOverreachSales = (db, query = {}) => {
    const { facts } = collectOrderFacts(db, query);
    const authRows = arr(db.biz.channel_dealer_authorizations);

    const violations = [];
    facts.forEach((fact) => {
        const sameResellerSku = authRows.filter((auth) => (
            String(auth.reseller_code) === String(fact.reseller_code)
            && String(auth.sku_code) === String(fact.sku_code)
        ));

        const activeRows = sameResellerSku.filter((auth) => isAuthActive(auth, fact.order_date));
        if (!activeRows.length) {
            violations.push({
                order_no: fact.order_no,
                order_date: fact.order_date,
                reseller_code: fact.reseller_code,
                reseller_name: fact.reseller_name,
                sku_code: fact.sku_code,
                sku_name: fact.sku_name,
                region: fact.region,
                channel_type: fact.channel_type,
                qty: fact.qty,
                amount: fact.amount,
                reason: '未命中有效授权'
            });
            return;
        }

        const regionMatched = activeRows.some((auth) => !normalize(auth.region) || String(auth.region) === String(fact.region));
        if (!regionMatched) {
            violations.push({
                order_no: fact.order_no,
                order_date: fact.order_date,
                reseller_code: fact.reseller_code,
                reseller_name: fact.reseller_name,
                sku_code: fact.sku_code,
                sku_name: fact.sku_name,
                region: fact.region,
                channel_type: fact.channel_type,
                qty: fact.qty,
                amount: fact.amount,
                reason: '超区域授权销售'
            });
            return;
        }

        const channelMatched = activeRows.some((auth) => !normalize(auth.channel_type) || String(auth.channel_type) === String(fact.channel_type));
        if (!channelMatched) {
            violations.push({
                order_no: fact.order_no,
                order_date: fact.order_date,
                reseller_code: fact.reseller_code,
                reseller_name: fact.reseller_name,
                sku_code: fact.sku_code,
                sku_name: fact.sku_name,
                region: fact.region,
                channel_type: fact.channel_type,
                qty: fact.qty,
                amount: fact.amount,
                reason: '超渠道授权销售'
            });
        }
    });

    return violations;
};

const collectRiskCandidates = (db) => {
    const today = dateText(nowIso());
    const sixtyFacts = collectOrderFacts(db, { dateFrom: addDays(today, -59), dateTo: today }).facts;
    const overreach = detectOverreachSales(db, { dateFrom: addDays(today, -89), dateTo: today });

    const profileMap = new Map(arr(db.biz.channel_dealer_profiles).map((row) => [String(row.reseller_code), row]));
    const contractMap = new Map();
    arr(db.biz.channel_dealer_contracts).forEach((row) => {
        const key = String(row.reseller_code);
        if (!contractMap.has(key)) contractMap.set(key, []);
        contractMap.get(key).push(row);
    });

    const candidates = [];

    const resellerQty60 = groupSum(sixtyFacts, (row) => row.reseller_code, (row) => row.qty);
    resellerQty60.forEach((qty, resellerCode) => {
        if (qty >= 120) return;
        const profile = profileMap.get(String(resellerCode));
        candidates.push({
            key: `${resellerCode}|LOW_SALES`,
            reseller_code: resellerCode,
            reseller_name: normalize(profile?.reseller_name || resellerCode),
            risk_type: 'LOW_SALES',
            risk_level: qty < 60 ? 'HIGH' : 'MEDIUM',
            title: '长期低销量风险',
            description: `近60天销量 ${round2(qty)} 箱，低于预设阈值 120 箱`,
            detected_at: nowIso(),
            order_refs: [],
            meta: { qty_60d: round2(qty), threshold: 120 }
        });
    });

    const defaultStatusScope = parseOrderStatusScope({});
    const orderCount14 = groupSum(
        arr(db.biz.order_headers)
            .filter((row) => {
                const day = dateText(row.created_at);
                return day >= addDays(today, -13) && day <= today && shouldIncludeOrderHeader(row, defaultStatusScope);
            }),
        (row) => normalize(row.customer_code),
        () => 1
    );
    orderCount14.forEach((count, resellerCode) => {
        if (count < 7) return;
        const profile = profileMap.get(String(resellerCode));
        candidates.push({
            key: `${resellerCode}|HIGH_FREQ_ORDER`,
            reseller_code: resellerCode,
            reseller_name: normalize(profile?.reseller_name || resellerCode),
            risk_type: 'HIGH_FREQ_ORDER',
            risk_level: count >= 10 ? 'HIGH' : 'MEDIUM',
            title: '异常高频下单风险',
            description: `近14天订单 ${toNum(count, 0)} 单，建议核查补货策略与促销冲击`,
            detected_at: nowIso(),
            order_refs: arr(db.biz.order_headers)
                .filter((row) => normalize(row.customer_code) === String(resellerCode))
                .slice(-6)
                .map((row) => row.order_no),
            meta: { order_count_14d: toNum(count, 0), threshold: 7 }
        });
    });

    const overreachByReseller = new Map();
    overreach.forEach((row) => {
        const key = String(row.reseller_code);
        const bucket = overreachByReseller.get(key) || { count: 0, qty: 0, refs: [] };
        bucket.count += 1;
        bucket.qty = round2(bucket.qty + toNum(row.qty, 0));
        if (bucket.refs.length < 8) bucket.refs.push(row.order_no);
        overreachByReseller.set(key, bucket);
    });

    overreachByReseller.forEach((bucket, resellerCode) => {
        const profile = profileMap.get(String(resellerCode));
        candidates.push({
            key: `${resellerCode}|OVERREACH_SALES`,
            reseller_code: resellerCode,
            reseller_name: normalize(profile?.reseller_name || resellerCode),
            risk_type: 'OVERREACH_SALES',
            risk_level: bucket.count >= 3 ? 'CRITICAL' : 'HIGH',
            title: '超授权销售风险',
            description: `近90天识别 ${bucket.count} 笔超范围销售，涉及 ${bucket.qty} 箱`,
            detected_at: nowIso(),
            order_refs: bucket.refs,
            meta: { overreach_count: bucket.count, overreach_qty: bucket.qty }
        });
    });

    contractMap.forEach((rows, resellerCode) => {
        const latest = [...rows].sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0];
        if (!latest) return;

        const remain = daysBetween(latest.end_date, today);
        if (remain > 30) return;
        if (normalize(latest.renew_status) === 'RENEWED') return;

        candidates.push({
            key: `${resellerCode}|CONTRACT_EXPIRY`,
            reseller_code: resellerCode,
            reseller_name: normalize(latest.reseller_name || resellerCode),
            risk_type: 'CONTRACT_EXPIRY',
            risk_level: remain <= 7 ? 'CRITICAL' : (remain <= 15 ? 'HIGH' : 'MEDIUM'),
            title: '合同到期未续签风险',
            description: `合同 ${latest.contract_no} 将在 ${Math.max(remain, 0)} 天后到期，续签状态：${latest.renew_status}`,
            detected_at: nowIso(),
            order_refs: [],
            meta: {
                contract_no: latest.contract_no,
                end_date: latest.end_date,
                days_to_expire: remain,
                renew_status: latest.renew_status
            }
        });
    });

    return candidates;
};

const scanAndSyncRisks = (db, operator = '系统') => {
    const now = nowIso();
    const candidates = collectRiskCandidates(db);
    const keySet = new Set(candidates.map((item) => item.key));

    const activeRiskMap = new Map();
    arr(db.biz.channel_dealer_risks)
        .filter((row) => String(row.status) !== 'CLOSED')
        .forEach((row) => {
            const key = `${row.reseller_code}|${row.risk_type}`;
            activeRiskMap.set(key, row);
        });

    let created = 0;
    let updated = 0;
    let closed = 0;

    candidates.forEach((item) => {
        const existed = activeRiskMap.get(item.key);
        if (existed) {
            existed.risk_level = item.risk_level;
            existed.title = item.title;
            existed.description = item.description;
            existed.order_refs = item.order_refs;
            existed.meta = item.meta;
            existed.detected_at = item.detected_at;
            existed.updated_at = now;
            updated += 1;
            return;
        }

        db.biz.channel_dealer_risks.push({
            id: nextId(db.biz.channel_dealer_risks),
            reseller_code: item.reseller_code,
            reseller_name: item.reseller_name,
            risk_type: item.risk_type,
            risk_level: item.risk_level,
            status: 'OPEN',
            title: item.title,
            description: item.description,
            owner: '',
            order_refs: item.order_refs,
            meta: item.meta,
            detected_at: item.detected_at,
            last_followup_at: '',
            created_at: now,
            updated_at: now
        });
        created += 1;
    });

    arr(db.biz.channel_dealer_risks)
        .filter((row) => String(row.status) !== 'CLOSED')
        .forEach((row) => {
            const key = `${row.reseller_code}|${row.risk_type}`;
            if (keySet.has(key)) return;
            row.status = 'CLOSED';
            row.updated_at = now;
            row.last_followup_at = now;
            db.biz.channel_dealer_risk_followups.push({
                id: nextId(db.biz.channel_dealer_risk_followups),
                risk_id: row.id,
                action: 'AUTO_CLOSE',
                status: 'CLOSED',
                comment: '风险条件解除，系统自动关闭',
                operator,
                created_at: now
            });
            closed += 1;
        });

    return { created, updated, closed, total_active: arr(db.biz.channel_dealer_risks).filter((row) => String(row.status) !== 'CLOSED').length };
};

const ensureChannelDealerOpsStructures = (db) => {
    ensureBizArrays(db);
    seedProfiles(db);
    seedAuthorizations(db);
    seedContracts(db);
    seedPricePolicies(db);
    if (!arr(db.biz.channel_dealer_risks).length) scanAndSyncRisks(db, '系统初始化');
};

const getDashboard = (db, query = {}) => {
    const today = dateText(nowIso());
    const analysis = buildAnalysis(db, { ...query, dateFrom: addDays(today, -29), dateTo: today });
    const overreach = detectOverreachSales(db, { ...query, dateFrom: addDays(today, -29), dateTo: today });

    const contracts = arr(db.biz.channel_dealer_contracts);
    const expiringContractCount = contracts.filter((row) => {
        const remain = daysBetween(row.end_date, today);
        return remain >= 0 && remain <= 30;
    }).length;

    const risks = arr(db.biz.channel_dealer_risks);

    const recentTrend = [];
    for (let i = 5; i >= 0; i -= 1) {
        const end = addDays(startOfMonth(today), -1 - (i - 1) * 30);
        const monthEnd = dateText(new Date(new Date(end).getFullYear(), new Date(end).getMonth() + 1, 0).toISOString().slice(0, 10));
        const monthStart = startOfMonth(end);
        const facts = collectOrderFacts(db, { ...query, dateFrom: monthStart, dateTo: monthEnd }).facts;
        const qty = round2(facts.reduce((sum, row) => sum + toNum(row.qty, 0), 0));
        const amount = round2(facts.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
        recentTrend.push({
            month: monthStart.slice(0, 7),
            qty,
            amount
        });
    }

    return {
        summary: {
            profile_count: arr(db.biz.channel_dealer_profiles).length,
            active_authorization_count: arr(db.biz.channel_dealer_authorizations).filter((row) => String(row.status) === 'ACTIVE').length,
            expiring_contract_count: expiringContractCount,
            pending_price_count: arr(db.biz.channel_dealer_price_policies).filter((row) => String(row.approve_status) === 'PENDING').length,
            risk_open_count: risks.filter((row) => String(row.status) === 'OPEN').length,
            risk_processing_count: risks.filter((row) => String(row.status) === 'PROCESSING').length,
            overreach_count: overreach.length,
            total_sales_qty_30d: analysis.summary.total_qty,
            sales_growth_rate: analysis.summary.growth_rate
        },
        trend: recentTrend,
        region_sales: analysis.region_sales,
        channel_structure: analysis.channel_structure,
        top_dealers: analysis.dealer_ranking.slice(0, 8),
        risk_distribution: RISK_TYPES.map((type) => ({
            type,
            count: risks.filter((row) => String(row.risk_type) === type && String(row.status) !== 'CLOSED').length
        }))
    };
};
const registerChannelDealerOpsRoutes = ({ app, authRequired, apiOk, apiErr, paginate, contains: containsFn }) => {
    const pg = paginate || paginateRows;
    const textContains = containsFn || contains;

    app.get('/api/channel-dealer-ops/options', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        apiOk(res, req, {
            enums: {
                auth_status: AUTH_STATUS,
                contract_status: CONTRACT_STATUS,
                renew_status: RENEW_STATUS,
                price_approve_status: PRICE_APPROVE_STATUS,
                risk_types: RISK_TYPES,
                risk_level: RISK_LEVEL,
                risk_status: RISK_STATUS,
                channel_type: ['DIST', 'KA', 'ECOM', 'TRAD']
            },
            regions: [...new Set(arr(db.master.reseller).map((row) => normalize(row.sale_region_name)).filter(Boolean))],
            resellers: arr(db.master.reseller)
                .filter((row) => Number(row.status) === 1)
                .map((row) => ({
                    reseller_code: row.reseller_code,
                    reseller_name: row.reseller_name,
                    region: row.sale_region_name,
                    channel_code: row.lv2_channel_code,
                    channel_name: row.lv2_channel_name,
                    default_warehouse_code: row.default_warehouse_code,
                    default_warehouse_name: row.default_warehouse_name
                })),
            skus: arr(db.master.sku)
                .filter((row) => Number(row.status) === 1)
                .map((row) => ({ sku_code: row.sku_code, sku_name: row.sku_name })),
            channels: arr(db.master.channel)
                .filter((row) => Number(row.status) === 1)
                .map((row) => ({ channel_code: row.channel_code, channel_name: row.channel_name })),
            warehouses: arr(db.master.warehouse)
                .filter((row) => Number(row.status) === 1)
                .map((row) => ({ warehouse_code: row.warehouse_code, warehouse_name: row.warehouse_name }))
        }, '获取成功');
    });

    app.get('/api/channel-dealer-ops/dashboard', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);
        apiOk(res, req, getDashboard(db, req.query || {}), '获取成功');
    });

    app.get('/api/channel-dealer-ops/profiles/list', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const { page = 1, pageSize = 20, keyword = '', region = '', creditLevel = '', status = '' } = req.query || {};

        let rows = arr(db.biz.channel_dealer_profiles).map((row) => ({ ...row }));
        if (keyword) {
            rows = rows.filter((row) => (
                textContains(row.reseller_code, keyword)
                || textContains(row.reseller_name, keyword)
                || textContains(row.contact_name, keyword)
                || textContains(row.owner_name, keyword)
            ));
        }
        if (region) rows = rows.filter((row) => String(row.sale_region_name) === String(region));
        if (creditLevel) rows = rows.filter((row) => String(row.credit_level) === String(creditLevel));
        if (status !== '') rows = rows.filter((row) => String(row.status) === String(status));

        rows.sort((a, b) => String(a.reseller_code).localeCompare(String(b.reseller_code)));
        apiOk(res, req, pg(rows, page, pageSize), '获取成功');
    });

    app.put('/api/channel-dealer-ops/profiles/:resellerCode', authRequired, (req, res) => {
        const resellerCode = normalize(req.params.resellerCode);
        const body = req.body || {};
        let out = null;

        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const row = arr(db.biz.channel_dealer_profiles).find((item) => String(item.reseller_code) === resellerCode);
                if (!row) throw new Error('经销商档案不存在');

                const channelCode = normalize(body.lv2_channel_code || body.channel_code);
                if (channelCode) {
                    const channel = arr(db.master.channel).find((item) => String(item.channel_code) === channelCode);
                    if (!channel) throw new Error('渠道不存在');
                    row.lv2_channel_code = channelCode;
                    row.lv2_channel_name = normalize(channel.channel_name);
                } else if (body.lv2_channel_name !== undefined) {
                    row.lv2_channel_name = normalize(body.lv2_channel_name);
                }

                const warehouseCode = normalize(body.default_warehouse_code);
                if (warehouseCode) {
                    const warehouse = arr(db.master.warehouse).find((item) => String(item.warehouse_code) === warehouseCode);
                    if (!warehouse) throw new Error('默认发货仓不存在');
                    row.default_warehouse_code = warehouseCode;
                    row.default_warehouse_name = normalize(warehouse.warehouse_name);
                } else if (body.default_warehouse_name !== undefined) {
                    row.default_warehouse_name = normalize(body.default_warehouse_name);
                }

                if (body.sale_region_name !== undefined) row.sale_region_name = normalize(body.sale_region_name);
                if (body.sales_scope !== undefined) row.sales_scope = normalize(body.sales_scope);
                if (body.contact_name !== undefined) row.contact_name = normalize(body.contact_name);
                if (body.contact_mobile !== undefined) row.contact_mobile = normalize(body.contact_mobile);
                if (body.owner_name !== undefined) row.owner_name = normalize(body.owner_name);
                if (body.credit_level !== undefined) row.credit_level = normalize(body.credit_level).toUpperCase();
                if (body.settlement_type !== undefined) row.settlement_type = normalize(body.settlement_type);
                if (body.payment_term_days !== undefined) row.payment_term_days = Math.max(0, toNum(body.payment_term_days, 0));
                if (body.status !== undefined) row.status = toNum(body.status, 1) === 0 ? 0 : 1;

                row.updated_at = nowIso();
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '更新失败');
        }

        apiOk(res, req, out, '更新成功');
    });

    app.get('/api/channel-dealer-ops/authorizations/list', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const { page = 1, pageSize = 20, keyword = '', region = '', channelType = '', status = '', expired = '' } = req.query || {};
        const today = dateText(nowIso());

        let rows = arr(db.biz.channel_dealer_authorizations).map((row) => ({
            ...row,
            validity_status: dateText(row.end_date) < today ? 'EXPIRED' : 'VALID'
        }));

        if (keyword) {
            rows = rows.filter((row) => (
                textContains(row.reseller_code, keyword)
                || textContains(row.reseller_name, keyword)
                || textContains(row.sku_code, keyword)
                || textContains(row.sku_name, keyword)
            ));
        }
        if (region) rows = rows.filter((row) => String(row.region) === String(region));
        if (channelType) rows = rows.filter((row) => String(row.channel_type) === String(channelType));
        if (status) rows = rows.filter((row) => String(row.status) === String(status));
        if (expired === '1') rows = rows.filter((row) => row.validity_status === 'EXPIRED');
        if (expired === '0') rows = rows.filter((row) => row.validity_status !== 'EXPIRED');

        rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        apiOk(res, req, pg(rows, page, pageSize), '获取成功');
    });

    app.post('/api/channel-dealer-ops/authorizations', authRequired, (req, res) => {
        const body = req.body || {};
        const resellerCode = normalize(body.reseller_code);
        const skuCode = normalize(body.sku_code);
        const beginDate = dateText(body.begin_date || nowIso());
        const endDate = dateText(body.end_date || addDays(beginDate, 365));

        if (!resellerCode || !skuCode) return apiErr(res, req, 400, 'reseller_code 与 sku_code 必填');
        if (beginDate > endDate) return apiErr(res, req, 400, '生效开始日期不可晚于结束日期');

        let out = null;
        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);

                const reseller = arr(db.master.reseller).find((item) => String(item.reseller_code) === resellerCode);
                const sku = arr(db.master.sku).find((item) => String(item.sku_code) === skuCode);
                if (!reseller) throw new Error('经销商不存在');
                if (!sku) throw new Error('SKU不存在');

                const duplicate = arr(db.biz.channel_dealer_authorizations).find((item) => (
                    String(item.reseller_code) === resellerCode
                    && String(item.sku_code) === skuCode
                    && dateText(item.begin_date) === beginDate
                    && dateText(item.end_date) === endDate
                ));
                if (duplicate) throw new Error('相同授权范围已存在');

                out = {
                    id: nextId(db.biz.channel_dealer_authorizations),
                    reseller_code: resellerCode,
                    reseller_name: normalize(reseller.reseller_name),
                    sku_code: skuCode,
                    sku_name: normalize(sku.sku_name),
                    region: normalize(body.region || reseller.sale_region_name),
                    channel_type: normalize(body.channel_type || channelTypeFromCode(reseller.lv2_channel_code)).toUpperCase(),
                    begin_date: beginDate,
                    end_date: endDate,
                    quota_cases: Math.max(0, toNum(body.quota_cases, 0)),
                    price_grade: normalize(body.price_grade || 'B').toUpperCase(),
                    status: normalize(body.status || 'ACTIVE').toUpperCase(),
                    created_by: req.user?.nickname || req.user?.username || '系统',
                    created_at: nowIso(),
                    updated_at: nowIso()
                };

                db.biz.channel_dealer_authorizations.push(out);
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '新增授权失败');
        }

        apiOk(res, req, out, '新增成功');
    });

    app.post('/api/channel-dealer-ops/authorizations/:id/status', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const status = normalize(req.body?.status).toUpperCase();
        if (!AUTH_STATUS.includes(status)) return apiErr(res, req, 400, `status仅支持: ${AUTH_STATUS.join(', ')}`);

        let out = null;
        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const row = arr(db.biz.channel_dealer_authorizations).find((item) => Number(item.id) === id);
                if (!row) throw new Error('授权记录不存在');
                row.status = status;
                row.updated_at = nowIso();
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '状态变更失败');
        }

        apiOk(res, req, out, '更新成功');
    });

    app.get('/api/channel-dealer-ops/authorizations/overreach-sales', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const rows = detectOverreachSales(db, req.query || {});
        apiOk(res, req, {
            total: rows.length,
            total_qty: round2(rows.reduce((sum, row) => sum + toNum(row.qty, 0), 0)),
            list: rows.sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)))
        }, '获取成功');
    });

    app.get('/api/channel-dealer-ops/contracts/list', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const { page = 1, pageSize = 20, keyword = '', cooperationStatus = '', renewStatus = '', nearExpiry = '' } = req.query || {};
        const today = dateText(nowIso());

        let rows = arr(db.biz.channel_dealer_contracts).map((row) => ({
            ...row,
            days_to_expire: daysBetween(row.end_date, today),
            expiry_alert: daysBetween(row.end_date, today) <= toNum(row.reminder_days, 30)
        }));

        if (keyword) {
            rows = rows.filter((row) => (
                textContains(row.contract_no, keyword)
                || textContains(row.reseller_code, keyword)
                || textContains(row.reseller_name, keyword)
            ));
        }
        if (cooperationStatus) rows = rows.filter((row) => String(row.cooperation_status) === String(cooperationStatus));
        if (renewStatus) rows = rows.filter((row) => String(row.renew_status) === String(renewStatus));
        if (nearExpiry === '1') rows = rows.filter((row) => row.days_to_expire >= 0 && row.days_to_expire <= toNum(row.reminder_days, 30));

        rows.sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)));
        apiOk(res, req, pg(rows, page, pageSize), '获取成功');
    });

    app.post('/api/channel-dealer-ops/contracts', authRequired, (req, res) => {
        const body = req.body || {};
        const resellerCode = normalize(body.reseller_code);
        if (!resellerCode) return apiErr(res, req, 400, 'reseller_code 必填');

        const startDate = dateText(body.start_date || nowIso());
        const endDate = dateText(body.end_date || addDays(startDate, 365));
        if (startDate > endDate) return apiErr(res, req, 400, '合同开始日期不可晚于结束日期');

        let out = null;
        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const profile = arr(db.biz.channel_dealer_profiles).find((item) => String(item.reseller_code) === resellerCode);
                if (!profile) throw new Error('经销商档案不存在');

                const contractNo = normalize(body.contract_no) || `CT-${startDate.slice(0, 4)}-${String(nextId(db.biz.channel_dealer_contracts)).padStart(4, '0')}`;
                if (arr(db.biz.channel_dealer_contracts).some((row) => String(row.contract_no) === contractNo)) {
                    throw new Error('合同编号重复');
                }

                out = {
                    id: nextId(db.biz.channel_dealer_contracts),
                    contract_no: contractNo,
                    reseller_code: resellerCode,
                    reseller_name: profile.reseller_name,
                    contract_type: normalize(body.contract_type || '年度框架') || '年度框架',
                    start_date: startDate,
                    end_date: endDate,
                    cooperation_status: normalize(body.cooperation_status || 'COOPERATING').toUpperCase(),
                    renew_status: normalize(body.renew_status || 'NONE').toUpperCase(),
                    renew_contract_no: normalize(body.renew_contract_no),
                    reminder_days: Math.max(1, toNum(body.reminder_days, 30)),
                    status: body.status === undefined ? 1 : toNum(body.status, 1),
                    created_by: req.user?.nickname || req.user?.username || '系统',
                    created_at: nowIso(),
                    updated_at: nowIso()
                };
                db.biz.channel_dealer_contracts.push(out);
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '新增合同失败');
        }

        apiOk(res, req, out, '新增成功');
    });

    app.put('/api/channel-dealer-ops/contracts/:id', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const body = req.body || {};
        let out = null;

        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const row = arr(db.biz.channel_dealer_contracts).find((item) => Number(item.id) === id);
                if (!row) throw new Error('合同不存在');

                const assign = (key) => {
                    if (body[key] !== undefined) row[key] = body[key];
                };
                ['contract_no', 'contract_type', 'cooperation_status', 'renew_status', 'renew_contract_no', 'status'].forEach(assign);

                if (body.start_date !== undefined) row.start_date = dateText(body.start_date);
                if (body.end_date !== undefined) row.end_date = dateText(body.end_date);
                if (body.reminder_days !== undefined) row.reminder_days = Math.max(1, toNum(body.reminder_days, 30));
                if (dateText(row.start_date) > dateText(row.end_date)) throw new Error('合同开始日期不可晚于结束日期');

                row.updated_at = nowIso();
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '更新失败');
        }

        apiOk(res, req, out, '更新成功');
    });

    app.get('/api/channel-dealer-ops/contracts/history/:resellerCode', authRequired, (req, res) => {
        const resellerCode = normalize(req.params.resellerCode);
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const rows = arr(db.biz.channel_dealer_contracts)
            .filter((row) => String(row.reseller_code) === resellerCode)
            .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));

        apiOk(res, req, rows, '获取成功');
    });
    app.get('/api/channel-dealer-ops/prices/list', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const { page = 1, pageSize = 20, keyword = '', approveStatus = '', priceGrade = '' } = req.query || {};

        let rows = arr(db.biz.channel_dealer_price_policies).map((row) => ({ ...row }));

        if (keyword) {
            rows = rows.filter((row) => (
                textContains(row.reseller_code, keyword)
                || textContains(row.reseller_name, keyword)
                || textContains(row.sku_code, keyword)
                || textContains(row.sku_name, keyword)
                || textContains(row.channel_name, keyword)
            ));
        }
        if (approveStatus) rows = rows.filter((row) => String(row.approve_status) === String(approveStatus));
        if (priceGrade) rows = rows.filter((row) => String(row.price_grade) === String(priceGrade));

        rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        apiOk(res, req, pg(rows, page, pageSize), '获取成功');
    });

    app.post('/api/channel-dealer-ops/prices', authRequired, (req, res) => {
        const body = req.body || {};
        const resellerCode = normalize(body.reseller_code);
        const skuCode = normalize(body.sku_code);

        if (!resellerCode || !skuCode) return apiErr(res, req, 400, 'reseller_code 与 sku_code 必填');
        if (toNum(body.price_value, 0) <= 0) return apiErr(res, req, 400, 'price_value 必须大于0');

        let out = null;
        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const profile = arr(db.biz.channel_dealer_profiles).find((row) => String(row.reseller_code) === resellerCode);
                const sku = arr(db.master.sku).find((row) => String(row.sku_code) === skuCode);
                if (!profile) throw new Error('经销商不存在');
                if (!sku) throw new Error('SKU不存在');

                out = {
                    id: nextId(db.biz.channel_dealer_price_policies),
                    reseller_code: resellerCode,
                    reseller_name: profile.reseller_name,
                    channel_code: normalize(body.channel_code || profile.lv2_channel_code),
                    channel_name: normalize(body.channel_name || profile.lv2_channel_name),
                    sku_code: skuCode,
                    sku_name: sku.sku_name,
                    price_grade: normalize(body.price_grade || 'B').toUpperCase(),
                    price_value: round2(body.price_value),
                    effective_begin: dateText(body.effective_begin || nowIso()),
                    effective_end: dateText(body.effective_end || addDays(nowIso(), 180)),
                    approve_status: 'DRAFT',
                    submitter: '',
                    submitted_at: '',
                    reviewer: '',
                    reviewed_at: '',
                    review_comment: '',
                    status: 1,
                    created_at: nowIso(),
                    updated_at: nowIso()
                };

                if (out.effective_begin > out.effective_end) throw new Error('价格有效期开始不可晚于结束');
                db.biz.channel_dealer_price_policies.push(out);
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '新增价格策略失败');
        }

        apiOk(res, req, out, '新增成功');
    });

    app.post('/api/channel-dealer-ops/prices/:id/submit', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        let out = null;

        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const row = arr(db.biz.channel_dealer_price_policies).find((item) => Number(item.id) === id);
                if (!row) throw new Error('价格策略不存在');
                if (!['DRAFT', 'REJECTED'].includes(String(row.approve_status))) throw new Error('当前状态不可提交审批');

                row.approve_status = 'PENDING';
                row.submitter = req.user?.nickname || req.user?.username || '系统';
                row.submitted_at = nowIso();
                row.updated_at = nowIso();
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '提交审批失败');
        }

        apiOk(res, req, out, '提交成功');
    });

    app.post('/api/channel-dealer-ops/prices/:id/review', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const action = normalize(req.body?.action).toUpperCase();
        if (!['APPROVE', 'REJECT'].includes(action)) return apiErr(res, req, 400, 'action仅支持 APPROVE/REJECT');

        let out = null;
        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const row = arr(db.biz.channel_dealer_price_policies).find((item) => Number(item.id) === id);
                if (!row) throw new Error('价格策略不存在');
                if (String(row.approve_status) !== 'PENDING') throw new Error('仅待审批策略可审核');

                row.approve_status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
                row.reviewer = req.user?.nickname || req.user?.username || '系统';
                row.reviewed_at = nowIso();
                row.review_comment = normalize(req.body?.comment || (action === 'APPROVE' ? '审批通过' : '审批驳回'));
                row.updated_at = nowIso();
                out = row;
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '审批失败');
        }

        apiOk(res, req, out, '审批完成');
    });

    app.get('/api/channel-dealer-ops/analysis/overview', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);
        apiOk(res, req, buildAnalysis(db, req.query || {}), '获取成功');
    });

    app.post('/api/channel-dealer-ops/risks/scan', authRequired, (req, res) => {
        let out = null;
        updateDb((db) => {
            ensureChannelDealerOpsStructures(db);
            out = scanAndSyncRisks(db, req.user?.nickname || req.user?.username || '系统');
        });
        apiOk(res, req, out, '扫描完成');
    });

    app.get('/api/channel-dealer-ops/risks/list', authRequired, (req, res) => {
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const { page = 1, pageSize = 20, keyword = '', riskType = '', riskLevel = '', status = '' } = req.query || {};
        let rows = arr(db.biz.channel_dealer_risks).map((row) => ({ ...row }));

        if (keyword) {
            rows = rows.filter((row) => (
                textContains(row.reseller_code, keyword)
                || textContains(row.reseller_name, keyword)
                || textContains(row.title, keyword)
                || textContains(row.description, keyword)
            ));
        }
        if (riskType) rows = rows.filter((row) => String(row.risk_type) === String(riskType));
        if (riskLevel) rows = rows.filter((row) => String(row.risk_level) === String(riskLevel));
        if (status) rows = rows.filter((row) => String(row.status) === String(status));

        rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        apiOk(res, req, pg(rows, page, pageSize), '获取成功');
    });

    app.get('/api/channel-dealer-ops/risks/:id', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const db = readDb();
        ensureChannelDealerOpsStructures(db);

        const detail = arr(db.biz.channel_dealer_risks).find((row) => Number(row.id) === id);
        if (!detail) return apiErr(res, req, 404, '风险记录不存在');

        const followups = arr(db.biz.channel_dealer_risk_followups)
            .filter((row) => Number(row.risk_id) === id)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

        apiOk(res, req, { detail, followups }, '获取成功');
    });

    app.post('/api/channel-dealer-ops/risks/:id/follow-up', authRequired, (req, res) => {
        const id = toNum(req.params.id, 0);
        const body = req.body || {};
        const action = normalize(body.action || 'FOLLOW_UP').toUpperCase();
        const nextStatus = normalize(body.status || '').toUpperCase();

        let out = null;
        try {
            updateDb((db) => {
                ensureChannelDealerOpsStructures(db);
                const risk = arr(db.biz.channel_dealer_risks).find((row) => Number(row.id) === id);
                if (!risk) throw new Error('风险记录不存在');

                if (nextStatus && !RISK_STATUS.includes(nextStatus)) throw new Error(`status仅支持: ${RISK_STATUS.join(', ')}`);
                if (nextStatus) risk.status = nextStatus;
                if (body.owner !== undefined) risk.owner = normalize(body.owner);
                if (body.risk_level !== undefined && RISK_LEVEL.includes(String(body.risk_level).toUpperCase())) {
                    risk.risk_level = String(body.risk_level).toUpperCase();
                }

                risk.last_followup_at = nowIso();
                risk.updated_at = nowIso();

                const followup = {
                    id: nextId(db.biz.channel_dealer_risk_followups),
                    risk_id: id,
                    action,
                    status: risk.status,
                    comment: normalize(body.comment || ''),
                    operator: req.user?.nickname || req.user?.username || '系统',
                    created_at: nowIso()
                };

                db.biz.channel_dealer_risk_followups.push(followup);
                out = { detail: risk, followup };
            });
        } catch (error) {
            return apiErr(res, req, 400, error?.message || '跟进失败');
        }

        apiOk(res, req, out, '跟进成功');
    });
};

module.exports = {
    ensureChannelDealerOpsStructures,
    registerChannelDealerOpsRoutes,
    detectOverreachSales
};
