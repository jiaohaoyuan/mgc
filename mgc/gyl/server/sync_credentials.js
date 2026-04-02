// 这个文件是什么作用显示的是什么：这是凭证同步脚本。显示/实现的是：用于处理和同步系统中用户的凭证/密码数据的逻辑。
const fs = require('fs');
const path = require('path');
const mysqlPool = require('./db/mysql');
const redisClient = require('./db/redis');

async function syncUsers() {
    console.log('🔄 开始从 User_Credentials.md 同步静态账号密码...');
    
    // 读取最新的文档内容
    const mdPath = path.join(__dirname, '../User_Credentials.md');
    if (!fs.existsSync(mdPath)) {
        console.error('❌ 未找到 User_Credentials.md');
        process.exit(1);
    }
    
    const content = fs.readFileSync(mdPath, 'utf-8');
    const lines = content.split('\n');
    let updated = 0;
    
    for (const line of lines) {
        // 只解析表格形式的行，跳过表头
        if (line.trim().startsWith('|') && !line.includes('---') && !line.includes('姓名 | 用户名')) {
            const parts = line.split('|').map(s => s.trim()).filter(Boolean);
            if (parts.length >= 6) {
                const name = parts[0];
                const loginId = parts[1];
                let password = parts[2];
                // 移除 Markdown 为了排版加上的反引号
                password = password.replace(/`/g, '');
                
                // 执行数据库更新
                try {
                    console.log(`[DEBUG] Attempting to update name="${name}" with loginId="${loginId}", password="${password}"`);
                    const [result] = await mysqlPool.query(
                        'UPDATE t_ryytn_account SET login_id = ?, password = ? WHERE name = ?',
                        [loginId, password, name]
                    );
                    
                    if (result.affectedRows > 0) {
                        updated++;
                        console.log(`✅ [${name}] 更新成功 -> 用户名: ${loginId}, 密码: ${password}`);
                    }
                } catch (err) {
                    console.error(`❌ [${name}] 更新失败:`, err.message);
                }
            }
        }
    }
    
    // 清除 Redis 中的用户缓存（如果有），防止旧数据影响
    try {
        await redisClient.del('cache:accounts');
    } catch (e) { }

    console.log(`🎉 账号同步结束，成功更新 ${updated} 个用户的登录凭证！`);
    process.exit(0);
}

syncUsers().catch(err => {
    console.error('❌ 执行异常:', err);
    process.exit(1);
});
