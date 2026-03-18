# JDL 设备管理

现在的主应用已经改成前后端分离：

- 前端：`React + Vite`
- 后端：`Node.js + Express`
- 数据库：`Supabase`
- 认证：`Supabase Auth`

浏览器不再直接访问 Supabase 数据表，所有业务读写都通过后端 API 完成。登录由前端通过 Supabase Auth 完成，后端负责校验 JWT。

## 目录

- `frontend/`: React 前端
- `backend/`: Express API
- `supabase/schema.sql`: 数据表、索引、视图
- `Inventory.html`
- `maintenance.html`
- `index.html`
- `app.js`

上面这 4 个根目录页面/脚本现在只是你原来的参考原型，不是运行入口。

## 已实现

- 资产台账 CRUD
- 租赁到期提醒
- 加水周期提醒
- 保养周期提醒
- 维修记录管理
- Excel 导入
- Excel 导出
- 首页提醒与 KPI 聚合

## 环境变量

本地开发时，复制根目录 `.env.example` 为根目录 `.env`，填写：

```env
PORT=3101
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
CORS_ORIGIN=http://localhost:5174
VITE_API_BASE_URL=http://localhost:3101
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

说明：

- 本地开发时，前后端默认从根目录 `.env` 读取这些配置
- 部署到服务器时，请确保部署脚本/服务配置正确加载环境变量：可以统一使用根目录 `.env`，或分别在 `${APP_DIR}/backend/.env` 和 `${APP_DIR}/frontend/.env` 中配置等价的变量，否则后端可能在启动时读不到配置而失败
- 前端只用 `Publishable key` 做登录
- 后端通过 `Secret key` 访问 Supabase
- 代码仍兼容旧的 `SUPABASE_SERVICE_ROLE_KEY`，但建议切到新命名
- 前端不再直接查询数据表
## 初始化数据库

在 Supabase SQL Editor 执行：

```sql
-- 文件位置
supabase/schema.sql
```

## 本地开发

根目录执行（Windows 用户请在 Git Bash 或 WSL 等支持 bash 的终端中运行）：

```bash
npm install
npm run dev
```

如需对外暴露前端开发服务器：

```bash
npm run dev -- --host
```

或使用脚本：

```bash
chmod +x scripts/npm-install.sh scripts/dev-host.sh scripts/run-dev.sh
./scripts/npm-install.sh
./scripts/dev-host.sh
```

默认地址：

- 前端：`http://localhost:5174`
- 后端：`http://localhost:3101`

## 一键安装（install）

在项目根目录执行：

```bash
chmod +x scripts/install.sh scripts/deploy-host.sh scripts/npm-install.sh scripts/dev-host.sh scripts/run-dev.sh
./scripts/install.sh
```

该脚本会执行：

- 自动检测并安装 Node.js 20（仅 Debian/Ubuntu + root 场景）
- `npm ci` 安装依赖
- `npm run build` 构建前端
- `node --check` 与前端测试校验

## 主机部署（host）

> 适用于 Debian/Ubuntu 服务器，需 root 权限。

```bash
sudo DOMAIN=your.domain.com APP_DIR=/opt/jdl-device-management BACKEND_PORT=3101 ./scripts/deploy-host.sh
```

部署脚本会自动完成：

- 安装 `nginx`、`rsync`
- 将项目同步到 `APP_DIR`
- 执行 `npm ci` 和 `npm run build`
- 生成并启动 `systemd` 服务：`jdl-device-management.service`
- 写入 Nginx 配置并代理 `/api` 到后端

可选参数：

- `DOMAIN`：Nginx `server_name`，默认 `_`
- `APP_DIR`：部署目录，默认 `/opt/jdl-device-management`
- `BACKEND_PORT`：后端端口，默认 `3101`
- `SERVICE_USER`：服务运行用户，默认 `www-data`
- `FORCE_COPY=1`：覆盖非空部署目录

## 构建

```powershell
npm run build
```

## 已验证

- `npm run build -w frontend`
- `node --check backend/src/server.js`
- 受保护 API 已统一挂载到 `requireAuth`

## 当前 API

- `GET /api/dashboard`
- `GET /api/assets`
- `POST /api/assets`
- `PUT /api/assets/:id`
- `DELETE /api/assets/:id`
- `POST /api/assets/:id/mark-watered`
- `POST /api/assets/:id/mark-maintained`
- `POST /api/assets/import`
- `GET /api/maintenance-records`
- `POST /api/maintenance-records`
- `DELETE /api/maintenance-records/:id`

## 下一步建议

- 把“扫码后已加水”做成移动端扫码流程
- 增加图片上传到 Supabase Storage
- 增加用户角色和仓库级权限控制
