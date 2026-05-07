# 前端架构文档

## 1. 技术选型

| 类别 | 选型 | 版本 | 选型理由 |
|---|---|---|---|
| 框架 | Vue 3 | beta | Composition API、TypeScript 支持 |
| 构建 | Vite | 7.x | 极速 HMR、原生 ESM |
| 语言 | TypeScript | 5.9 | 类型安全、IDE 智能提示 |
| UI 库 | Element Plus | 2.13 | 成熟的中后台组件库 |
| 状态 | Pinia | 3.x | Vue 3 官方推荐、模块化 |
| 路由 | Vue Router | 4.6 | 官方路由库 |
| HTTP | Axios | 1.13 | 拦截器、取消请求 |
| 图表 | ECharts | 6.0 | 丰富的可视化图表 |
| 表格 | xlsx | 0.18 | Excel 导入导出 |

## 2. 目录结构

```
src/
├── main.ts                    # 应用入口
├── App.vue                    # 根组件（布局 + 路由 + 权限）
├── router/
│   └── index.ts               # 路由配置 + 导航守卫
├── stores/
│   └── appStore.ts            # 全局状态管理
├── views/                     # 页面组件（45+ 个）
├── components/                # 可复用组件（3 个通用 MDM 组件）
├── data/                      # 静态数据和类型定义
│   ├── mockData.ts            # 数据模型 + 模拟数据
│   ├── webSidebarConfig.ts    # 侧边栏配置
│   └── skuSpec.ts             # SKU 编码规范
└── assets/                    # 静态资源
    ├── base.css / main.css    # 全局样式
    ├── login-bg.png           # 登录页背景
    ├── china_map.png          # 中国地图图片
    └── china.json             # 中国地图 GeoJSON
```

## 3. 应用启动流程

```
main.ts
  ├─ 1. createApp(App)
  ├─ 2. 注册 Pinia
  ├─ 3. 注册 Vue Router
  ├─ 4. 注册 Element Plus (中文语言包)
  ├─ 5. 注册全部 Element Plus Icons
  ├─ 6. 配置 Axios
  │     ├─ baseURL: VITE_API_BASE || 'http://localhost:3000/api'
  │     ├─ timeout: 15000ms
  │     ├─ 请求拦截器: 添加 Bearer token
  │     └─ 响应拦截器: 401 → 踢回登录, 其他错误 → ElMessage
  └─ 7. mount('#app')
```

## 4. 路由设计

### 4.1 路由表

全部路由使用动态 import 懒加载。路由总数约 35 条，分类如下：

| 分类 | 路由数 | 示例路径 |
|---|---|---|
| 公共页 | 3 | `/login`, `/forgot-password`, `/profile` |
| RBAC 权限 | 6 | `/department`, `/user`, `/role`, `/post`, `/permission`, `/platform/fine-permission` |
| 系统运维 | 7 | `/platform/audit-log`, `/platform/config-center`, `/dict-center`, ... |
| 业务运营 | 6 | `/intelligent`, `/inventory-ops`, `/channel-dealer-ops`, ... |
| MDM 主数据 | 13 | `/mdm/sku`, `/mdm/warehouse`, `/mdm/rltn/warehouse-sku`, ... |

### 4.2 路由守卫 (beforeEach)

```
访问页面
  ├─ 无 accessToken
  │   ├─ 目标为 /login 或 /forgot-password → 放行
  │   └─ 其他页面 → 清除状态 → 跳转 /login?redirect=...
  │
  └─ 有 accessToken
      ├─ 拉取 /api/me 获取权限上下文
      │   ├─ 失败 → 清除状态 → 跳转 /login
      │   └─ 成功
      │       ├─ 目标为 /login 或 /forgot-password → 跳转首页
      │       └─ 检查 meta.permissionPath
      │           ├─ 超级管理员 → 放行
      │           ├─ 有权限 → 放行
      │           └─ 无权限 → 跳转第一个可访问页面
```

### 4.3 权限控制机制

- 路由 `meta.permissionPath` 映射权限标识（如 `/department`）
- 平台子页面统一使用 `/enterprise-platform` 权限标识
- MDM 页面额外通过 `meta.requiresSuperAdmin` 限制
- `/profile` 不受权限控制，用于无法访问任何页面时的兜底

## 5. 状态管理 (Pinia)

### 5.1 Store 结构 (`useAppStore`)

```
appStore
├── State
│   ├── departments: DeptNode[]       # 部门树
│   ├── posts: PostItem[]             # 岗位列表
│   ├── roles: RoleItem[]             # 角色列表
│   ├── users: UserItem[]             # 用户列表
│   ├── permissionTree: PermNode[]    # 权限菜单树
│   ├── pageNameMap: Record<number, string>  # 权限ID→名称映射
│   ├── authContext: AuthContext       # 当前用户认证上下文
│   ├── authLoaded: boolean           # 认证上下文是否已加载
│   └── authLoading: boolean          # 是否正在加载认证上下文
│
├── Getters
│   ├── isSuperAdmin: boolean         # 是否为超级管理员
│   └── permissionPathSet: Set<string> # 用户授权路径集合
│
└── Actions
    ├── fetchAccessContext()           # GET /api/me 获取用户权限
    ├── setAccessContext()             # 手动设置认证上下文
    ├── clearAccessContext()           # 清除认证状态
    ├── canAccessPath(path)            # 判断是否可访问某路径
    ├── filterNavItems(items)          # 按权限过滤导航项
    ├── getFirstAccessiblePath()       # 获取第一个可访问的页面
    └── fetchSystemData()              # 拉取部门/用户/角色/岗位/权限全量数据
```

### 5.2 认证上下文 (AuthContext)

```typescript
interface AuthContext {
  id: number | null
  username: string
  roleIds: number[]
  roleNames: string[]
  permissionIds: number[]
  permissionPaths: string[]    // 授权的路由路径
  isSuperAdmin: boolean
}
```

上下文来源：登录时通过 `POST /api/login` 响应设置 → `fetchAccessContext()` 通过 `GET /api/me` 刷新 → 持久化到 `localStorage.currentUser`

## 6. 侧边栏导航

### 6.1 配置结构

导航配置位于 `src/data/webSidebarConfig.ts`，支持三级结构：

```
SidebarSection[]           # 一级：分区（工作台、业务运营、MDM、权限系统）
├── SidebarMenuItem        # 二级：直接菜单项
└── SidebarMenuGroup       # 二级：分组
    └── SidebarMenuItem[]  # 三级：分组内菜单项
```

### 6.2 权限过滤逻辑

```typescript
// App.vue 在 computed visibleSidebarSections 中执行：
1. 检查 section 级别 requiresSuperAdmin
2. 过滤 group 内无权限的子项
3. 过滤无权限的 item
4. 移除空的 section/group
```

### 6.3 交互特性

- 手风琴模式：`SIDEBAR_ROOT_ONLY_ONE_OPEN=true`，每次只能打开一个一级分区
- 路由 hover 预加载：鼠标悬停菜单项时触发 `preloadRouteComponent()`
- 状态保持：section/group 展开状态跨页面保持
- 活动指示：当前页面对应菜单高亮，`pending` 状态显示跳转中反馈

## 7. 路由预加载策略

App.vue 在应用 idle 时自动预热常用路由的代码分块：

```typescript
const COMMON_ROUTE_PRELOADERS = [
  WorkflowCenter, ManagementCockpit, IntelligentOrdering,
  InventoryOpsCenter, ChannelDealerOpsCenter, ChannelDemandPlan,
  OrderClosedLoopCenter, PastureOverview, DictCenter,
  PlatformAuditLogPage, PlatformSecurityCenterPage,
  PlatformConfigCenterPage, PlatformArchiveStrategyPage,
  PlatformMonitorPage, PlatformFinePermissionPage,
  PlatformHealthViewPage
]
```

预热时机：
1. 用户已登录（有 accessToken）
2. 不在登录/忘记密码页面
3. 使用 `requestIdleCallback` 或 `setTimeout(600ms)` 延迟执行
4. 每个组件之间间隔 120ms，避免阻塞主线程

## 8. HTTP 请求架构

### 8.1 Axios 配置

```typescript
// main.ts
axios.defaults.baseURL = 'http://localhost:3000/api'  // 或 VITE_API_BASE
axios.defaults.timeout = 15000
```

### 8.2 拦截器

**请求拦截器**：自动附加 `Authorization: Bearer <token>`

**响应拦截器**：
- 401 → 清除登录态 → 跳转 `/login`
- 其他错误 → `ElMessage.error(msg)`

### 8.3 Store 中的请求去重

`fetchAccessContext()` 使用 `accessContextPromise` 实现请求去重，避免并发重复请求 `/api/me`。

`fetchSystemData()` 使用 `_loading` 标志位防止重复拉取系统数据。

## 9. 组件层级

```
App.vue
├── 登录/忘记密码 → 无布局直接渲染路由
├── 加载状态 → 显示 spinner
└── 正常布局
    ├── Sidebar (aside.sidebar)
    │   ├── Logo + 标题
    │   ├── Navigation (nav.sidebar-nav)
    │   │   └── Section → Group → Item (根据 webSidebarConfig 渲染)
    │   └── 用户信息卡片
    ├── Main Area
    │   ├── Topbar (header.topbar)
    │   │   ├── 面包屑
    │   │   ├── 当前时间
    │   │   ├── 通知图标 (Badge + Bell)
    │   │   └── 用户下拉菜单 (个人中心/辅助码/退出)
    │   └── Content (main.content-area)
    │       └── <keep-alive max=20> → <router-view>
    └── 辅助动态码弹窗 (仅超管可见)
```

## 10. 页面路由映射表

| 路由 | 页面组件 | 所属模块 | 超管限定 |
|---|---|---|---|
| `/login` | Login.vue | 公共 | - |
| `/forgot-password` | ForgotPassword.vue | 公共 | - |
| `/profile` | Profile.vue | 公共 | - |
| `/department` | DepartmentManage.vue | RBAC | - |
| `/user` | UserManage.vue | RBAC | - |
| `/role` | RoleManage.vue | RBAC | - |
| `/post` | PostManage.vue | RBAC | - |
| `/permission` | PermissionManage.vue | RBAC | - |
| `/dict-center` | DictCenter.vue | 平台工具 | - |
| `/operation-log` | OperationLogCenter.vue | 安全审计 | - |
| `/import-task` | ImportTaskCenter.vue | 平台工具 | - |
| `/export-task` | ExportTaskCenter.vue | 平台工具 | - |
| `/platform/audit-log` | PlatformAuditLogPage.vue | 安全审计 | - |
| `/platform/security-center` | PlatformSecurityCenterPage.vue | 安全审计 | - |
| `/platform/config-center` | PlatformConfigCenterPage.vue | 系统运维 | - |
| `/platform/archive-strategy` | PlatformArchiveStrategyPage.vue | 系统运维 | - |
| `/platform/monitor` | PlatformMonitorPage.vue | 系统运维 | - |
| `/platform/fine-permission` | PlatformFinePermissionPage.vue | RBAC | - |
| `/platform/health-view` | PlatformHealthViewPage.vue | 系统运维 | - |
| `/intelligent` | IntelligentOrdering.vue | 业务运营 | - |
| `/intelligent-closed-loop` | OrderClosedLoopCenter.vue | 业务运营 | - |
| `/inventory-ops` | InventoryOpsCenter.vue | 业务运营 | - |
| `/channel-dealer-ops` | ChannelDealerOpsCenter.vue | 业务运营 | - |
| `/demand/channel-plan` | ChannelDemandPlan.vue | 业务运营 | - |
| `/pasture` | PastureOverview.vue | 业务运营 | - |
| `/workflow-center` | WorkflowCenter.vue | 工作台 | - |
| `/management-cockpit` | ManagementCockpit.vue | 工作台 | - |
| `/mdm/sku` | MdmSkuList.vue | MDM | 是 |
| `/mdm/spu` | MdmSpuList.vue | MDM | 是 |
| `/mdm/category` | MdmCategoryTree.vue | MDM | 是 |
| `/mdm/warehouse` | MdmWarehouseList.vue | MDM | 是 |
| `/mdm/factory` | MdmFactoryList.vue | MDM | 是 |
| `/mdm/channel` | MdmChannelTree.vue | MDM | 是 |
| `/mdm/reseller` | MdmResellerList.vue | MDM | 是 |
| `/mdm/org` | MdmOrgTree.vue | MDM | 是 |
| `/mdm/calendar` | MdmCalendar.vue | MDM | 是 |
| `/mdm/reseller-relation` | MdmResellerRelation.vue | MDM | 是 |
| `/mdm/rltn/warehouse-sku` | MdmRltnWarehouseSku.vue | MDM | 是 |
| `/mdm/rltn/org-reseller` | MdmRltnOrgReseller.vue | MDM | 是 |
| `/mdm/rltn/product-sku` | MdmRltnProductSku.vue | MDM | 是 |
| `/mdm/governance` | MdmGovernanceCenter.vue | MDM | 是 |
