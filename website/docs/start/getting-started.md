---
sidebar_label: '快速上手'
sidebar_position: 20
slug: /guide/getting-started
---

# 🚀 快速上手

欢迎来到 Mew 的世界！本章节将协助你完成环境配置，并点燃你的第一个 Mew 实例。

为了满足不同场景的需求，我们提供了两条路径：
*   **🛠️ 本地开发环境**：适合贡献代码、调试功能或进行二次开发。
*   **🐳 Docker 一键部署**：适合生产环境部署或快速体验（*Coming Soon*）。

---

## 📋 环境要求

在敲击键盘之前，请检查你的装备库。

### 核心依赖
无论选择哪种方式，你需要：
*   **MongoDB**：一个可用的 MongoDB 实例（本地/容器/云均可）。
    *   Mew 的后端默认连接 `mongodb://localhost:27017/mew`（可通过 `MONGO_URI` 修改）。
    *   如需“手把手装 MongoDB + Garage”，请看参考文档：[基础设施部署](../reference/infrastructure-setup.md)。

### 开发环境依赖
如果你计划运行源码进行开发，请额外安装：
*   **Node.js**：`v18+`（建议使用 LTS）。
*   **pnpm**：建议使用仓库声明的版本（见根目录 `package.json#packageManager`）。
    *   没有安装 pnpm：`npm install -g pnpm`
*   **Git**：用于拉取与协作（可选但强烈建议）。

### 可选依赖（不影响基础功能启动）
*   **S3 兼容对象存储（如 Garage/MinIO）**：用于头像与附件上传。
    *   未配置时，登录/聊天等基础功能仍可用，但上传相关接口会失败（后端启动时也可能打印 S3 CORS 配置失败的日志，不会阻断启动）。

---

## ⚙️ 基础配置

Mew 遵循 **The Twelve-Factor App** 原则，通过环境变量管理配置。

### 1. 设置环境变量
后端服务 需要敏感配置才能启动。

在**项目根目录**下，初始化后端配置文件：

```bash
# 进入后端目录
cd backend

# 复制示例配置文件
cp .env.example .env
```

Windows PowerShell：
```powershell
Set-Location backend
Copy-Item .env.example .env
```

### 2. 修改配置参数
使用你喜欢的编辑器打开 `backend/.env`。以下是关键参数说明：

```ini
# backend/.env

# 🍃 MongoDB 连接字符串
# 格式: mongodb://[username:password@]host[:port]/[database]
# 本地开发通常无需修改，除非你的 Mongo 设置了密码
MONGO_URI=mongodb://localhost:27017/mew

# 🚪 服务端口
PORT=3000

# 🔐 JWT 签名密钥 (非常重要!)
# 用于生成用户 Token。在生产环境中，切勿使用默认值！
# 💡 在终端运行 `openssl rand -base64 32` 可快速生成强密码
JWT_SECRET=replace-this-with-a-super-secret-key

# ⏳ JWT 过期时间 (例如: 1d, 7d)
JWT_EXPIRES_IN=1d

# （可选）S3 兼容对象存储：头像与附件上传需要
# 不配置也能启动，但上传接口将不可用
# S3_ENDPOINT=localhost
# S3_WEB_ENDPOINT=web.garage.localhost
# S3_PORT=3900
# S3_WEB_PORT=3902
# S3_REGION=garage
# S3_BUCKET_NAME=mew-bucket
# S3_ACCESS_KEY_ID=...
# S3_SECRET_ACCESS_KEY=...
# S3_USE_SSL=false
```

> **⚠️ 注意**：Mew 目前不提供 CLI 用户初始化。首次启动后，请直接访问前端页面注册管理员账户。

---

## 💻 本地开发

准备好写代码了吗？按照以下步骤启动全栈开发环境。

### 步骤 1: 获取代码
```bash
git clone https://github.com/your-username/mew.git
cd mew
```

### 步骤 2: 安装依赖
得益于 pnpm 的工作区特性，一条命令即可安装前端、后端及共享库的所有依赖。

```bash
pnpm install
```

### 步骤 3: 启动服务
确保你的 **MongoDB** 已经在后台运行，然后在根目录执行：

```bash
pnpm dev
```

此命令会利用 `concurrently` 并行启动：
*   🟢 **Backend**: 运行在 `http://localhost:3000`
*   🔵 **Frontend**: 运行在 `http://localhost:5173` (Vite 默认端口)

### 步骤 4: 验证与调试
*   **访问 UI**: 浏览器打开 [http://localhost:5173](http://localhost:5173) 即可看到登录界面。
*   **查看日志**: 所有服务的日志（API 请求、报错信息）都会汇聚在你当前的终端窗口中。

> 🛑 **停止服务**: 在终端按 `Ctrl + C` 即可中止所有进程。

---

## 🐳 Docker 部署

> **🚧 施工中 (Work in Progress)**
>
> 我们正在打磨 Docker Compose 的一键部署脚本，旨在为您提供“拎包入住”般的体验。
> 敬请关注后续更新！

---

## 🤖 Bot SDK

> **🚧 施工中 (Work in Progress)**
>
> 想要为 Mew 开发插件？强大的 Bot SDK 文档即将上线。
