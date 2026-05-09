# SCMP 供应链决策平台 — 阶段性开发计划与缺陷清单

> 文档版本：v1.0  
> 编制日期：2026-05-09  
> 视角：企业级团队协作开发  
> 关联文档：CLAUDE.md、docs/frontend-architecture.md、docs/api.md、docs/deployment.md

---

## 一、项目现状概览

SCMP 目前已具备 45+ 业务页面、完整的 RBAC 权限体系、操作审计日志、模块化后端路由，功能骨架基本成型。以下从企业团队开发的角度，梳理当前阻碍团队协作和后续扩展的关键问题。

**当前技术架构：**

| 维度 | 当前状态 | 风险等级 |
|---|---|---|
| 数据存储 | JSON 文件 (localDb.js)，单文件读写 | 高 |
| 认证 | JWT，无刷新机制，密钥硬编码默认值 | 高 |
| 代码规范 | 无 ESLint/Prettier | 中 |
| 测试 | 零自动化测试 | 高 |
| CI/CD | 无 | 中 |
| 部署 | 裸进程启动，无容器化 | 中 |
| 日志 | console.log，无结构化日志 | 中 |
| API 文档 | 已补 Markdown 文档，无 Swagger | 低 |
| 数据库版本 | 无 migration 机制 | 高 |
| 环境配置 | setup-env.cjs 一键脚本，无校验 | 低 |

---

## 二、现有缺陷清单

### 2.1 数据持久化缺陷（阻碍团队协作的核心问题）

**D-001：JSON 文件存储无法支持并发写入**

`server/localDb.js` 使用单文件 `db.json` 作为数据存储，通过内存缓存 + 全量读写实现。多用户并发操作时，后写入的请求会覆盖前一个请求的修改，导致数据丢失。这是切换到 MySQL 前必须正视的问题——当前设计仅适用于单开发者本地调试。

**D-002：数据库无 migration 机制**

当前数据结构变更完全依赖 `ensurePlatformStructures()` 中的 ad-hoc 补丁逻辑（如 `repairOrBuildSpuRows`、`migrateDairyCategoryData`）。团队开发中，每个成员的本地数据库结构可能不一致，且没有任何版本追踪手段。后续接入 MySQL 后，需要引入 migration 工具（如 db-migrate、knex、umzug）管理 DDL 变更。

**D-003：种子数据与业务数据混在一起**

`createSeedDb()` 中混合了系统初始化数据（角色、权限、字典）和默认管理员账号 `jiaohaoyuan / 123456789`。密码明文硬编码在代码中（虽然经 bcrypt 哈希），但团队成员拉取代码后每个环境拥有相同的管理员凭证，存在安全风险。种子数据（seed）应与迁移脚本（migration）分离。

**D-004：数据库连接配置未做环境隔离**

`server/.env` 模板中包含 `DB_HOST=localhost`、`DB_PASSWORD=123456` 等默认值。团队成员的本地 MySQL 密码很可能不同，当前缺少环境变量校验机制，启动失败时没有明确的错误提示指向配置问题。

**D-005：local-data 目录未被 .gitignore 覆盖**

当前 `.gitignore` 已忽略 `*.local` 文件，但 `server/local-data/` 目录未显式忽略。该目录存储运行时的 `db.json`，不同开发者之间会产生冲突。需添加 `server/local-data/` 到 `.gitignore`。

### 2.2 安全缺陷

**S-001：JWT 密钥使用硬编码默认值**

```javascript
// server/index.js:34
const JWT_SECRET = process.env.JWT_SECRET || 'local-file-jwt-secret';
```

生产环境若未配置环境变量，将使用弱默认密钥。应改为：未配置时拒绝启动，或至少打印明确告警。

**S-002：无 Token 刷新机制**

JWT 过期时间固定为 12 小时 (`JWT_EXPIRES_IN=12h`)，超期后用户必须重新登录。在长时间使用的业务场景（如仓库管理、连续生产排程）中频繁打断用户操作。应引入 refreshToken + accessToken 双令牌机制。

**S-003：默认管理员密码固定**

`jiaohaoyuan / 123456789` 写在代码中。团队成员本地环境、测试环境、演示环境共享同一凭证。建议：种子数据中管理员密码由环境变量注入，无配置时随机生成并在启动日志中打印。

**S-004：无请求签名或防重放机制**

当前 API 仅依赖 JWT Bearer Token 鉴权，无请求时间戳校验或 nonce 机制。虽然在企业内网风险较低，但面向公网部署时需要加强。

**S-005：`.env` 文件可能被误提交**

`server/.env` 和 `.env.local` 文件模板在 `setup-env.cjs` 中自动生成。虽然 `.gitignore` 中有 `*.local` 规则，但 `server/.env` 不在忽略列表中。需显式添加 `server/.env`。

### 2.3 代码质量缺陷

**C-001：零自动化测试**

项目中无任何单元测试、集成测试或 E2E 测试。`server/package.json` 中的 `"test": "node validateDairyCategoryData.js"` 仅为数据校验脚本，非正式测试。45+ 业务页面的回归依赖于工验证，团队协作中每次合并都可能引入未发现的缺陷。

**C-002：无 ESLint/Prettier 配置**

团队成员的代码风格完全依赖个人习惯（缩进、引号、分号、尾逗号等），Code Review 时会产生大量风格争议。TypeScript 项目尤其需要统一的 lint 规则。

**C-003：TypeScript 类型使用不严格**

前端虽使用 TypeScript，但 `appStore.ts` 中大量使用 `any` 类型（如 `rawDepts.filter((d: any) => ...)`、`map((u: any) => ...)`）。`tsconfig.app.json` 中 `strict: true` 是否启用需要核实。

**C-004：后端为纯 JavaScript，无类型约束**

`server/` 目录下的所有文件均为 `.js` 文件，缺乏类型系统保护。随着业务逻辑复杂化（算法权重计算、订单分配规则），JavaScript 的灵活性反而成为维护负担。建议逐步迁移到 TypeScript 或至少添加 JSDoc 类型注解。

**C-005：错误处理不一致**

`server/index.js` 中部分路由返回 `{ code: 200, msg: 'ok', data: ... }`，部分直接 `res.status(500).json({ ... })`。虽定义了 `ERROR_CODE_BY_STATUS` 映射表，但并非全部错误路径都遵循。

### 2.4 架构与运维缺陷

**A-001：无 Docker 容器化**

当前开发环境依赖 `node setup-env.cjs` 手动配置，不同成员的 Node.js 版本、操作系统差异可能导致环境不一致。MySQL、Redis 等可选依赖需要成员自行安装和配置。

**A-002：无结构化日志**

后端全使用 `console.log` 输出，无日志级别、无请求追踪 ID（虽然代码中定义了 `createTraceId()` 但未全局应用）、无日志文件轮转。线上问题排查困难。

**A-003：无 API 限流之外的防护**

已使用 `express-rate-limit`（默认配置），但无请求体大小限制、无 SQL 注入防护（切换 MySQL 后需要）、无 XSS 过滤。

**A-004：前端路由懒加载导致首次白屏**

所有路由使用 `() => import(...)` 动态导入，虽然 App.vue 中有 `warmupCommonRouteChunks` 预热策略，但在弱网环境下切换未预热的页面时仍有明显白屏。可考虑对核心业务页面使用静态导入。

**A-005：keep-alive 上限为 20**

`<keep-alive max="20">` 缓存上限固定为 20 个组件实例。45+ 页面中超出 20 的部分会被销毁，频繁切换时可能产生性能抖动。建议结合 LRU 策略或按模块分组缓存。

### 2.5 GitHub 协作就绪缺陷

**G-001：README.md 缺失**

项目根目录无 README.md 文件。团队成员拉取代码后无法快速了解：项目是什么、如何启动、依赖哪些外部服务、目录结构含义。现有的 CLAUDE.md 面向 AI 助手，不适合作为人类可读的项目说明。

**G-002：CONTRIBUTING.md 缺失**

无代码贡献指南（分支策略、commit 规范、PR 流程、Code Review 标准）。多人并行开发时容易产生合并冲突和沟通成本。

**G-003：.gitignore 不完整**

需新增忽略项：
- `server/local-data/` — 运行时数据目录
- `server/.env` — 后端环境变量
- `*.tgz`、`*.tar.gz` — 压缩包
- `.npm-global/` — 全局 npm 包

**G-004：敏感信息暴露风险**

`localDb.js` 中包含默认管理员密码哈希（虽经 bcrypt）、helper_code 固定值 `'952746'`。虽然开发环境可接受，但若代码被公开 fork，这些信息将成为攻击入口。建议通过环境变量注入。

**G-005：缺少 .editorconfig 或等效配置**

不同操作系统（Windows/macOS/Linux）的换行符、缩进设置不一致，可能导致 Git diff 中出现大量无意义的空白变更。

**G-006：Vue 3 beta 版本风险**

`package.json` 中 Vue 及相关包均使用 `"beta"` 频道。beta 版本 API 可能变动，不同成员的 `npm install` 时间不同可能拉取到不同的 beta 版本，导致行为不一致。建议锁定具体 beta 版本号或考虑升级到稳定版。

---

## 三、阶段性开发计划

### 总体路线图

```
Phase 1 (第1-2周)          Phase 2 (第3-5周)          Phase 3 (第6-8周)
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 团队协作基础设施   │     │ 数据层升级       │     │ 工程化与质量保障    │
│                 │     │                  │     │                  │
│ • README/贡献指南│ ──► │ • MySQL 接入      │ ──► │ • 自动化测试      │
│ • .gitignore 完善│     │ • Migration 机制  │     │ • ESLint/Prettier │
│ • 环境标准化     │     │ • 种子数据分离    │     │ • CI/CD 流水线    │
│ • 版本锁定       │     │ • 连接池管理      │     │ • API 文档(Swagger)│
└─────────────────┘     └──────────────────┘     └──────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
Phase 4 (第9-11周)        Phase 5 (第12-16周)     持续迭代
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ 安全与运维加固    │     │ 业务与技术增强     │     │ 持续优化          │
│                 │     │                  │     │                  │
│ • Token 刷新机制  │ ──► │ • 消息队列集成    │ ──► │ • 性能优化        │
│ • Docker 容器化  │     │ • 结构化日志      │     │ • 监控报警        │
│ • 安全扫描       │     │ • 后端 TypeScript │     │ • 灾备方案        │
│ • 环境变量校验   │     │ • 前后端类型共享   │     │ • 功能迭代        │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

---

### Phase 1：团队协作基础设施（第1-2周）

**目标：代码可被团队成员拉取、理解、启动，消除协作摩擦。**

#### 1.1 项目文档补全

| 任务 | 产出物 | 优先级 |
|---|---|---|
| 编写 README.md | 项目简介、技术栈、快速启动、目录结构、环境要求 | P0 |
| 编写 CONTRIBUTING.md | 分支策略（Git Flow / Trunk-based）、Commit 规范（Conventional Commits）、PR 模板、Code Review 清单 | P0 |
| 编写 .editorconfig | 统一缩进（2空格）、换行符（LF）、字符集（UTF-8） | P1 |
| 更新 CLAUDE.md | 补充团队开发相关内容 | P2 |

#### 1.2 Git 配置完善

| 任务 | 说明 | 优先级 |
|---|---|---|
| 补全 .gitignore | 添加 `server/local-data/`、`server/.env`、`*.tgz`、`.npm-global/` 等 | P0 |
| 添加 .gitattributes | 设置 `* text=auto`，指定二进制文件类型 | P1 |
| 配置 Branch Protection | 在 GitHub 上保护 main 分支，要求 PR + Review 通过才能合并 | P0 |
| 移除敏感默认值 | 将 `helper_code`、默认密码等从代码移至环境变量，代码中仅保留占位符或由脚本生成 | P1 |

#### 1.3 版本锁定与环境标准化

| 任务 | 说明 | 优先级 |
|---|---|---|
| 锁定 Vue 3 beta 版本 | 将 `"vue": "beta"` 改为具体版本号（如 `"3.5.16"`），避免不同时间安装的版本不一致 | P0 |
| 添加 .nvmrc 或 .node-version | 声明项目所需 Node.js 版本（`20.19` 或 `22.12`） | P1 |
| 增强 setup-env.cjs | 添加环境变量校验（数据库连接测试、JWT_SECRET 强度检查） | P2 |
| 添加 package.json engines 检查 | 在 `npm install` 时自动校验 Node 版本 | P1 |

#### 1.4 数据库团队协作过渡方案

**背景：在当前阶段，MySQL 尚未接入，团队成员的本地开发仍依赖 JSON 文件存储。需要先解决 JSON 文件模式下的协作问题，为 Phase 2 的 MySQL 迁移铺路。**

| 任务 | 说明 | 优先级 |
|---|---|---|
| 将 db.json 从 Git 跟踪中移除 | 确保 `server/local-data/` 已加入 .gitignore | P0 |
| 提供数据库初始化脚本 | 在 `npm start` 或 `node setup-env.cjs` 时自动生成初始 db.json（已实现 `createSeedDb`） | P0 |
| 编写数据库切换说明 | 在 README 中明确说明：默认使用 JSON 文件存储（无需外部依赖），配置 MySQL 后切换的步骤 | P1 |
| 预留数据库适配器接口 | 在 `localDb.js` 旁新增 `dbAdapter.js`，定义统一的 CRUD 接口（`findAll`、`findById`、`create`、`update`、`delete`），为 Phase 2 引入 MySQL adapter 做准备 | P2 |

#### Phase 1 验收标准

- [ ] 新成员克隆仓库后，执行 `node setup-env.cjs && cd server && npm start` 可成功启动后端
- [ ] 新成员执行 `npm run dev` 可成功启动前端，登录页面正常渲染
- [ ] `server/local-data/` 目录不在 Git 跟踪范围内
- [ ] README.md 包含完整的项目说明和启动步骤
- [ ] main 分支有 Branch Protection 规则

---

### Phase 2：数据层升级（第3-5周）

**目标：从 JSON 文件存储迁移到 MySQL，引入数据库版本管理，确保团队成员拥有一致的数据库结构。**

#### 2.1 MySQL 适配器开发

在当前 `localDb.js` 的 JSON 文件操作基础上，新增 MySQL 适配器：

```
server/
├── localDb.js          # 现有 JSON 文件存储（保留作为 fallback）
├── dbAdapter.js        # 统一数据访问接口（新增）
├── adapters/
│   ├── jsonAdapter.js  # JSON 文件适配器（重构自 localDb.js）
│   └── mysqlAdapter.js # MySQL 适配器（新增）
├── migrations/         # 数据库迁移脚本（新增）
│   ├── 001_init_schema.sql
│   ├── 002_seed_roles.sql
│   └── ...
└── seeds/              # 种子数据（新增，与 migration 分离）
    ├── dev/
    │   └── seed.js     # 开发环境种子数据
    └── test/
        └── seed.js     # 测试环境种子数据
```

| 任务 | 说明 | 优先级 |
|---|---|---|
| 定义 dbAdapter 接口 | 提取统一的 CRUD 接口：`findAll(table)`、`findById(table, id)`、`create(table, data)`、`update(table, id, data)`、`delete(table, id)`、`query(table, conditions)` | P0 |
| 实现 mysqlAdapter | 基于 `mysql2` 连接池实现上述接口，支持参数化查询防注入 | P0 |
| 重构 jsonAdapter | 将 `localDb.js` 的读写逻辑封装为 jsonAdapter，实现同一接口 | P1 |
| 适配器切换机制 | 通过环境变量 `DB_ADAPTER=mysql|json` 切换，默认 `json` 保持向后兼容 | P0 |

#### 2.2 数据库 Migration 机制

| 任务 | 说明 | 优先级 |
|---|---|---|
| 选型 Migration 工具 | 推荐 `knex`（内置 migration/seed 支持，API 简洁）或 `node-db-migrate` | P0 |
| 编写初始 Schema | 从 `createSeedDb()` 推测当前数据模型，设计 MySQL 表结构（约 40+ 张表） | P0 |
| 建立 migration 规范 | 命名格式 `YYYYMMDDHHmmss_description.js`，每次 DDL 变更都是独立 migration | P1 |
| 自动化 migration 执行 | `npm start` 或独立命令 `npm run migrate` 时自动执行未应用的 migration | P0 |
| Migration 回滚支持 | 每个 migration 提供 `up()` 和 `down()` 方法 | P2 |

#### 2.3 种子数据管理

| 任务 | 说明 | 优先级 |
|---|---|---|
| 系统种子数据与业务种子数据分离 | 系统数据（角色、权限、字典）放入 `seeds/system/`，业务演示数据（示例订单、库存）放入 `seeds/demo/` | P0 |
| 多环境种子数据 | `seeds/dev/` 包含开发者账号、示例业务数据；`seeds/test/` 包含测试用例数据 | P1 |
| 管理员密码环境变量注入 | `ADMIN_DEFAULT_PASSWORD` 环境变量，未设置时随机生成并打印到控制台 | P0 |
| 种子数据幂等性 | 多次执行 `npm run seed` 不会重复插入数据（使用 `INSERT ... ON DUPLICATE KEY UPDATE` 或先检查后插入） | P1 |

#### 2.4 数据库团队协作方案

这是用户关注的核心问题：**团队成员如何获得一致的数据库状态**。

| 场景 | 解决方案 |
|---|---|
| 新成员首次搭建环境 | `npm run setup` → 自动建库 → 执行全部 migration → 执行 dev seed → 获得可开发状态 |
| 已有环境升级 | `git pull` → `npm run migrate` → 仅执行新增的 migration → 表结构升级，数据保留 |
| 重置为干净状态 | `npm run db:reset` → 删库重建 → 执行 migration + seed |
| CI/CD 环境 | 流水线中执行 `npm run db:setup:test` → 使用 test seed 数据 → 运行测试 |

#### Phase 2 验收标准

- [ ] `DB_ADAPTER=mysql` 时系统正常运行，API 响应正确
- [ ] `DB_ADAPTER=json` 时仍可独立运行（无需安装 MySQL）
- [ ] 两个团队成员使用 `npm run db:reset` 后获得完全一致的数据库状态
- [ ] 新增 migration 文件后，其他成员 `npm run migrate` 即可同步
- [ ] 管理员密码不由代码硬编码

---

### Phase 3：工程化与质量保障（第6-8周）

**目标：建立代码规范、自动化测试和 CI/CD 流水线，保障多人协作的代码质量。**

#### 3.1 代码规范

| 任务 | 说明 | 优先级 |
|---|---|---|
| 配置 ESLint | 前端：`@vue/eslint-config-typescript`；后端：`eslint` + `@typescript-eslint/parser` | P0 |
| 配置 Prettier | 统一格式化规则：单引号、无分号、2空格缩进、尾逗号、120字符行宽 | P0 |
| 配置 lint-staged + husky | Git pre-commit hook 自动执行 ESLint + Prettier | P1 |
| 配置 commitlint | 校验 commit message 符合 Conventional Commits 规范 | P2 |
| 添加 npm scripts | `npm run lint`、`npm run format`、`npm run type-check` 统一入口 | P0 |

#### 3.2 自动化测试

| 任务 | 说明 | 优先级 |
|---|---|---|
| 后端单元测试 | 使用 Jest + Supertest，覆盖：认证流程、CRUD 操作、权限校验、SKU 编码规则 | P0 |
| 前端组件测试 | 使用 Vitest + Vue Test Utils，覆盖：关键业务组件（智能订购、库存管理） | P1 |
| API 集成测试 | 使用 Supertest 对全部 API 端点编写集成测试，覆盖正常/异常/边界场景 | P1 |
| E2E 测试 | 使用 Playwright，覆盖核心业务流程：登录 → 订单创建 → 审核 → 完成 | P2 |
| 测试覆盖率目标 | 后端 ≥ 70%，前端关键路径 ≥ 60% | P2 |

#### 3.3 CI/CD 流水线

| 任务 | 说明 | 优先级 |
|---|---|---|
| GitHub Actions — PR 检查 | 每次 PR 自动执行：TypeScript 类型检查、ESLint、单元测试、集成测试 | P0 |
| GitHub Actions — 构建验证 | PR 合并到 main 前自动执行 `npm run build` 验证构建是否成功 | P1 |
| 状态检查要求 | GitHub Branch Protection 要求 PR 检查全部通过才能合并 | P1 |
| 部署流水线（可选） | main 分支合并后自动部署到测试服务器 | P3 |

#### 3.4 API 文档

| 任务 | 说明 | 优先级 |
|---|---|---|
| 引入 Swagger/OpenAPI | 使用 `swagger-jsdoc` + `swagger-ui-express`，在代码中通过 JSDoc 注释生成 API 文档 | P1 |
| API 文档页面 | 在 `/api-docs` 路径提供交互式 Swagger UI | P1 |
| 请求/响应 Schema 定义 | 为每个 API 端点定义请求参数和响应数据的 JSON Schema | P2 |

#### Phase 3 验收标准

- [ ] `npm run lint` 通过无报错
- [ ] PR 提交后 CI 自动运行检查
- [ ] 后端单元测试覆盖率 ≥ 70%
- [ ] Swagger 文档可访问，包含全部 API 端点

---

### Phase 4：安全与运维加固（第9-11周）

**目标：提升系统安全性，实现容器化部署，建立生产级运维能力。**

#### 4.1 安全加固

| 任务 | 说明 | 优先级 |
|---|---|---|
| Token 刷新机制 | 引入 accessToken（短时效，30min）+ refreshToken（长时效，7d），前端 Axios 拦截器自动刷新 | P0 |
| JWT_SECRET 强制配置 | 生产环境未配置 JWT_SECRET 时拒绝启动，开发环境使用随机生成的临时密钥 | P0 |
| 请求体大小限制 | `express.json({ limit: '10mb' })` 防止大请求攻击 | P1 |
| Helmet 安全头配置 | 启用 CSP、X-Frame-Options、X-Content-Type-Options 等安全头 | P1 |
| 密码强度策略 | 新增用户/修改密码时校验密码强度（长度≥8、包含字母数字特殊字符至少两种） | P2 |
| 登录失败锁定 | 连续 5 次登录失败锁定账号 30 分钟 | P2 |
| 依赖安全扫描 | `npm audit` 集成到 CI，定期检查依赖漏洞 | P1 |

#### 4.2 Docker 容器化

| 任务 | 说明 | 优先级 |
|---|---|---|
| 前端 Dockerfile | 多阶段构建：build 阶段（Vite 构建）→ production 阶段（Nginx 静态服务） | P0 |
| 后端 Dockerfile | 基于 `node:22-alpine`，生产依赖安装，非 root 用户运行 | P0 |
| docker-compose.yml | 编排前端 + 后端 + MySQL + Redis 服务，一键启动完整环境 | P0 |
| .dockerignore | 排除 node_modules、dist、.git 等 | P1 |
| 开发环境 Docker | `docker-compose.dev.yml` 支持热重载，volume 挂载源码 | P1 |

#### 4.3 环境变量管理

| 任务 | 说明 | 优先级 |
|---|---|---|
| 环境变量校验 | 启动时检查必填环境变量是否存在，缺失时打印明确错误并退出 | P0 |
| .env.example | 提供环境变量模板文件，不含敏感默认值 | P0 |
| 环境变量文档 | 在 README 或独立文档中列出所有环境变量的含义、默认值、是否必填 | P1 |

#### 4.4 结构化日志

| 任务 | 说明 | 优先级 |
|---|---|---|
| 引入日志库 | 使用 `winston` 或 `pino`，支持日志级别（debug/info/warn/error） | P0 |
| 请求追踪 | 每个请求自动分配 traceId，贯穿整个请求生命周期 | P0 |
| 日志输出 | 开发环境输出到 console（彩色），生产环境输出到文件（JSON 格式，按日轮转） | P1 |
| 敏感信息脱敏 | 日志中自动遮蔽密码、Token 等敏感字段 | P2 |

#### Phase 4 验收标准

- [ ] `docker-compose up` 一键启动完整环境
- [ ] Token 过期后前端自动刷新，用户无感知
- [ ] 未配置 JWT_SECRET 时生产环境拒绝启动
- [ ] 请求日志包含 traceId，可追踪完整调用链

---

### Phase 5：业务与技术增强（第12-16周）

**目标：引入消息队列解耦业务、后端 TypeScript 迁移、前后端类型共享、性能优化。**

#### 5.1 消息队列集成

| 任务 | 说明 | 优先级 |
|---|---|---|
| 引入消息队列 | 选型 Redis BullMQ 或 RabbitMQ，用于异步任务处理 | P1 |
| 异步任务场景 | 导入/导出任务、订单分配计算、数据归档、通知推送 | P1 |
| 任务状态追踪 | 前端轮询或 WebSocket 获取任务进度，展示在导入/导出任务中心 | P2 |

#### 5.2 后端 TypeScript 迁移

| 任务 | 说明 | 优先级 |
|---|---|---|
| 后端 TS 基础设施 | 添加 `tsconfig.server.json`，配置 `ts-node` 或 `tsx` 运行时 | P2 |
| 逐步迁移 | 优先迁移核心模块：认证、权限、SKU 规则，再迁移 CRUD 路由 | P2 |
| 前后端类型共享 | 创建 `shared/` 目录，定义共享的类型接口（API 请求/响应、数据模型） | P2 |

#### 5.3 性能优化

| 任务 | 说明 | 优先级 |
|---|---|---|
| 前端构建优化 | Vite 代码分割策略优化，vendor chunk 拆分（element-plus、echarts 单独打包） | P1 |
| 图片/静态资源优化 | 压缩 GeoJSON 地图数据、懒加载非首屏图片 | P2 |
| 数据库查询优化 | 为高频查询添加索引、慢查询监控 | P1 |
| Redis 缓存 | 热点数据缓存（字典数据、权限配置、SKU 规则），减少数据库查询 | P2 |
| 前端虚拟滚动 | 长列表（SKU 管理、操作日志）使用虚拟滚动减少 DOM 节点 | P2 |

#### 5.4 监控与告警

| 任务 | 说明 | 优先级 |
|---|---|---|
| 健康检查端点 | `/health` 返回数据库连接状态、Redis 连接状态、内存使用、最后 migration 版本 | P1 |
| 接口性能监控 | 记录每个 API 的响应时间，暴露 `/metrics` 端点 | P2 |
| 异常告警 | 错误率超过阈值时通过企业微信/钉钉/邮件通知 | P3 |

---

## 四、缺陷与计划对应关系

为帮助项目管理，以下将 Phase 1-5 的计划任务与缺陷编号关联：

| 缺陷编号 | 缺陷简述 | 修复阶段 |
|---|---|---|
| D-001 | JSON 文件存储并发写入问题 | Phase 2 |
| D-002 | 无 migration 机制 | Phase 2 |
| D-003 | 种子数据与业务数据混杂 | Phase 2 |
| D-004 | 数据库连接配置无校验 | Phase 2 |
| D-005 | local-data 目录未 gitignore | Phase 1 |
| S-001 | JWT 密钥硬编码默认值 | Phase 4 |
| S-002 | 无 Token 刷新 | Phase 4 |
| S-003 | 默认管理员密码固定 | Phase 2 |
| S-004 | 缺少请求防重放 | Phase 4 |
| S-005 | .env 可能被误提交 | Phase 1 |
| C-001 | 零自动化测试 | Phase 3 |
| C-002 | 无 ESLint/Prettier | Phase 3 |
| C-003 | TypeScript any 类型滥用 | Phase 3 |
| C-004 | 后端纯 JavaScript | Phase 5 |
| C-005 | 错误处理不一致 | Phase 3 |
| A-001 | 无 Docker | Phase 4 |
| A-002 | 无结构化日志 | Phase 4 |
| A-003 | 防护不完善 | Phase 4 |
| A-004 | 路由懒加载白屏 | Phase 5 |
| A-005 | keep-alive 上限 | Phase 5 |
| G-001 | README 缺失 | Phase 1 |
| G-002 | CONTRIBUTING 缺失 | Phase 1 |
| G-003 | .gitignore 不完整 | Phase 1 |
| G-004 | 敏感信息暴露 | Phase 1 |
| G-005 | .editorconfig 缺失 | Phase 1 |
| G-006 | Vue 3 beta 版本风险 | Phase 1 |

---

## 五、风险与依赖

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| MySQL 表结构设计与现有 JSON 模式不一致 | Phase 2 迁移时大量重构 | 先基于 `createSeedDb()` 和 `ensurePlatformStructures()` 完整梳理数据模型，编写 Schema 设计文档后再建表 |
| Vue 3 beta 升级到稳定版引入 breaking changes | 前端功能异常 | Phase 1 先锁定版本，Phase 5 安排专项升级和回归测试 |
| 团队规模扩大导致 JSON 文件模式阻塞 | 开发效率下降 | Phase 2 尽早启动，可考虑先做 dbAdapter 抽象层（不改存储），降低后续切换成本 |
| 引入测试、CI/CD、Docker 等基础设施耗时超出预期 | 业务功能开发延期 | 基础设施由 1-2 名核心成员负责，其他成员继续业务开发，互不阻塞 |
| TypeScript 严格模式开启后大量类型错误 | 编译失败 | 渐进式开启 `strict` 子选项，逐项修复 |

---

## 六、维护建议

1. **本文件应随项目进展持续更新**，每完成一个 Phase 后标记完成日期并补充实际情况与计划的偏差。
2. **缺陷清单**（第二节）应保持与代码同步——修复后标记 ✓，发现新缺陷及时补充。
3. **每个 Phase 启动前**，召开技术评审会确认任务拆分和负责人。
4. **GitHub Issues** 中创建对应的 Epic（Phase 级）和 Task（任务级），将本文档内容落地为可追踪的工作项。
5. **定期回顾**（建议每两周），评估进度是否偏离计划，调整优先级。
