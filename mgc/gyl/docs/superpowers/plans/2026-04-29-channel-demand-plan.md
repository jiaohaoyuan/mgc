# 渠道需求计划闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Vue 3 + Express + 本地 JSON 架构中，先完成独立的“渠道需求计划”业务闭环，再补产品锁定期，最后补滚动版本、版本对比和 Excel 导出。

**Architecture:** 新能力独立落在 `/demand/channel-plan` 页面和 `/api/demand/channel-plan` 接口前缀下，不塞进现有渠道与经销商经营中心。后端以 `server/channelDemandPlan.js` 承担业务规则与路由注册，数据首版写入 `server/local-data/db.json` 的 `biz` 区域，前端以单页工作台承接计划列表、版本列表和版本编辑表格。

**Tech Stack:** Vue 3、TypeScript、Vite、Element Plus、Pinia、Vue Router、Express、`server/localDb.js`、`xlsx`

---

## 文件结构与职责

**新增文件**

- `server/channelDemandPlan.js`
  - 渠道需求计划后端模块
  - 负责结构补齐、选项接口、计划/版本/明细/状态流转/锁定期/滚动/对比/导出
- `src/views/ChannelDemandPlan.vue`
  - 渠道需求计划前端工作台
  - 负责计划列表、版本抽屉、版本编辑、锁定期抽屉、对比和导出入口

**修改文件**

- `server/localDb.js`
  - 补齐 `db.biz` 新数组
  - 补齐 `/demand/channel-plan` 页面定义
  - 补齐超级管理员和智能订购继承角色的页面授权
- `server/index.js`
  - 引入并注册 `registerChannelDemandPlanRoutes`
  - 在 `API_PERMISSION_RULES` 增加 `/demand/channel-plan`
- `src/router/index.ts`
  - 新增 `/demand/channel-plan` 路由
- `src/data/webSidebarConfig.ts`
  - 在“业务运营”下新增“渠道需求计划”
- `src/App.vue`
  - 可选加入 `COMMON_ROUTE_PRELOADERS`
- `src/stores/appStore.ts`
  - 将 `/demand/channel-plan` 纳入候选首个可访问路径

**复用文件与数据源**

- `server/local-data/db.json`
  - 作为首版事实源
- `src/views/MdmChannelTree.vue`
  - 二级渠道主数据来源参考
- `server/channelDealerOps.js`
  - 参考其“ensure + register routes”的模块模式
- `db.master.channel`
  - 二级渠道来源
- `db.master.sku`
  - SKU 来源
- `db.master.category`
  - 用于回填三级品类信息

**本阶段明确不改**

- `src/views/ChannelDealerOpsCenter.vue`
- `server/channelDealerOps.js`
- SKU 七段式编码规则
- MySQL / Redis 真实读写

---

### Task 1: 搭出独立模块骨架与权限入口

**Files:**
- Create: `server/channelDemandPlan.js`
- Modify: `server/index.js`
- Modify: `server/localDb.js`
- Modify: `src/router/index.ts`
- Modify: `src/data/webSidebarConfig.ts`
- Modify: `src/App.vue`
- Modify: `src/stores/appStore.ts`

- [ ] **Step 1: 在 `server/localDb.js` 补齐首版业务数组**

把 `createSeedDb().biz` 和 `ensurePlatformStructures(db)` 一起补齐，新增以下数组键：

```js
channel_demand_plans: [],
channel_demand_plan_channels: [],
channel_demand_plan_skus: [],
channel_demand_plan_versions: [],
channel_demand_plan_channel_statuses: [],
channel_demand_plan_data: [],
product_lock_rules: [],
downstream_demand_plan_jobs: []
```

- [ ] **Step 2: 在 `server/localDb.js` 增加默认页面与授权继承**

在 `DEFAULT_PLATFORM_PAGES` 增加页面：

```js
{ id: 51, name: '渠道需求计划', path: '/demand/channel-plan', permission: 'biz:demand:channel-plan:view', parent_id: 20 }
```

并把它加入这组继承页：

```js
const inheritedPages = [
  '/intelligent-closed-loop',
  '/inventory-ops',
  '/channel-dealer-ops',
  '/workflow-center',
  '/management-cockpit',
  '/demand/channel-plan'
]
```

- [ ] **Step 3: 新建后端模块骨架 `server/channelDemandPlan.js`**

先只放模块壳，不着急填满业务逻辑：

```js
const { readDb, updateDb, nextId, nowIso } = require('./localDb');

const arr = (value) => (Array.isArray(value) ? value : []);

const ensureChannelDemandPlanStructures = (db) => {
  db.biz = db.biz || {};
  db.master = db.master || {};
  db.biz.channel_demand_plans = arr(db.biz.channel_demand_plans);
  db.biz.channel_demand_plan_channels = arr(db.biz.channel_demand_plan_channels);
  db.biz.channel_demand_plan_skus = arr(db.biz.channel_demand_plan_skus);
  db.biz.channel_demand_plan_versions = arr(db.biz.channel_demand_plan_versions);
  db.biz.channel_demand_plan_channel_statuses = arr(db.biz.channel_demand_plan_channel_statuses);
  db.biz.channel_demand_plan_data = arr(db.biz.channel_demand_plan_data);
  db.biz.product_lock_rules = arr(db.biz.product_lock_rules);
  db.biz.downstream_demand_plan_jobs = arr(db.biz.downstream_demand_plan_jobs);
  db.master.channel = arr(db.master.channel);
  db.master.sku = arr(db.master.sku);
  db.master.category = arr(db.master.category);
};

const registerChannelDemandPlanRoutes = ({ app, authRequired, apiOk, apiErr, paginate }) => {
  app.get('/api/demand/channel-plan/options', authRequired, (req, res) => {
    const db = readDb();
    ensureChannelDemandPlanStructures(db);
    apiOk(res, req, { channels: [], skus: [], categories: [] }, '获取成功');
  });
};

module.exports = {
  ensureChannelDemandPlanStructures,
  registerChannelDemandPlanRoutes
};
```

- [ ] **Step 4: 在 `server/index.js` 注册独立权限与路由**

增加 import：

```js
const { registerChannelDemandPlanRoutes } = require('./channelDemandPlan');
```

在 `API_PERMISSION_RULES` 增加：

```js
{ matcher: /^\/demand\/channel-plan(?:\/|$)/, permissionPath: '/demand/channel-plan' }
```

在注册区增加：

```js
registerChannelDemandPlanRoutes({
  app,
  authRequired,
  apiOk,
  apiErr,
  paginate
});
```

- [ ] **Step 5: 在前端接入独立入口，不复用旧页面**

路由新增：

```ts
{
  path: '/demand/channel-plan',
  name: 'ChannelDemandPlan',
  component: () => import('@/views/ChannelDemandPlan.vue'),
  meta: { title: '渠道需求计划', icon: 'Calendar', permissionPath: '/demand/channel-plan' }
}
```

侧边栏新增到“业务运营”：

```ts
{
  type: 'item',
  id: 'channel-demand-plan',
  label: '渠道需求计划',
  icon: 'Calendar',
  path: '/demand/channel-plan'
}
```

`src/stores/appStore.ts` 候选路径加上：

```ts
'/demand/channel-plan',
```

`src/App.vue` 可选预热：

```ts
() => import('@/views/ChannelDemandPlan.vue'),
```

- [ ] **Step 6: 跑最小验证**

Run:

```bash
cd C:\Users\Administrator\Desktop\mgc\mgc\gyl
npm run build
cd server
npm test
```

Expected:
- 前端构建通过
- 后端测试通过
- 超级管理员登录后可见“渠道需求计划”菜单

- [ ] **Step 7: Commit**

```bash
git add server/channelDemandPlan.js server/index.js server/localDb.js src/router/index.ts src/data/webSidebarConfig.ts src/App.vue src/stores/appStore.ts
git commit -m "feat: scaffold channel demand plan module"
```

---

### Task 2: 完成计划与版本基础能力

**Files:**
- Modify: `server/channelDemandPlan.js`
- Create: `src/views/ChannelDemandPlan.vue`

- [ ] **Step 1: 实现 options、计划列表、计划增改删、版本列表和新建版本接口**

优先补这组接口：

```txt
GET    /api/demand/channel-plan/options
GET    /api/demand/channel-plan
POST   /api/demand/channel-plan
PUT    /api/demand/channel-plan/:planCode
DELETE /api/demand/channel-plan/:planCode
GET    /api/demand/channel-plan/:planCode/version
POST   /api/demand/channel-plan/:planCode/version
GET    /api/demand/channel-plan/version/:versionCode
```

计划编码建议：

```js
const buildPlanCode = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `CDP-${y}${m}${day}-${String(Date.now()).slice(-4)}`;
};
```

- [ ] **Step 2: 在后端把范围展开和版本初始化写成独立函数**

先拆这几个函数，避免后面把逻辑堆到路由里：

```js
const listActiveLv2Channels = (db) =>
  arr(db.master.channel).filter((row) => String(row.level) === '2' && Number(row.status ?? 1) === 1);

const listActiveSkus = (db) =>
  arr(db.master.sku).filter((row) => Number(row.status ?? 1) === 1);

const expandPlanChannels = (db, plan) => { /* 全部渠道或指定渠道 */ };
const expandPlanSkus = (db, plan) => { /* 全部SKU或指定SKU */ };
const buildWeekSequence = (beginWeek, weekCount) => { /* 先按 ISO 周实现 */ };
```

- [ ] **Step 3: 给前端新建基础页面壳**

页面首版结构只放四块：

```vue
<template>
  <div class="channel-demand-plan-page">
    <div class="toolbar">筛选 + 新建计划</div>
    <el-table>计划列表</el-table>
    <el-drawer>版本列表</el-drawer>
    <el-dialog>新建计划 / 新建版本</el-dialog>
  </div>
</template>
```

首版数据模型只留必要状态：

```ts
const planQuery = reactive({ keyword: '', status: '', planType: '', createType: '' })
const planRows = ref<any[]>([])
const versionRows = ref<any[]>([])
const options = reactive({ channels: [], skus: [], categories: [] })
```

- [ ] **Step 4: 打通“新建计划 -> 查看版本 -> 新建版本”**

前端只先完成这条链：

```ts
await axios.get('/demand/channel-plan')
await axios.post('/demand/channel-plan', payload)
await axios.get(`/demand/channel-plan/${planCode}/version`)
await axios.post(`/demand/channel-plan/${planCode}/version`, payload)
```

不在这一步加入锁定期、滚动、导出。

- [ ] **Step 5: 跑验证**

Run:

```bash
cd C:\Users\Administrator\Desktop\mgc\mgc\gyl
npm run build
cd server
npm test
```

手动链路：
- 新建计划成功
- 版本抽屉可打开
- 新建首版成功
- `server/local-data/db.json` 出现 `channel_demand_plans` 和 `channel_demand_plan_versions`

- [ ] **Step 6: Commit**

```bash
git add server/channelDemandPlan.js src/views/ChannelDemandPlan.vue
git commit -m "feat: add channel demand plan and version basics"
```

---

### Task 3: 完成版本编辑、保存、渠道提交、撤回、整体确认闭环

**Files:**
- Modify: `server/channelDemandPlan.js`
- Modify: `src/views/ChannelDemandPlan.vue`

- [ ] **Step 1: 后端实现版本数据读写与状态流转接口**

补这组接口：

```txt
GET /api/demand/channel-plan/version/:versionCode/data
PUT /api/demand/channel-plan/version/:versionCode/data
PUT /api/demand/channel-plan/version/:versionCode/submit
PUT /api/demand/channel-plan/version/:versionCode/withdraw
PUT /api/demand/channel-plan/version/:versionCode/confirm
```

保存规则先按最小闭环落地：

```js
if (version.status === 'CONFIRMED') throw new Error('已确认版本不可修改');
if (channelStatus.submit_status === 1) throw new Error('已提交渠道不可修改');
if (planValue !== null && Number(planValue) < 0) throw new Error('需求数量不能小于0');
```

- [ ] **Step 2: 前端进入版本编辑工作台**

页面从“列表模式”切到“编辑模式”时，需要具备：

```ts
const activeVersionCode = ref('')
const activeChannelCode = ref('')
const versionWeeks = ref<string[]>([])
const dataRows = ref<any[]>([])
const dirtyCells = ref<Record<string, number | null>>({})
```

工作台结构：

```vue
<el-tabs>二级渠道标签</el-tabs>
<el-table>SKU 行 + 周列 + 合计列</el-table>
<div class="actions">保存 / 提交渠道 / 管理员撤回 / 整体确认</div>
```

- [ ] **Step 3: 严格区分 `null` 与 `0`**

显示规则固定：

```ts
const displayValue = (value: number | null) => value === null ? '' : value
```

保存时不要把空字符串直接转成 `0`：

```ts
const normalizePlanValue = (raw: unknown) => raw === '' || raw === undefined ? null : Number(raw)
```

- [ ] **Step 4: 整体确认时写入下游模拟 job**

确认动作只做本地 job，不接 MQ：

```js
db.biz.downstream_demand_plan_jobs.push({
  id: nextId(db.biz.downstream_demand_plan_jobs),
  job_code: `DJP-${Date.now()}`,
  source_plan_code: version.plan_code,
  source_version_code: version.version_code,
  job_type: 'WAREHOUSE_DEMAND_PLAN',
  status: 'PENDING',
  payload_summary: `confirmed:${version.version_code}`,
  created_at: nowIso(),
  updated_at: nowIso()
});
```

- [ ] **Step 5: 跑闭环链路验证**

Run:

```bash
cd C:\Users\Administrator\Desktop\mgc\mgc\gyl
npm run build
cd server
npm test
```

手动链路：
1. 新建计划
2. 新建版本
3. 选择某二级渠道
4. 填写多行 SKU 周度数据
5. 保存后刷新，值不丢
6. 提交该渠道
7. 管理员撤回该渠道
8. 所有渠道提交后整体确认

- [ ] **Step 6: Commit**

```bash
git add server/channelDemandPlan.js src/views/ChannelDemandPlan.vue
git commit -m "feat: complete channel demand plan submission flow"
```

---

### Task 4: 完成产品锁定期与锁定格控制

**Files:**
- Modify: `server/channelDemandPlan.js`
- Modify: `src/views/ChannelDemandPlan.vue`

- [ ] **Step 1: 后端补齐锁定期 CRUD 和快照刷新**

补接口：

```txt
GET    /api/demand/channel-plan/product-lock-rules
POST   /api/demand/channel-plan/product-lock-rules
PUT    /api/demand/channel-plan/product-lock-rules/:id
DELETE /api/demand/channel-plan/product-lock-rules/:id
POST   /api/demand/channel-plan/version/:versionCode/rebuild-locks
```

重叠校验最小逻辑：

```js
const hasDateOverlap = (startA, endA, startB, endB) =>
  !(String(endA) < String(startB) || String(endB) < String(startA));
```

- [ ] **Step 2: 版本创建时写锁定快照**

初始化单格数据时一起写：

```js
{
  is_locked: true,
  lock_rule_id: rule.id,
  lock_reason: `${rule.sku_name} 产品锁定期`
}
```

只在版本创建和“刷新快照”时批量重算，已确认版本不刷新。

- [ ] **Step 3: 前端给锁定期单独抽屉，不单独建路由**

在 `ChannelDemandPlan.vue` 中新增：

```vue
<el-drawer v-model="lockRuleDrawerVisible" title="产品锁定期">
  <el-table>规则列表</el-table>
  <el-dialog>新增/编辑规则</el-dialog>
</el-drawer>
```

不新建 `src/views/ProductLockRule.vue`。

- [ ] **Step 4: 锁定格交互按真实业务收口**

只做两类用户行为：

```txt
普通用户：锁定格只读，不可保存
超级管理员：编辑锁定格时必须二次确认并填写原因
```

不要在这一步扩展审批流、消息提醒、复杂审计页。

- [ ] **Step 5: 跑验证**

手动验证：
- 新建未来规则，可编辑可删除
- 新建当前生效规则，不可删除
- 命中规则的格子灰底
- 普通用户保存锁定格失败
- 管理员强制保存成功且有原因

- [ ] **Step 6: Commit**

```bash
git add server/channelDemandPlan.js src/views/ChannelDemandPlan.vue
git commit -m "feat: add product lock rules for channel demand plan"
```

---

### Task 5: 完成滚动版本、版本对比、Excel 导出

**Files:**
- Modify: `server/channelDemandPlan.js`
- Modify: `src/views/ChannelDemandPlan.vue`

- [ ] **Step 1: 实现手动滚动生成版本**

接口：

```txt
POST /api/demand/channel-plan/:planCode/version/roll
```

规则固定：

```txt
上一版本起始周 + 1 周
重叠周继承
新滚入周 plan_value = null
新版本状态 = 草稿
重新计算锁定快照
```

- [ ] **Step 2: 实现版本对比接口与前端视图**

接口：

```txt
GET /api/demand/channel-plan/version/compare
```

前端只做一个实用视图：

```vue
<el-dialog title="版本对比">
  <el-table>SKU 行 + 并集周列 + changed 标记</el-table>
</el-dialog>
```

不做花哨图表。

- [ ] **Step 3: 实现已确认版本导出**

接口：

```txt
GET /api/demand/channel-plan/version/:versionCode/export
```

后端输出字段：

```txt
计划编号
版本号
二级渠道编码
二级渠道名称
SKU编码
SKU名称
财年周
需求数量
```

空值导出为 `0`，文件名固定：

```txt
渠道需求计划_{plan_code}_{version_code}_{yyyyMMdd}.xlsx
```

- [ ] **Step 4: 跑验证**

手动验证：
- 滚动版本后重叠周继承正确
- 新周为空
- 对比视图能看出差异
- 未确认版本不能导出
- 已确认版本可以导出

- [ ] **Step 5: Commit**

```bash
git add server/channelDemandPlan.js src/views/ChannelDemandPlan.vue
git commit -m "feat: add rolling compare and export for channel demand plan"
```

---

### Task 6: 回归边界与 MySQL / Redis 进入条件

**Files:**
- Modify: `docs/context/PROJECT_CONTEXT.md`（仅在需要补充事实时）
- Review: `server/local-data/db.json`
- Review: `server/db/mysql.js`
- Review: `server/db/redis.js`

- [ ] **Step 1: 回归现有相关模块**

必须回归：

```txt
/channel-dealer-ops
/mdm/channel
/mdm/calendar
/intelligent
/export-task
/api/me
```

重点确认没有把“渠道经营”和“渠道需求计划”揉成一页。

- [ ] **Step 2: 明确当前阶段不切 MySQL / Redis**

本阶段保持：

```env
STORAGE_MODE=local-json
REDIS_ENABLED=false
```

不要在渠道需求计划主闭环没稳定前，把业务读写切到 MySQL 或 Redis。

- [ ] **Step 3: 只有满足这些信号才进入迁移准备**

进入 MySQL / Redis 前置准备的触发条件：

```txt
1. 计划主闭环已稳定可用
2. 版本数据量增大，db.json 写入明显吃力
3. 需要更强事务和并发约束
4. 需要导出任务进度、滚动锁、短期缓存
5. 业务确认该模块将长期保留
```

一旦触发，再单独开新任务做：

```txt
仓储层抽象
STORAGE_MODE
JSON -> MySQL 迁移脚本
对账脚本
Redis 键规范和失效策略
```

- [ ] **Step 4: 最终验证命令**

Run:

```bash
cd C:\Users\Administrator\Desktop\mgc\mgc\gyl
npm run build
cd server
npm test
```

Expected:
- 新菜单、权限、接口、页面闭环正常
- 旧渠道经营中心无回归
- 未提前引入 MySQL / Redis 业务依赖

---

## 实施顺序总结

严格按这个顺序执行，不反过来：

1. 独立模块骨架与权限入口  
2. 计划与版本基础能力  
3. 版本编辑、提交、撤回、确认闭环  
4. 产品锁定期  
5. 滚动版本、版本对比、Excel 导出  
6. 回归验证后，再判断是否进入 MySQL / Redis 前置准备

---

## 现实取舍

- 先保业务闭环，不追求一次把未来架构全铺满
- 不把新功能塞进现有 `ChannelDealerOpsCenter`
- 不为 MySQL 迁移提前把首版代码复杂化
- 不把 Redis 当主事实源
- 不引入真实 Quartz / MQ，先用手动滚动和本地 job 模拟
