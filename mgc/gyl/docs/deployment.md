# 部署与运维文档

## 1. 环境要求

| 依赖 | 最低版本 | 说明 |
|---|---|---|
| Node.js | ^20.19.0 或 >=22.12.0 | 见 package.json engines |
| npm | 兼容 Node.js 版本 | `setup-env.cjs` 会自动检查 |
| MySQL | 5.7+ | 可选，默认使用 JSON 文件存储 |
| Redis | 6.0+ | 可选，用于缓存和会话 |

## 2. 快速开始

### 2.1 一键初始化

```bash
# 在项目根目录执行
node setup-env.cjs
```

该脚本会自动完成：
1. 检查项目结构完整性
2. 校验 Node.js 版本
3. 检查 npm 可用性
4. 创建前端 `.env.local` 配置文件
5. 创建后端 `server/.env` 配置文件
6. 创建 `server/local-data/` 数据目录
7. 安装前端依赖 (`npm install`)
8. 安装后端依赖 (`cd server && npm install`)

### 2.2 手动初始化

```bash
# 前端
cp .env.local.example .env.local   # 或手动创建
npm install

# 后端
cd server
cp .env.example .env               # 或手动创建
npm install
mkdir local-data
```

### 2.3 启动开发环境

```bash
# 终端 1：启动后端
cd server
npm start
# → Express 运行在 http://localhost:3000

# 终端 2：启动前端
npm run dev
# → Vite 运行在 http://localhost:5173
```

### 2.4 默认管理员账号

- 用户名：`jiaohaoyuan`
- 密码：在登录页面输入（由后端验证）
- 超级管理员角色由 `SUPER_ADMIN_LOGIN_IDS` 环境变量控制

## 3. 环境变量

### 3.1 前端环境变量 (`.env.local`)

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:3000/api` | 后端 API 地址 |

所有 `VITE_` 前缀的变量会被注入到前端代码 `import.meta.env` 中。

### 3.2 后端环境变量 (`server/.env`)

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 后端服务端口 |
| `JWT_SECRET` | `local-file-jwt-secret` | JWT 签名密钥（生产必须更换） |
| `JWT_EXPIRES_IN` | `12h` | Token 过期时间 |
| `SUPER_ADMIN_LOGIN_IDS` | `jiaohaoyuan` | 超级管理员用户名（逗号分隔） |
| `SUPER_ADMIN_ROLE_IDS` | `1` | 超级管理员角色 ID |
| `SUPER_ADMIN_ROLE_NAMES` | `超级管理员` | 超级管理员角色名称 |

### 3.3 数据库连接（可选）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | MySQL 用户名 |
| `DB_PASSWORD` | `123456` | MySQL 密码（生产必须更改） |
| `DB_NAME` | `cdop_sys` | 数据库名 |

> 不配置数据库时，后端使用 `server/local-data/` 目录下的 JSON 文件存储。

### 3.4 Redis 连接（可选）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接地址 |

### 3.5 短信服务（可选）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SMS_APP_CODE` | (空) | 阿里云短信 AppCode，留空则本地开发模式 |

## 4. 构建与部署

### 4.1 生产构建

```bash
# 类型检查 + 构建
npm run build

# 仅构建（跳过类型检查）
npm run build-only

# 仅类型检查
npm run type-check
```

构建产物位于 `dist/` 目录，包含：
- `dist/index.html`
- `dist/assets/` — JS、CSS、图片等静态资源

### 4.2 生产部署架构

推荐的部署拓扑：

```
                    ┌─────────────┐
                    │   Nginx     │  (反向代理 + 静态文件)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         /api/*        /* (静态)      /ws (可选)
              │            │            │
         ┌────▼────┐  ┌───▼────┐  ┌───▼────┐
         │Express  │  │ dist/  │  │  WebSocket
         │ :3000   │  │ 目录   │  │ :3001  │
         └────┬────┘  └────────┘  └────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼──┐ ┌──▼──┐  ┌───▼───┐
│MySQL │ │Redis│  │localDb│
└──────┘ └─────┘  └───────┘
```

### 4.3 Nginx 配置示例

```nginx
server {
    listen 80;
    server_name scmp.example.com;

    # 前端静态文件
    root /opt/scmp/dist;
    index index.html;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Vue History 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

### 4.4 进程守护

使用 PM2 管理后端进程：

```bash
# 安装 PM2
npm install -g pm2

# 启动
cd server
pm2 start index.js --name scmp-server

# 查看状态
pm2 status

# 开机自启
pm2 startup
pm2 save
```

## 5. 数据存储

### 5.1 默认存储：JSON 文件

后端默认使用 `server/local-data/` 目录下的 JSON 文件存储数据：

```
server/local-data/
├── departments.json      # 部门数据
├── accounts.json          # 用户数据
├── roles.json             # 角色数据
├── jobtitles.json         # 岗位数据
├── permissions.json       # 权限数据
├── orders.json            # 订购数据
├── skus.json              # SKU 数据
└── ...
```

**备份**：直接复制 `server/local-data/` 目录即可。

### 5.2 切换到 MySQL

配置好 `.env` 中的数据库连接参数后，后端自动切换到 MySQL 模式。数据表由后端在启动时检查。

数据库名：`cdop_sys`

## 6. 安全配置清单

### 6.1 生产环境必改项

- [ ] 修改 `JWT_SECRET` 为高强度随机字符串（至少 32 位）
- [ ] 修改 `DB_PASSWORD`（如使用 MySQL）
- [ ] 配置 HTTPS（通过 Nginx 终止 SSL）
- [ ] 限制 CORS 允许的域名（后端 `cors` 中间件）
- [ ] 配置 `helmet` 安全头策略
- [ ] 设置 `express-rate-limit` 的速率限制参数
- [ ] 修改默认超级管理员密码
- [ ] 移除 `SUPER_ADMIN_LOGIN_IDS` 中的开发用账号

### 6.2 后端安全中间件

```javascript
// 当前 server/index.js 已配置：
app.use(helmet())                     // 安全 HTTP 头
app.use(cors({ origin }))              // CORS 控制
app.use(rateLimit({ windowMs, max }))  // 速率限制
```

## 7. 运维命令参考

```bash
# 环境检查（不安装依赖）
node setup-env.cjs --check

# 跳过依赖安装（依赖已安装时加速）
node setup-env.cjs --skip-install

# 使用 npm install 而非 npm ci
node setup-env.cjs --npm-install

# 类型检查
npm run type-check

# 构建
npm run build

# 启动后端
cd server && npm start

# 启动前端开发服务器
npm run dev

# 预览生产构建
npm run preview
```

## 8. Git Worktree 说明

项目中存在 `.worktrees/` 目录，使用 `git worktree` 管理多分支并行开发。当前已知 worktree：

| worktree | 对应分支 | 说明 |
|---|---|---|
| `channel-demand-plan` | channel-demand-plan | 渠道需求计划功能分支 |

使用方式：
```bash
git worktree add .worktrees/<branch-name> <branch-name>
git worktree list
git worktree remove .worktrees/<branch-name>
```

## 9. 故障排查

| 问题 | 检查项 |
|---|---|
| 前端无法启动 | Node.js 版本 ≥20.19；端口 5173 未被占用 |
| 后端无法启动 | 端口 3000 未被占用；`.env` 文件是否存在 |
| 登录失败 | 后端是否运行；`VITE_API_BASE` 是否正确 |
| 页面加载慢 | 是否预热路由；`keep-alive` 缓存是否生效（max=20） |
| 权限异常 | `GET /api/me` 是否返回正确数据；localStorage 是否被清除 |
| 数据丢失 | `server/local-data/` 目录 JSON 文件是否完整 |
