# Skill: SCMP Code Task

## 适用场景

当任务发生在这个仓库里，并且涉及以下任一内容时，使用这份技能说明：

- 页面开发或修复
- 路由与导航
- 权限与登录态
- 主数据管理（MDM）
- SKU / SPU / 品类规则
- 导入导出
- 后端 API
- 本地 JSON 持久化
- 数据联通性排查

## 开始前先读什么

每次开始任务时，先读：

1. `AGENTS.md`
2. `docs/context/PROJECT_CONTEXT.md`
3. 任务对应页面、路由、store、后端入口文件

如果任务涉及动态外部资料，再读：

4. `MCP/README.md`

## 在这个仓库里怎么定位任务

先把任务落到一条真实链路上，而不是只看一个文件。

最常见链路是：

1. 页面入口：`src/views/*.vue`
2. 路由定义：`src/router/index.ts`
3. 权限或系统数据：`src/stores/appStore.ts`
4. 请求发起：页面内 `axios` / `fetch`
5. API 处理：`server/index.js` 或对应业务模块
6. 持久化：`server/local-data/db.json`
7. 派生规则：SKU / SPU / 品类 / 关系表 / 统计数据

## 这个仓库的常见模式

### 页面层

- 大部分页面在 `src/views/`
- 业务页面多，体量差异大
- MDM 页面常会复用通用组件
- 页面有不少表格、弹窗、导入导出动作

### 权限层

- 路由 `meta.permissionPath` 决定页面访问资格
- `appStore` 会读取 `/api/me` 和系统基础数据
- 页面是否可见，不只取决于前端菜单，还取决于后端鉴权

### 数据层

- 不是数据库直连，而是本地 JSON 持久化
- 修改规则类代码时，要意识到会影响已有本地数据
- 种子数据、修复脚本、验证脚本常常要一起考虑

### 主数据层

- 奶制品品类有明确边界
- SKU 采用统一七段式标准
- 允许处理历史码，但要通过映射或迁移逻辑收敛

## 推荐工作方式

### 页面问题

- 先看页面本身
- 再看它调用的接口
- 最后看接口是否影响其他共享页面

### 路由/导航问题

- 先看 `src/App.vue`
- 再看 `src/router/index.ts`
- 再看权限守卫和懒加载影响

### MDM / SKU / SPU / 品类问题

- 先看页面
- 再看 `server/index.js`
- 再看规则文件：
  - `server/dairyCategoryCatalog.js`
  - `server/spuCatalog.js`
  - `server/validateDairyCategoryData.js`
  - `src/data/skuSpec.ts`

### 导入导出问题

- 不只检查页面按钮
- 还要检查模板、接口、解析逻辑、导入限制和错误回传

## 不建议的做法

- 只改页面显示，不看后端真实字段
- 只改路由，不看权限守卫
- 只改 SKU 文案，不看编码规则
- 硬编码 API 地址
- 顺手改 unrelated 模块
- 为了“清爽”删除看不懂但其实被业务依赖的字段

## 验证清单

### 纯前端改动

- 运行 `npm run build`
- 必要时点击验证相关页面

### 后端或规则改动

- 运行 `cd server && npm test`
- 检查受影响页面或接口返回

### 联通性改动

- 检查页面 -> API -> 数据 -> 回显 是否完整
- 检查相同数据源是否影响其他页面

## 最后输出时至少说明

- 改了什么
- 为什么这么改
- 验证了什么
- 还有没有剩余风险
