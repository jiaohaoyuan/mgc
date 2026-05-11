/**
 * 渠道需求提报 — 种子数据脚本
 *
 * 依赖：已存在确认的需求计划版本 + 仓库 + SKU 主数据 + 库存台账
 * 运行方式：node server/seedChannelDemandSubmission.js
 */

const { readDb, updateDb, nextId, nowIso } = require('./localDb');
const { ensureChannelDemandPlanStructures } = require('./channelDemandPlan');
const { ensureSubmissionStructures, autoAllocateAllLines, getSkuWarehouseStock } = require('./channelDemandSubmission');

const arr = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, fb = 0) => {
    const n = Number(v);
    return Number.isNaN(n) ? fb : n;
};

const seed = () => {
    const result = updateDb((db) => {
        ensureChannelDemandPlanStructures(db);
        ensureSubmissionStructures(db);

        // Find confirmed versions from demand plans
        const confirmedVersions = arr(db.biz.channel_demand_plan_versions)
            .filter((v) => Number(v.status) === 3);

        if (confirmedVersions.length === 0) {
            console.log('⚠ 暂无已确认的需求计划版本，跳过种子数据生成');
            console.log('  提示：先运行 node server/seedChannelDemandPlanMock.js 再运行本脚本');
            return { skipped: true };
        }

        if (arr(db.biz.inventory_ledger).length === 0) {
            console.log('⚠ 暂无库存台账数据，跳过种子数据生成');
            console.log('  提示：先运行 node server/inventoryOpsSeedScenarios.js 再运行本脚本');
            return { skipped: true };
        }

        let created = 0;

        confirmedVersions.forEach((version) => {
            const plan = arr(db.biz.channel_demand_plans).find(
                (p) => String(p.plan_code) === String(version.plan_code)
            );

            // Skip if already has a submission
            const existing = arr(db.biz.channel_demand_submissions).find(
                (s) => String(s.version_code) === String(version.version_code)
                    && Number(s.status) !== -1
            );
            if (existing) {
                console.log(`  ⊘ 版本 ${version.version_code} 已存在提报单，跳过`);
                return;
            }

            // Get plan data
            const planData = arr(db.biz.channel_demand_plan_data).filter(
                (d) => String(d.version_code) === String(version.version_code)
            );
            if (planData.length === 0) return;

            // Build submission
            const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const maxSeq = arr(db.biz.channel_demand_submissions)
                .filter((row) => String(row.submission_no || '').startsWith(`CDS${datePart}`))
                .reduce((max, row) => Math.max(max, toNum(String(row.submission_no || '').slice(-4), 0)), 0);
            const submissionNo = `CDS${datePart}${String(maxSeq + 1).padStart(4, '0')}`;

            const ratios = [0.7, 0.3];
            const warehouseCount = 2;

            const submission = {
                id: nextId(arr(db.biz.channel_demand_submissions)),
                submission_no: submissionNo,
                plan_code: version.plan_code,
                version_code: version.version_code,
                plan_name: plan?.plan_name || '',
                version_label: version.version_label || '',
                warehouse_count: warehouseCount,
                ratios,
                status: 0,
                created_by: '系统种子',
                created_time: nowIso(),
                updated_by: '系统种子',
                updated_time: nowIso(),
                confirmed_by: '',
                confirmed_time: ''
            };
            db.biz.channel_demand_submissions.push(submission);

            // Create lines
            planData.forEach((pd) => {
                db.biz.channel_demand_submission_lines.push({
                    id: nextId(arr(db.biz.channel_demand_submission_lines)),
                    submission_no: submissionNo,
                    lv2_channel_code: pd.lv2_channel_code,
                    lv2_channel_name: pd.lv2_channel_name,
                    sku_code: pd.sku_code,
                    sku_name: pd.sku_name,
                    category_code: pd.lv3_category_code || '',
                    category_name: pd.lv3_category_name || '',
                    plan_week: pd.plan_week,
                    week_start_date: pd.week_start_date,
                    week_end_date: pd.week_end_date,
                    plan_value: toNum(pd.plan_value, 0),
                    total_allocated: 0,
                    shortage: toNum(pd.plan_value, 0),
                    status: 0,
                    updated_by: '',
                    updated_time: nowIso()
                });
            });

            // Auto-allocate
            const allocResult = autoAllocateAllLines(db, submissionNo, warehouseCount, ratios);
            if (allocResult.noStock + allocResult.shortfall === 0) {
                submission.status = 1; // ALLOCATED
            }

            created++;
        });

        return {
            created,
            totalVersions: confirmedVersions.length
        };
    });

    if (result.skipped) return;

    console.log(`\n✓ 渠道需求提报种子数据创建完成`);
    console.log(`  已确认版本: ${result.totalVersions}`);
    console.log(`  创建提报单: ${result.created}\n`);

    // Report on each submission
    const db = readDb();
    ensureSubmissionStructures(db);
    const submissions = arr(db.biz.channel_demand_submissions).filter(
        (s) => Number(s.status) !== -1
    );
    submissions.forEach((s) => {
        const lines = arr(db.biz.channel_demand_submission_lines).filter(
            (l) => String(l.submission_no) === String(s.submission_no)
        );
        const fulfilled = lines.filter((l) => Number(l.status) === 1).length;
        const totalQty = lines.reduce((sum, l) => sum + toNum(l.plan_value, 0), 0);
        const allocatedQty = lines.reduce((sum, l) => sum + toNum(l.total_allocated, 0), 0);

        console.log(`  ${s.submission_no} | ${s.plan_name} → ${s.version_label}`);
        console.log(`    分配进度: ${fulfilled}/${lines.length} 行 (${lines.length > 0 ? Math.round(fulfilled / lines.length * 100) : 0}%)`);
        console.log(`    需求总量: ${totalQty.toLocaleString()} | 已分配: ${allocatedQty.toLocaleString()} | 缺口: ${(totalQty - allocatedQty).toLocaleString()}`);
        console.log('');
    });
};

seed();
