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

复制 `backend/.env.example` 为 `backend/.env`，填写：

```env
PORT=3101
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=your-secret-key
CORS_ORIGIN=http://localhost:5174
```

说明：

- 这里使用新的 `Secret key`
- 后端通过 `Secret key` 访问 Supabase
- 代码仍兼容旧的 `SUPABASE_SERVICE_ROLE_KEY`，但建议切到新命名

复制 `frontend/.env.example` 为 `frontend/.env`，填写：

```env
VITE_API_BASE_URL=http://localhost:3101
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

说明：

- 前端只用 `Publishable key` 做登录
- 前端不再直接查询数据表

## 初始化数据库

在 Supabase SQL Editor 执行：

```sql
-- 文件位置
supabase/schema.sql
```

## 本地开发

根目录执行：

```powershell
npm install
npm run dev
```

默认地址：

- 前端：`http://localhost:5174`
- 后端：`http://localhost:3101`

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
