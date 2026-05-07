# API 接口文档

## 概述

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: JWT Bearer Token（请求头 `Authorization: Bearer <token>`）
- **响应格式**: 统一 JSON
  ```json
  {
    "code": 200,
    "msg": "操作成功",
    "data": { ... }
  }
  ```
- **错误处理**: 401 表示 token 无效或过期；非 200 code 表示业务错误

---

## 一、认证模块

### 1.1 登录

```
POST /login
```

**请求体**：
```json
{
  "username": "admin",
  "password": "******"
}
```

**响应 data**：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "id": 1,
  "username": "admin",
  "nickname": "系统管理员",
  "role": "超级管理员",
  "roleIds": [1],
  "roleNames": ["超级管理员"],
  "permissionIds": [1, 11, 111, ...],
  "permissionPaths": ["/department", "/user", ...],
  "isSuperAdmin": true
}
```

### 1.2 获取当前用户权限上下文

```
GET /api/me
```

**请求头**：`Authorization: Bearer <token>`

**响应 data**：
```json
{
  "id": 1,
  "username": "admin",
  "roleIds": [1],
  "roleNames": ["超级管理员"],
  "permissionIds": [1, 11, 111, ...],
  "permissionPaths": ["/department", "/user", ...],
  "isSuperAdmin": true
}
```

---

## 二、组织与权限

### 2.1 部门管理

```
GET    /api/departments          # 获取部门列表（树形结构）
POST   /api/departments          # 新增部门
PUT    /api/departments/:id      # 更新部门
DELETE /api/departments/:id      # 删除部门
```

**部门数据模型** (DeptNode)：
```json
{
  "id": 100,
  "label": "认养一头牛集团",
  "type": "center",           // center | department | team
  "status": 1,                // 1=启用 0=禁用
  "sort": 0,
  "leader": "孙仕军",
  "children": [...]
}
```

### 2.2 用户管理

```
GET    /api/accounts           # 获取用户列表
POST   /api/accounts           # 新增用户
PUT    /api/accounts/:id       # 更新用户
DELETE /api/accounts/:id       # 删除用户
```

**用户数据模型** (UserItem)：
```json
{
  "id": 1,
  "username": "admin",
  "nickname": "系统管理员",
  "phone": "13800000001",
  "email": "admin@nainiu.com",
  "deptId": 1222,
  "deptName": "系统管理部 / 权限审计员",
  "postIds": [14],
  "roleIds": [1],
  "status": 1,
  "createTime": "2025-01-15"
}
```

### 2.3 角色管理

```
GET    /api/roles              # 获取角色列表
POST   /api/roles              # 新增角色
PUT    /api/roles/:id          # 更新角色
DELETE /api/roles/:id          # 删除角色
```

**角色数据模型** (RoleItem)：
```json
{
  "id": 1,
  "name": "超级管理员",
  "code": "ROLE_ADMIN",
  "sort": 1,
  "status": 1,
  "permissionIds": [1, 11, 111, ...],
  "postIds": [13, 14],
  "dataScopeType": "ALL",
  "dataScopeConfig": {},
  "remark": "拥有全部权限",
  "createTime": "2025-01-15"
}
```

### 2.4 岗位管理

```
GET    /api/jobtitles          # 获取岗位列表
POST   /api/jobtitles          # 新增岗位
PUT    /api/jobtitles/:id      # 更新岗位
DELETE /api/jobtitles/:id      # 删除岗位
```

**岗位数据模型** (PostItem)：
```json
{
  "id": 1,
  "name": "奶牛育种专员",
  "code": "POST_BREED",
  "deptId": 1111,
  "deptName": "上游牧业部 / 奶牛育种岗",
  "status": 1,
  "sort": 1,
  "remark": "负责育种体系管理"
}
```

### 2.5 权限管理

```
GET    /api/permissions        # 获取权限树
POST   /api/permissions        # 新增权限节点
PUT    /api/permissions/:id    # 更新权限节点
DELETE /api/permissions/:id    # 删除权限节点
```

**权限数据模型** (PermNode)：
```json
{
  "id": 1,
  "label": "系统管理",
  "code": "sys:admin",
  "children": [
    {
      "id": 11,
      "label": "用户管理",
      "children": [
        { "id": 111, "label": "用户查看", "code": "sys:user:list" },
        { "id": 112, "label": "用户新增/编辑", "code": "sys:user:edit" }
      ]
    }
  ]
}
```

---

## 三、平台管理

### 3.1 辅助动态码

```
GET  /api/admin/helper-code         # 获取当前辅助动态码
POST /api/admin/refresh-helper-code # 刷新生成新辅助动态码
```

**响应 data**：
```json
{
  "helperCode": "A8X2K9"
}
```

辅助动态码用于超级管理员协助用户重置密码。

### 3.2 通知

```
GET /api/notifications?status=UNREAD    # 获取未读通知列表
GET /api/notifications                  # 获取全部通知
PUT /api/notifications/:id              # 标记通知状态
```

### 3.3 操作日志

```
GET /api/operation-logs    # 获取操作日志列表（分页）
```

### 3.4 字典中心

```
GET    /api/dict-types            # 获取字典类型列表
GET    /api/dict-types/:code      # 获取某字典类型下的字典项
POST   /api/dict-types            # 新增字典类型
POST   /api/dict-items            # 新增字典项
```

---

## 四、业务运营模块

### 4.1 智能订购

```
GET    /api/orders               # 获取订购列表
POST   /api/orders               # 创建订购单
PUT    /api/orders/:id           # 更新订购单
POST   /api/orders/:id/submit    # 提交订购单
```

### 4.2 订单闭环

```
GET    /api/order-closed-loop    # 获取订单闭环列表
GET    /api/order-closed-loop/:id # 获取订单闭环详情
```

### 4.3 库存与仓配

```
GET    /api/inventory            # 获取库存列表
GET    /api/warehouse-ops        # 获取仓配运营数据
```

### 4.4 渠道与经销商

```
GET    /api/channel-dealer       # 获取渠道经销商数据
```

### 4.5 渠道需求计划

```
GET    /api/demand/channel-plan  # 获取渠道需求计划
POST   /api/demand/channel-plan  # 创建需求计划
```

### 4.6 牧场与奶源

```
GET    /api/pasture              # 获取牧场奶源数据
```

### 4.7 流程待办

```
GET    /api/workflow/tasks       # 获取待办任务列表
POST   /api/workflow/tasks/:id/complete  # 完成待办任务
```

### 4.8 管理驾驶舱

```
GET    /api/cockpit/overview     # 获取驾驶舱概览数据
GET    /api/cockpit/metrics      # 获取经营指标
```

---

## 五、MDM 主数据模块

### 5.1 SKU 管理

```
GET    /api/mdm/skus             # 获取 SKU 列表
POST   /api/mdm/skus             # 新增 SKU
PUT    /api/mdm/skus/:id         # 更新 SKU
DELETE /api/mdm/skus/:id         # 删除 SKU
GET    /api/mdm/skus/:id/mapping # 获取 SKU 编码映射
POST   /api/mdm/skus/import      # 批量导入 SKU
GET    /api/mdm/skus/export      # 导出 SKU
```

### 5.2 SPU 管理

```
GET    /api/mdm/spus             # 获取 SPU 列表
POST   /api/mdm/spus             # 新增 SPU
PUT    /api/mdm/spus/:id         # 更新 SPU
```

### 5.3 品类管理

```
GET    /api/mdm/categories       # 获取品类树
POST   /api/mdm/categories       # 新增品类
PUT    /api/mdm/categories/:id   # 更新品类
```

### 5.4 仓库管理

```
GET    /api/mdm/warehouses       # 获取仓库列表
POST   /api/mdm/warehouses       # 新增仓库
PUT    /api/mdm/warehouses/:id   # 更新仓库
```

### 5.5 工厂管理

```
GET    /api/mdm/factories        # 获取工厂列表
POST   /api/mdm/factories        # 新增工厂
PUT    /api/mdm/factories/:id    # 更新工厂
```

### 5.6 渠道管理

```
GET    /api/mdm/channels         # 获取渠道树
POST   /api/mdm/channels         # 新增渠道
PUT    /api/mdm/channels/:id     # 更新渠道
```

### 5.7 经销商管理

```
GET    /api/mdm/resellers        # 获取经销商列表
POST   /api/mdm/resellers        # 新增经销商
PUT    /api/mdm/resellers/:id    # 更新经销商
```

### 5.8 组织机构

```
GET    /api/mdm/organizations    # 获取组织树
POST   /api/mdm/organizations    # 新增组织
PUT    /api/mdm/organizations/:id # 更新组织
```

### 5.9 业务日历

```
GET    /api/mdm/calendars        # 获取业务日历
POST   /api/mdm/calendars        # 设置业务日历
```

### 5.10 关系配置

```
# 仓库-SKU 关系
GET    /api/mdm/relations/warehouse-sku
POST   /api/mdm/relations/warehouse-sku
DELETE /api/mdm/relations/warehouse-sku/:id

# 组织-经销商关系
GET    /api/mdm/relations/org-reseller
POST   /api/mdm/relations/org-reseller
DELETE /api/mdm/relations/org-reseller/:id

# 产品-SKU 转换关系
GET    /api/mdm/relations/product-sku
POST   /api/mdm/relations/product-sku
DELETE /api/mdm/relations/product-sku/:id

# SKU-经销关系
GET    /api/mdm/relations/sku-reseller
POST   /api/mdm/relations/sku-reseller
DELETE /api/mdm/relations/sku-reseller/:id
```

### 5.11 主数据治理

```
GET    /api/mdm/governance/rules       # 获取治理规则列表
POST   /api/mdm/governance/check       # 执行专项质量检查
GET    /api/mdm/governance/check/:id   # 获取检查结果
```

---

## 六、通用约定

### 6.1 HTTP 方法语义

| 方法 | 语义 |
|---|---|
| GET | 查询（列表/详情） |
| POST | 新增 / 触发操作 |
| PUT | 全量更新 |
| DELETE | 删除 |

### 6.2 分页参数

```
GET /api/xxx?page=1&pageSize=20
```

响应：
```json
{
  "code": 200,
  "data": {
    "list": [...],
    "total": 150,
    "page": 1,
    "pageSize": 20
  }
}
```

### 6.3 错误码

| code | 含义 |
|---|---|
| 200 | 成功 |
| 400 | 参数错误 |
| 401 | 未认证/token 过期 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

### 6.4 后端文件对应关系

根据 `skuSpec.ts` 中的引用：

| 后端文件 | 职责 |
|---|---|
| `server/index.js` | 路由注册、中间件配置 |
| `server/localDb.js` | JSON 文件数据库读写 |
| `server/skuRules.js` | SKU 编码规则校验 |
| `server/mdmGovernance.js` | 主数据质量治理 |
