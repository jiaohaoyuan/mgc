# 认养一头牛 · 供应链决策平台 (SCMP)

本项目是一个基于 Vue 3 + TypeScript + Vite 构建的现代化供应链后台管理系统。后端采用 Node.js (Express) 并使用 MySQL 和 Redis 进行数据持久化和缓存。

## 推荐的开发环境配置

- [VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) 插件（请禁用 Vetur）。

## 浏览器开发工具

推荐安装以下浏览器扩展以获得最佳开发体验：
- Chrome/Edge: [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
- Firefox: [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)

## TypeScript 类型支持

对于 `.vue` 单文件组件，默认 TypeScript 无法获取其类型信息。本项目使用 `vue-tsc` 替代 `tsc` 进行类型检查。在编辑器中，安装 Volar 可以让 TypeScript 语言服务正确识别 `.vue` 类型。

## 项目安装与运行

在使用以下命令前，请确保您已根据 `STARTUP_GUIDE.md` 启动了后端的 Node.js 服务。

### 安装依赖

```sh
npm install
```

### 启动前端开发服务器 (支持热更新)

```sh
npm run dev
```

### 生产环境构建与类型检查

```sh
npm run build
```

## 技术文档索引

有关项目架构和前后端交互的详细信息，请参阅以下全中文技术文档：
1. `STARTUP_GUIDE.md` - 项目启动指南（包含前后端启动命令及默认账号）
2. `SCMP_Technical_Whitepaper.md` - 供应链平台综合技术白皮书
3. `Web_Page_Database_Mapping.md` - 前端页面与后端 API 及数据库表的映射关系
4. `Database_Frontend_Field_Mapping.md` - 数据库字段与前端数据模型的详细映射说明
5. `User_Credentials.md` - 生产级模拟测试账号记录

---
*文档更新日期：2026-03-24*
