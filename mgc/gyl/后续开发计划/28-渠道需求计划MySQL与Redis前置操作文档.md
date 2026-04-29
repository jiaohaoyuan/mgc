# 渠道需求计划 MySQL 与 Redis 前置操作文档

更新时间：2026-04-28  
适用范围：渠道需求计划、产品锁定期、本地 JSON 到 MySQL 的迁移准备、Redis 缓存与短期状态使用  
当前结论：可以开始准备 MySQL 与 Redis，但渠道需求计划首版仍先使用 `server/local-data/db.json`

---

## 1. 文档目标

这份文档说明：如果后续要把渠道需求计划所有数据保存到 MySQL，并按需使用 Redis，需要先完成哪些前提操作。

本文件不是立即切库实施方案，而是切库前置操作清单。只有这些条件满足后，才建议从本地 JSON 切到 MySQL。

---

## 2. 当前代码现状

已具备：

- `server/package.json` 已包含 `mysql2`。
- `server/package.json` 已包含 `redis`。
- 已存在 `server/db/mysql.js`。
- 已存在 `server/db/redis.js`。
- 已存在 `server/.env`，包含 MySQL 与 Redis 的本地连接配置。

当前风险：

- 业务主读写仍然依赖 `server/localDb.js`。
- `server/.env` 当前含默认口令和敏感配置，不适合直接作为正式环境配置。
- `server/db/mysql.js` 只是连接池，没有业务仓储层。
- `server/db/redis.js` 启动即连接 Redis，缺少失败降级和健康状态封装。
- 还没有渠道需求计划的 MySQL DDL、迁移脚本、对账脚本和回滚方案。

---

## 3. 总体前置顺序

建议按以下顺序做：

1. 配置与密钥治理。
2. MySQL/Redis 本地服务准备。
3. 数据库命名、字符集、时区确认。
4. 渠道需求计划表结构冻结。
5. 数据访问层抽象。
6. JSON 到 MySQL 的迁移脚本。
7. 对账脚本与回滚方案。
8. Redis 使用边界与键规范。
9. 健康检查与监控。
10. 分阶段切换演练。

---

## 4. 配置与密钥治理

### 4.1 必做动作

- [ ] 将真实 `.env` 移出版本控制。
- [ ] 新增 `server/.env.example`。
- [ ] 区分本地、测试、预发、生产配置。
- [ ] 禁止正式环境使用 `root/123456`。
- [ ] 禁止正式环境 Redis 无密码裸连。
- [ ] 清理真实短信、数据库、Redis 密钥明文。

### 4.2 建议环境变量

```env
PORT=3000
JWT_SECRET=change-me
JWT_EXPIRES_IN=12h

STORAGE_MODE=local-json

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=cdop_app
DB_PASSWORD=change-me
DB_NAME=cdop_sys
DB_CONNECTION_LIMIT=10

REDIS_URL=redis://:change-me@127.0.0.1:6379/0
REDIS_ENABLED=false
REDIS_KEY_PREFIX=cdop:gyl
```

### 4.3 `STORAGE_MODE` 约定

建议新增存储模式开关：

- `local-json`：继续使用 `server/local-data/db.json`。
- `mysql`：主数据写入 MySQL。
- `dual-readonly-check`：接口主读 JSON，同时对比 MySQL 结果，只记录差异。
- `dual-write`：JSON 和 MySQL 双写，用于短期切换验证。

首版渠道需求计划开发仍使用：

```env
STORAGE_MODE=local-json
```

---

## 5. MySQL 服务前置操作

### 5.1 安装与版本

建议：

- MySQL 8.0 或兼容版本。
- 字符集：`utf8mb4`。
- 排序规则：`utf8mb4_0900_ai_ci` 或项目统一指定规则。
- 时区：`+08:00`。

### 5.2 建库

示例：

```sql
CREATE DATABASE IF NOT EXISTS cdop_sys
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
```

### 5.3 创建应用账号

示例：

```sql
CREATE USER IF NOT EXISTS 'cdop_app'@'%' IDENTIFIED BY 'change-me';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
ON cdop_sys.* TO 'cdop_app'@'%';
FLUSH PRIVILEGES;
```

生产环境建议：

- 建表迁移账号和应用运行账号分离。
- 应用账号不授予 `DROP` 权限。
- 使用内网地址或白名单限制来源。

### 5.4 连通验证

需要新增或执行一个后端健康检查：

- `GET /api/platform/health`
- 增加 `mysql.connected`
- 增加 `mysql.latency_ms`

验证 SQL：

```sql
SELECT 1 AS ok;
```

验收标准：

- 后端启动不报连接错误。
- 健康检查能返回 MySQL 可用状态。
- MySQL 不可用时，`local-json` 模式仍可启动。

---

## 6. 渠道需求计划 MySQL 表结构前置

### 6.1 建议表清单

渠道需求计划需要以下表：

- `dem_channel_plan`
- `dem_channel_plan_channel`
- `dem_channel_plan_sku`
- `dem_channel_plan_version`
- `dem_channel_plan_channel_status`
- `dem_channel_plan_data`
- `dem_product_lock_rule`
- `dem_downstream_demand_plan_job`

### 6.2 字段映射原则

JSON 数组与 MySQL 表保持一一映射：

| JSON 数组 | MySQL 表 |
|---|---|
| `biz.channel_demand_plans` | `dem_channel_plan` |
| `biz.channel_demand_plan_channels` | `dem_channel_plan_channel` |
| `biz.channel_demand_plan_skus` | `dem_channel_plan_sku` |
| `biz.channel_demand_plan_versions` | `dem_channel_plan_version` |
| `biz.channel_demand_plan_channel_statuses` | `dem_channel_plan_channel_status` |
| `biz.channel_demand_plan_data` | `dem_channel_plan_data` |
| `biz.product_lock_rules` | `dem_product_lock_rule` |
| `biz.downstream_demand_plan_jobs` | `dem_downstream_demand_plan_job` |

### 6.3 必须冻结的字段

切库前必须冻结：

- `plan_code`
- `version_code`
- `lv2_channel_code`
- `sku_code`
- `plan_week`
- `plan_value`
- `is_locked`
- `submit_status`
- `status`
- `created_time`
- `updated_time`

### 6.4 唯一键建议

必须设计唯一键：

```sql
-- 计划编码唯一
UNIQUE KEY uk_channel_plan_code (plan_code)

-- 同计划下版本号唯一
UNIQUE KEY uk_channel_plan_version (plan_code, version_code)

-- 同计划指定渠道唯一
UNIQUE KEY uk_channel_plan_channel (plan_code, lv2_channel_code)

-- 同计划指定 SKU 唯一
UNIQUE KEY uk_channel_plan_sku (plan_code, sku_code)

-- 同版本同渠道状态唯一
UNIQUE KEY uk_channel_plan_channel_status (version_code, lv2_channel_code)

-- 同版本、渠道、SKU、周唯一
UNIQUE KEY uk_channel_plan_data_cell (version_code, lv2_channel_code, sku_code, plan_week)
```

锁定期冲突不能只靠唯一键，需要业务校验：

- 同 SKU
- 同渠道
- 日期区间重叠

### 6.5 索引建议

`dem_channel_plan_data` 必须考虑查询量，建议索引：

```sql
KEY idx_channel_plan_data_version_channel (version_code, lv2_channel_code)
KEY idx_channel_plan_data_sku (sku_code)
KEY idx_channel_plan_data_week (plan_week)
KEY idx_channel_plan_data_locked (is_locked)
```

`dem_product_lock_rule` 建议索引：

```sql
KEY idx_product_lock_rule_sku (sku_code)
KEY idx_product_lock_rule_date (start_date, end_date)
```

---

## 7. 数据访问层前置操作

### 7.1 为什么必须先抽象

如果业务接口直接从 `readDb/updateDb` 改成 SQL，后续会出现：

- JSON 和 MySQL 混合读写。
- 事务边界难以控制。
- 回滚困难。
- 测试难以复用。

### 7.2 建议目录

新增：

```text
server/repositories/
  channelDemandPlanRepository.js
  localJsonChannelDemandPlanRepository.js
  mysqlChannelDemandPlanRepository.js
```

职责：

- `channelDemandPlanRepository.js`：根据 `STORAGE_MODE` 返回具体实现。
- `localJsonChannelDemandPlanRepository.js`：封装当前 `db.biz.*` 读写。
- `mysqlChannelDemandPlanRepository.js`：封装 MySQL SQL。

### 7.3 接口保持一致

仓储层至少提供：

- `listPlans(query)`
- `createPlan(payload)`
- `updatePlan(planCode, payload)`
- `deletePlan(planCode)`
- `listVersions(planCode)`
- `createVersion(payload)`
- `getVersion(versionCode)`
- `listVersionData(query)`
- `saveVersionData(versionCode, rows)`
- `submitChannel(versionCode, channelCode)`
- `withdrawChannel(versionCode, channelCode)`
- `confirmVersion(versionCode)`
- `listLockRules(query)`
- `createLockRule(payload)`
- `updateLockRule(id, payload)`
- `deleteLockRule(id)`

验收标准：

- `server/channelDemandPlan.js` 调用仓储接口，不直接关心 JSON 或 MySQL。
- `local-json` 模式功能不退化。
- 后续切 MySQL 主要改仓储层，不改前端接口。

---

## 8. JSON 到 MySQL 迁移前置操作

### 8.1 迁移脚本

建议新增：

```text
server/scripts/migrateChannelDemandPlanToMysql.js
server/scripts/verifyChannelDemandPlanMysql.js
```

迁移脚本职责：

- 读取 `server/local-data/db.json`。
- 将 `biz.channel_demand_*` 和 `biz.product_lock_rules` 写入 MySQL。
- 支持重复执行。
- 遇到唯一键冲突时按业务编码更新，不重复插入。
- 输出迁移数量和失败明细。

对账脚本职责：

- 比较 JSON 与 MySQL 的记录数量。
- 比较计划数量、版本数量、数据格数量。
- 抽样比较核心字段。
- 输出差异报告。

### 8.2 迁移顺序

必须按依赖顺序迁移：

1. `dem_channel_plan`
2. `dem_channel_plan_channel`
3. `dem_channel_plan_sku`
4. `dem_channel_plan_version`
5. `dem_channel_plan_channel_status`
6. `dem_channel_plan_data`
7. `dem_product_lock_rule`
8. `dem_downstream_demand_plan_job`

### 8.3 迁移前检查

- [ ] JSON 文件可解析。
- [ ] `plan_code` 不为空。
- [ ] `version_code` 不为空。
- [ ] 数据格不缺 `version_code/lv2_channel_code/sku_code/plan_week`。
- [ ] `plan_value` 保留 `null`，不能转成 0。
- [ ] 日期字段格式统一为 `YYYY-MM-DD` 或 ISO 字符串。
- [ ] 状态枚举均在允许范围内。

### 8.4 迁移后验收

必须确认：

- MySQL 计划数 = JSON 计划数。
- MySQL 版本数 = JSON 版本数。
- MySQL 数据格数 = JSON 数据格数。
- `null` 计划值仍为 SQL `NULL`。
- `0` 计划值仍为数字 0。
- 已确认版本状态不丢失。
- 锁定格 `is_locked` 不丢失。

---

## 9. Redis 使用前置操作

### 9.1 Redis 的定位

Redis 只做缓存和短期状态，不做渠道需求计划主事实源。

可以放 Redis：

- 登录验证码。
- 限流计数。
- 页面列表短期缓存。
- 版本详情短期缓存。
- Excel 导出任务进度。
- 滚动任务执行锁。
- 未读通知数。

不能放 Redis：

- 计划主数据唯一事实。
- 版本主数据唯一事实。
- 计划明细唯一事实。
- 产品锁定期规则唯一事实。

### 9.2 Redis 服务准备

建议：

- 开启密码。
- 禁止公网裸露。
- 配置最大内存策略。
- 独立选择 DB index。
- 设置 key 前缀。

示例：

```env
REDIS_ENABLED=true
REDIS_URL=redis://:change-me@127.0.0.1:6379/0
REDIS_KEY_PREFIX=cdop:gyl
```

### 9.3 Key 命名规范

建议：

```text
cdop:gyl:auth:sms:{username}
cdop:gyl:rate:{ip}:{route}
cdop:gyl:demand:channel-plan:list:{hash}
cdop:gyl:demand:channel-plan:version:{versionCode}
cdop:gyl:demand:channel-plan:export:{jobCode}
cdop:gyl:demand:channel-plan:roll-lock:{planCode}
```

### 9.4 TTL 建议

- 验证码：5 分钟。
- 限流计数：1 到 15 分钟。
- 计划列表缓存：30 到 60 秒。
- 版本详情缓存：30 到 60 秒。
- 导出任务进度：1 到 24 小时。
- 滚动任务锁：5 到 30 分钟。

### 9.5 缓存失效规则

以下操作后必须删除相关缓存：

- 新增/编辑/删除计划。
- 新建/滚动版本。
- 保存计划数据。
- 提交/撤回渠道。
- 整体确认。
- 新增/编辑/删除锁定期规则。
- 刷新锁定快照。

验收标准：

- Redis 挂掉时，主流程还能从 MySQL 或 JSON 读取，只是慢一些。
- 缓存数据不作为最终事实。

---

## 10. 事务与一致性前置操作

### 10.1 MySQL 事务边界

以下动作必须使用事务：

- 创建计划：计划主表 + 指定渠道 + 指定 SKU。
- 新建版本：版本表 + 渠道状态 + 计划数据格。
- 滚动版本：版本表 + 渠道状态 + 继承数据格。
- 保存数据：批量更新多个格子。
- 提交渠道：渠道状态 + 版本状态。
- 撤回渠道：渠道状态 + 版本状态。
- 整体确认：版本状态 + 下游 job。
- 新增锁定规则：规则写入 + 冲突校验。
- 刷新锁定快照：批量更新版本数据格。

### 10.2 并发控制

必须处理：

- 同一版本同一渠道多人同时保存。
- 同一渠道重复提交。
- 同一版本重复整体确认。
- 同一计划重复滚动。
- 同一 SKU + 渠道同时新增锁定规则。

建议：

- 使用唯一键兜底。
- 使用事务。
- 滚动版本使用 Redis 短锁或 MySQL 行锁。
- 保存数据时使用 `updated_time` 做乐观校验可选。

---

## 11. 健康检查与监控前置操作

### 11.1 MySQL 健康检查

需要检查：

- 连接是否成功。
- `SELECT 1` 是否成功。
- 当前数据库名。
- 连接耗时。

### 11.2 Redis 健康检查

需要检查：

- Redis 是否启用。
- `PING` 是否成功。
- 连接状态。
- 操作耗时。

### 11.3 接口建议

扩展现有：

- `GET /api/platform/health`

增加字段：

```json
{
  "storage": {
    "mode": "local-json",
    "mysql": {
      "enabled": false,
      "connected": false,
      "latency_ms": 0
    },
    "redis": {
      "enabled": false,
      "connected": false,
      "latency_ms": 0
    }
  }
}
```

---

## 12. 切换演练前置操作

### 12.1 第一轮：只连通

目标：

- MySQL 与 Redis 能连通。
- 不改业务读写。

验收：

- `local-json` 模式下所有功能照常运行。
- 健康检查显示 MySQL/Redis 状态。

### 12.2 第二轮：只迁移不切读写

目标：

- 将 JSON 数据迁移到 MySQL。
- 接口仍读 JSON。
- 对账脚本比较 JSON 与 MySQL。

验收：

- 迁移脚本可重复执行。
- 对账结果通过。

### 12.3 第三轮：双读校验

目标：

- 接口仍以 JSON 为准。
- 后台同时读 MySQL 进行差异记录。

验收：

- 主要查询接口 JSON 和 MySQL 结果一致。

### 12.4 第四轮：低风险切读

目标：

- 计划列表、版本列表先读 MySQL。
- 写操作仍谨慎保留 JSON 或进入双写。

验收：

- 页面列表和版本详情一致。

### 12.5 第五轮：正式切写

目标：

- 渠道需求计划主读写切到 MySQL。
- JSON 保留为回滚参考。

验收：

- 完整业务链路通过。
- 对账脚本通过。
- 回滚方案已演练。

---

## 13. 回滚前置操作

必须准备：

- 切换前 JSON 备份。
- 切换前 MySQL 备份。
- `STORAGE_MODE` 回退到 `local-json` 的步骤。
- Redis 缓存清理脚本。
- MySQL 新增数据导出脚本。

回滚条件：

- 数据迁移对账失败。
- MySQL 连续不可用。
- 核心链路出现阻断。
- 计划数据出现不可解释差异。

---

## 14. 正式切库前验收清单

只有以下全部完成，才建议把渠道需求计划正式切到 MySQL：

- [ ] `server/.env` 敏感配置治理完成。
- [ ] MySQL 数据库和应用账号创建完成。
- [ ] Redis 认证、前缀、DB index 配置完成。
- [ ] 渠道需求计划 MySQL DDL 评审通过。
- [ ] 唯一键和索引创建完成。
- [ ] 数据访问层抽象完成。
- [ ] JSON 仓储和 MySQL 仓储接口一致。
- [ ] JSON 到 MySQL 迁移脚本完成。
- [ ] MySQL 到 JSON 或 SQL 备份回滚方案完成。
- [ ] 对账脚本完成。
- [ ] 健康检查完成。
- [ ] Redis 失败降级完成。
- [ ] 完整业务链路回归通过。

---

## 15. 本阶段明确不做

- 不把 Redis 当主数据库。
- 不在未抽象仓储层前直接把业务代码改成 SQL。
- 不把渠道需求计划和订单库存主链一起切库。
- 不直接在生产环境使用默认 `.env`。
- 不在没有迁移和回滚脚本时正式切库。

---

## 16. 一句话结论

渠道需求计划可以先按本地 JSON 完成功能闭环；要把所有数据保存到 MySQL，必须先完成配置治理、建库建表、仓储层抽象、迁移对账、事务边界、Redis 使用边界和切换回滚演练。

Redis 只用于缓存、短期状态和任务锁；渠道需求计划的计划、版本、明细、锁定规则仍必须以 MySQL 为最终事实源。
