/**
 * 日分仓调拨种子数据
 * 运行：node server/seedDailyTransfer.js
 * 依赖：需先有已确认/已下发的渠道需求提报 or 低温提报
 */
const { updateDb, nextId, nowIso } = require('./localDb');
const arr = (v) => (Array.isArray(v) ? v : []);

const seed = () => {
    updateDb((db) => {
        db.biz = db.biz || {};
        db.biz.daily_transfer_submissions = arr(db.biz.daily_transfer_submissions);
        db.biz.daily_transfer_lines = arr(db.biz.daily_transfer_lines);
        const op = '系统种子', t = nowIso();

        const sources = [];
        arr(db.biz.channel_demand_submissions).filter(s => Number(s.status) >= 2).forEach(s => {
            if (!db.biz.daily_transfer_submissions.some(d => String(d.source_submission_no) === String(s.submission_no)))
                sources.push({ type: 'DEMAND_SUBMISSION', no: s.submission_no });
        });
        arr(db.biz.cold_chain_submissions).filter(s => Number(s.status) >= 2).forEach(s => {
            if (!db.biz.daily_transfer_submissions.some(d => String(d.source_submission_no) === String(s.submission_no)))
                sources.push({ type: 'COLD_CHAIN', no: s.submission_no });
        });

        let created = 0;
        sources.forEach(src => {
            const dailyNo = `DT${new Date().toISOString().slice(0,10).replace(/-/g,'')}${String(created+1).padStart(4,'0')}`;
            db.biz.daily_transfer_submissions.push({
                id: nextId(db.biz.daily_transfer_submissions), daily_no: dailyNo,
                source_type: src.type, source_submission_no: src.no,
                status: 0, created_by: op, created_time: t, updated_by: op, updated_time: t
            });

            // Generate sample daily lines (5 workdays)
            const startDate = new Date();
            for (let i = 1; i <= 5; i++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + i);
                if (d.getDay() === 0 || d.getDay() === 6) continue; // skip weekends
                const dateStr = d.toISOString().slice(0, 10);
                for (let j = 0; j < 3; j++) {
                    db.biz.daily_transfer_lines.push({
                        id: nextId(db.biz.daily_transfer_lines), daily_no: dailyNo,
                        warehouse_code: 'WH-HZ', warehouse_name: '杭州仓',
                        sku_code: 'SC-01001', sku_name: '纯牛奶250ml',
                        channel_code: 'CH-0201', channel_name: '华东渠道',
                        week: '2026W20', date: dateStr,
                        allocated_qty: 200 + j * 100, adjusted_qty: 200 + j * 100,
                        is_adjusted: false, lead_days: 1, temperature_zone: 0, transfer_no: ''
                    });
                }
            }
            created++;
        });
        console.log(`日分仓计划: ${created} 个`);
    });
    console.log('\n✓ 日分仓种子数据完成\n');
};
seed();
