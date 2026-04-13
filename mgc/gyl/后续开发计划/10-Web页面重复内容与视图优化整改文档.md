# 10-Web页面重复内容与视图优化整改文档

## 1. 目标与范围
- 目标：遍历现有 Web 页面，识别重复内容与视图优化点，形成可执行整改方案。
- 扫描范围：`src/views` 下全部 `.vue` 页面，共 **41** 个。
- 路由挂载情况：路由已挂载 **39** 个页面，未挂载页面 **2** 个（`EnterprisePlatformCenter.vue`、`Register.vue`）。
- 重点评估维度：页面结构重复、接口能力重复、样式重复、可维护性与体验一致性。

## 2. 总体结论
- 当前项目已形成“模块化功能页 + 多个大型中心页”并存形态，业务功能覆盖较全。
- 重复问题主要集中在三类：
1. 旧聚合页与新独立页并存（企业级平台 7 模块）。
2. 同构 CRUD 页面大量重复（组织权限、任务中心、部分 MDM 页面）。
3. 视觉层重复样式分散定义（同名类 `toolbar`、`pager`、`code-text` 等反复出现）。
- 优化方向应以“统一页面壳 + 统一列表/表单组合能力 + 清理旧入口 + API 访问统一”四条主线推进。

## 3. 重复内容识别

### 3.1 高相似度页面对（代码结构相似度）
| 序号 | 页面A | 页面B | 相似度 | 判定 |
|---|---|---|---:|---|
| 1 | `MdmCategoryTree.vue` | `MdmChannelTree.vue` | 0.725 | 配置型同构页面，可继续模板化 |
| 2 | `MdmFactoryList.vue` | `MdmWarehouseList.vue` | 0.702 | 配置型同构页面，可继续模板化 |
| 3 | `MdmRltnProductSku.vue` | `MdmRltnWarehouseSku.vue` | 0.663 | 配置型同构页面，可继续模板化 |
| 4 | `ExportTaskCenter.vue` | `ImportTaskCenter.vue` | 0.642 | 功能高度相似，建议合并为任务中心壳 |
| 5 | `MdmChannelTree.vue` | `MdmOrgTree.vue` | 0.635 | 配置型同构页面 |
| 6 | `OperationLogCenter.vue` | `PlatformAuditLogPage.vue` | 0.564 | 日志能力重叠，建议统一入口 |
| 7 | `PostManage.vue` | `UserManage.vue` | 0.528 | CRUD 页面骨架重复 |
| 8 | `DepartmentManage.vue` | `PostManage.vue` | 0.512 | CRUD 页面骨架重复 |
| 9 | `RoleManage.vue` | `UserManage.vue` | 0.463 | CRUD 页面骨架重复 |

### 3.2 功能级重复（业务能力重复）

#### A. 企业级平台旧页与新页并存（最高优先级）
- 旧页：`src/views/EnterprisePlatformCenter.vue`（7 个 Tab 聚合）。
- 新页：
1. `PlatformAuditLogPage.vue`
2. `PlatformSecurityCenterPage.vue`
3. `PlatformConfigCenterPage.vue`
4. `PlatformArchiveStrategyPage.vue`
5. `PlatformMonitorPage.vue`
6. `PlatformFinePermissionPage.vue`
7. `PlatformHealthViewPage.vue`
- 证据：旧页与新页调用相同后端能力（如 `/platform/audit-logs`、`/platform/security/logs`、`/platform/system-configs`、`/platform/health` 等）。
- 结论：旧聚合页应下线或改为纯跳转页，避免双入口维护。

#### B. 任务中心重复
- `ImportTaskCenter.vue` 与 `ExportTaskCenter.vue`：查询栏、表格、分页、详情抽屉结构基本一致。
- 差异仅在接口路径与少量列/动作。
- 结论：可抽象 `TaskCenterShell`，通过配置注入“导入/导出”能力。

#### C. 组织权限 CRUD 同构
- `DepartmentManage.vue`、`UserManage.vue`、`RoleManage.vue`、`PostManage.vue`。
- 共性：统计卡片 + 查询条件 + 表格 + 分页 + 编辑弹窗 + 权限校验。
- 结论：可抽取统一 CRUD 页面壳与 composable，减少重复逻辑。

### 3.3 样式与交互重复
- 高频重复样式类：
1. `toolbar`（14 页）
2. `head`（9 页）
3. `pager`（8 页）
4. `code-text`（11 页）
5. `page-wrap`（4 页）
- 结论：建议上收为共享样式 token + 公共容器组件，避免每页重复定义。

## 4. 视图优化清单

### 4.1 统一页面壳（建议新增）
- 新增 `PageShell`：统一标题区、刷新按钮、筛选区、主表格、分页、抽屉/弹窗区。
- 新增 `usePagedQuery`：统一分页、查询、重置、加载状态。
- 新增 `useCrudDialog`：统一新增/编辑弹窗状态与提交流程。
- 新增 `useTableSelection`：统一批量勾选与批处理入口。

### 4.2 模块级优化建议

#### 组织权限模块
- 页面：`DepartmentManage`、`UserManage`、`RoleManage`、`PostManage`。
- 优化：
1. 抽取统计卡片组件（数字卡 + icon + label）。
2. 抽取通用 CRUD 表格组件（搜索、分页、操作列插槽）。
3. 统一提示语与错误处理，避免“失败”类泛提示。

#### 企业级平台模块
- 页面：7 个独立页 + 旧 `EnterprisePlatformCenter`。
- 优化：
1. 保留 7 个独立菜单页，旧聚合页下线。
2. 统一 `head/toolbar/pager/json-box` 样式。
3. 对审计与操作日志明确边界：一个做全平台审计，一个做业务操作日志，避免用户认知重复。

#### MDM 模块
- 页面：`MdmGenericList/Tree/Relation` 已起到复用作用，方向正确。
- 优化：
1. 将 `MdmSkuList.vue`、`MdmResellerRelation.vue` 逐步迁移到通用壳能力。
2. 将重复 `code-text` 等样式收敛到公共样式。
3. 统一导入/导出交互（模板下载、上传结果、任务回溯）。

#### 运营中心大页面
- 页面：`IntelligentOrdering`、`InventoryOpsCenter`、`ChannelDealerOpsCenter`、`WorkflowCenter`、`ManagementCockpit`、`PastureOverview`、`OrderClosedLoopCenter`、`MdmGovernanceCenter`。
- 现状：多页在 500~1400 行，单文件承载过多查询状态与弹窗逻辑。
- 优化：
1. 按 Tab 拆分子组件（每个 Tab 一个子组件）。
2. 将图表渲染封装到 `useEcharts`，统一销毁/resize 生命周期。
3. 将“列表查询 + 分页”抽为 composable，减少重复状态定义。

### 4.3 接口访问与配置一致性
- 问题：发现 **10** 个页面存在 `http://localhost:3000/api` 硬编码。
- 涉及：`DepartmentManage.vue`、`ForgotPassword.vue`、`IntelligentOrdering.vue`、`MdmResellerRelation.vue`、`MdmSkuList.vue`、`PostManage.vue`、`Profile.vue`、`Register.vue`、`RoleManage.vue`、`UserManage.vue`。
- 建议：统一改为 axios 实例 + 环境变量配置，不在页面层写死域名。

### 4.4 低风险但高价值优化
- 为列表页统一“空态、加载态、错误态”展示规范。
- 统一日期展示格式和标签色含义。
- 对无路由页面做治理：
1. `EnterprisePlatformCenter.vue`：迁移后下线。
2. `Register.vue`：明确是否保留（若不开放注册，应删除路由外死页面）。

## 5. 分阶段整改计划

### P0（1 周，先减重复入口与配置风险）
1. 下线/冻结 `EnterprisePlatformCenter.vue`，保留 7 个独立菜单页。
2. 清理 10 个硬编码 API_BASE，统一到 axios 基础配置。
3. 建立统一错误提示函数（带后端 `msg/message` 透出）。

### P1（2 周，抽象高重复骨架）
1. 抽 `TaskCenterShell` 合并导入/导出任务页面骨架。
2. 抽组织权限 `CrudPageShell` + `useCrudPage`，先覆盖 `Post/User/Role`。
3. 收敛公共样式：`toolbar/head/pager/code-text/page-wrap`。

### P2（2~3 周，降低大型页面复杂度）
1. 运营中心大页面按 Tab 子组件化。
2. 抽离图表和分页查询 composable。
3. 推进 `MdmSkuList`、`MdmResellerRelation` 向 `MdmGeneric*` 框架靠拢。

## 6. 验收标准与回归清单

### 6.1 验收标准
1. 重复入口减少：企业平台仅保留 7 个独立菜单入口。
2. 页面硬编码 API_BASE 数量降为 0。
3. 公共壳组件覆盖率：任务中心 + 组织权限核心页完成迁移。
4. 关键页面功能无回归（查询、分页、详情、增删改、导入导出）。

### 6.2 回归清单
1. 路由可达性：所有菜单点击可达，历史路由重定向正确。
2. 数据正确性：筛选条件、分页、导出结果一致。
3. 权限正确性：普通用户与超管的按钮可见性一致。
4. 稳定性：图表页切换 Tab、窗口 resize、离开页面销毁无报错。
5. 体验一致性：空态、加载态、错误态文案统一。

## 7. 全页面清单（已遍历）

### 7.1 已挂载页面（39）
- `ChannelDealerOpsCenter.vue`
- `DepartmentManage.vue`
- `DictCenter.vue`
- `ExportTaskCenter.vue`
- `ForgotPassword.vue`
- `ImportTaskCenter.vue`
- `IntelligentOrdering.vue`
- `InventoryOpsCenter.vue`
- `Login.vue`
- `ManagementCockpit.vue`
- `MdmCalendar.vue`
- `MdmCategoryTree.vue`
- `MdmChannelTree.vue`
- `MdmFactoryList.vue`
- `MdmGovernanceCenter.vue`
- `MdmOrgTree.vue`
- `MdmResellerList.vue`
- `MdmResellerRelation.vue`
- `MdmRltnOrgReseller.vue`
- `MdmRltnProductSku.vue`
- `MdmRltnWarehouseSku.vue`
- `MdmSkuList.vue`
- `MdmWarehouseList.vue`
- `OperationLogCenter.vue`
- `OrderClosedLoopCenter.vue`
- `PastureOverview.vue`
- `PermissionManage.vue`
- `PlatformArchiveStrategyPage.vue`
- `PlatformAuditLogPage.vue`
- `PlatformConfigCenterPage.vue`
- `PlatformFinePermissionPage.vue`
- `PlatformHealthViewPage.vue`
- `PlatformMonitorPage.vue`
- `PlatformSecurityCenterPage.vue`
- `PostManage.vue`
- `Profile.vue`
- `RoleManage.vue`
- `UserManage.vue`
- `WorkflowCenter.vue`

### 7.2 未挂载页面（2）
- `EnterprisePlatformCenter.vue`（旧聚合页，建议下线）
- `Register.vue`（未挂载，需明确保留策略）

---

整改文档生成日期：2026-04-12
