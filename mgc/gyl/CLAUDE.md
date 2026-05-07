# SCMP 供应链决策平台 — CLAUDE.md

## 项目概述

SCMP（Supply Chain Management Platform）是「认养一头牛」乳业的产供销一体化供应链决策平台，采用前后端分离架构，覆盖从牧场奶源、生产制造、库存仓配到渠道经销的全链路管理。

**全栈项目，前端 + 后端在同一仓库，需分别启动。**

## 技术栈

| 层 | 技术 | 版本/备注 |
|---|---|---|
| 前端框架 | Vue 3 | `beta` 频道 (3.x beta) |
| 构建工具 | Vite | ^7.3.1 |
| 语言 | TypeScript | ~5.9.3 |
| UI 组件库 | Element Plus | ^2.13.5 |
| 状态管理 | Pinia | ^3.0.4 |
| 路由 | Vue Router | ^4.6.4 |
| HTTP 客户端 | Axios | ^1.13.6 |
| 图表 | ECharts | ^6.0.0 |
| 后端框架 | Express | ^5.2.1 |
| 认证 | JWT | jsonwebtoken ^9.0.2 |
| 数据库 | MySQL | mysql2 ^3.19.1 (可选，默认 JSON 文件存储) |
| 缓存 | Redis | ^5.11.0 (可选) |
| 安全 | Helmet + Rate Limit | helmet ^8.1.0, express-rate-limit ^8.1.0 |

## 项目结构

```
gyl/
├── index.html                 # 前端入口 HTML
├── package.json               # 前端依赖与脚本
├── vite.config.ts             # Vite 配置
├── tsconfig.json              # TS 配置入口
├── tsconfig.app.json          # 前端 TS 配置
├── tsconfig.node.json         # Node/Vite TS 配置
├── setup-env.cjs              # 一键环境配置脚本
├── .env.local                 # 前端本地环境变量 (由 setup-env 生成)
├── dist/                      # 前端构建产物
├── public/                    # 静态资源
│   └── favicon.ico
├── src/                       # 前端源码
│   ├── main.ts                # 应用入口：创建 App、注册插件、Axios 拦截器
│   ├── App.vue                # 根组件：侧边栏布局、路由守卫、权限过滤
│   ├── router/
│   │   └── index.ts           # 路由配置：所有页面路由 + beforeEach 鉴权
│   ├── stores/
│   │   └── appStore.ts        # Pinia Store：认证上下文、权限判断、系统数据
│   ├── views/                 # 45+ 业务页面组件
│   │   ├── Login.vue / ForgotPassword.vue / Profile.vue    # 公共页
│   │   ├── DepartmentManage.vue / UserManage.vue / ...     # RBAC 权限
│   │   ├── IntelligentOrdering.vue / InventoryOpsCenter.vue / ...  # 业务运营
│   │   ├── MdmSkuList.vue / MdmOrgTree.vue / ...           # MDM 主数据
│   │   ├── PlatformAuditLogPage.vue / ...                   # 平台管理
│   │   └── ...                                              # 其他模块
│   ├── components/            # 通用组件
│   │   ├── MdmGenericList.vue       # 通用列表组件
│   │   ├── MdmGenericTree.vue       # 通用树组件
│   │   └── MdmGenericRelation.vue   # 通用关系组件
│   ├── data/                  # 静态数据与类型定义
│   │   ├── mockData.ts              # 模拟数据 + 全部数据模型类型
│   │   ├── webSidebarConfig.ts      # 侧边栏导航配置
│   │   └── skuSpec.ts               # SKU 编码规范
│   └── assets/                # 样式、图片、地图 GeoJSON
│       ├── base.css
│       ├── main.css
│       ├── login-bg.png
│       ├── china_map.png
│       └── china.json
├── server/                    # 后端源码
│   ├── package.json           # 后端依赖
│   ├── index.js               # Express 入口
│   ├── .env                   # 后端环境变量 (由 setup-env 生成)
│   ├── localDb.js             # JSON 文件数据库
│   ├── skuRules.js            # SKU 编码规则
│   ├── mdmGovernance.js       # 主数据治理
│   └── local-data/            # JSON 数据存储目录
└── .worktrees/                # Git worktrees (如 channel-demand-plan)
```

## 业务模块矩阵

| 模块分类 | 包含页面 | 侧边栏分组 |
|---|---|---|
| **工作台** | 流程待办中心、管理驾驶舱 | workbench |
| **业务运营** | 智能订购、订单闭环、库存仓配、渠道经销、需求计划、牧场奶源 | business-ops |
| **MDM 主数据** | SKU/SPU/品类/仓库/工厂/渠道/经销商/组织/日历/关系配置/治理 | mdm (仅超级管理员) |
| **组织权限** | 部门/用户/角色/岗位/权限管理、权限精细化控制 | org-permission |
| **系统运维** | 系统配置、健康视图、接口监控、数据归档 | sys-ops |
| **安全审计** | 登录日志、操作日志、审计日志 | security-audit |
| **平台工具** | 字典中心、导入/导出任务 | platform-tools |

## RBAC 权限模型

- **对象**：用户 (User) → 角色 (Role) → 权限 (Permission)，用户 → 岗位 (Post) → 部门 (Dept)
- **路由守卫** (`router/index.ts`)：beforeEach 检查 accessToken、拉取 /api/me 获取权限上下文、按 permissionPath 鉴权
- **超级管理员**：`isSuperAdmin=true` 可绕过所有权限校验，通过 SUPER_ADMIN_LOGIN_IDS 环境变量配置
- **权限路径格式**：`/department`、`/user` 等，路由 meta.permissionPath 映射到侧边栏
- **数据范围**：Role 支持 dataScopeType 和 dataScopeConfig

## 常用命令

```bash
# 一键初始化环境（首次）
node setup-env.cjs

# 仅检查环境不安装依赖
node setup-env.cjs --check

# 跳过依赖安装
node setup-env.cjs --skip-install

# 启动后端 (端口 3000)
cd server && npm start

# 启动前端开发服务器 (默认 5173)
npm run dev

# 类型检查
npm run type-check

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

## 关键架构决策

1. **API 响应格式**：统一 `{ code: 200, msg: "...", data: ... }`，前端 Axios 拦截器按 code 处理
2. **Token 管理**：登录返回 accessToken 存入 localStorage，请求头 `Authorization: Bearer <token>`
3. **认证流程**：登录 → localStorage 存 token → router beforeEach 拉 /api/me → 构建权限上下文 → 渲染侧边栏
4. **路由懒加载**：全部路由使用 `() => import(...)`，App.vue 在空闲时预热常用路由组件
5. **JSON 存储 + MySQL 可选**：默认使用本地 JSON 文件存储，配置数据库连接后切换到 MySQL
6. **侧边栏**：webSidebarConfig.ts 配置导航结构，支持 section > group > item 三级，`SIDEBAR_ROOT_ONLY_ONE_OPEN=true` 控制手风琴模式

## 代码约定

- Vue 组件使用 `<script setup lang="ts">` + Composition API
- 中文 UI 文本，Element Plus 配置 `zhCn` 语言包
- 页面组件命名：`XxxManage.vue`（管理）、`XxxCenter.vue`（中心）、`XxxPage.vue`（次级页）
- 通用组件命名：`MdmGenericXxx.vue`
- 类型定义集中在 `src/data/mockData.ts`，业务配置在 `src/data/webSidebarConfig.ts`
- 后端环境变量通过 dotenv 加载，命名大写蛇形 (UPPER_SNAKE)

## 已知待改进项

审查于 2026-05-04：
- 无自动化测试
- 无 CI/CD 流水线
- 无 ESLint/Prettier 配置
- 无 API 文档（Swagger/OpenAPI）
- 无结构化日志
- 无 Docker 容器化
- 无 Token 刷新机制
- 无数据库 migration
- 无环境变量校验
- 无消息队列
