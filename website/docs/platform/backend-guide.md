---
sidebar_label: '后端开发指南'
sidebar_position: 50
slug: /guide/server-guide
---

# ⚙️ 后端开发指南

后端位于 `server/`，基于 **Node.js + Express + Mongoose**，提供：

- **REST API**：资源型 CRUD（认证、服务器、频道、消息、上传等）
- **WebSocket 网关（Socket.IO）**：实时事件推送与少量上行写入（如 `message/create`）

接口细节请参考：

- [`core-api/rest-api`](../core-api/rest-api.md)
- [`core-api/websocket-api`](../core-api/websocket-api.md)

---

## 🚀 启动与调试

从仓库根目录：

- 全栈开发：`pnpm dev`
- 仅后端：`pnpm --filter server dev`

后端会读取 `server/.env`（模板见 `server/.env.example`），最低限度建议配置：

- `MONGO_URI`：MongoDB 连接串
- `JWT_SECRET`：JWT 签名密钥

可选配置：

- `MEW_CORS_ORIGINS`：API CORS 允许列表（逗号分隔；开发环境默认全开放，生产环境建议显式配置）。
- `MEW_ADMIN_SECRET`：基础设施共享密钥（Bot Service 引导/注册、`/infra` Socket 命名空间鉴权）。
- `MEW_INFRA_ALLOWED_IPS`：基础设施接口的 IP 白名单（逗号分隔；为空则默认仅允许私网 IP + 127.0.0.1）。
- `S3_*`：头像与附件上传（Garage/MinIO 等 S3 兼容存储）；后端启动时会尝试配置 Bucket CORS（失败不会阻断启动，见 `server/src/utils/s3.ts`）。
- `S3_CORS_ORIGINS`：对象存储 CORS 允许列表（用于浏览器直传；默认沿用 `MEW_CORS_ORIGINS`）。
- `S3_PRESIGN_EXPIRES_SECONDS`：预签名上传 URL 的过期时间（秒）。

---

## 🧭 路由入口与模块结构

路由注册入口：`server/src/app.ts`，主要挂载点：

- `/api/health`：健康检查
- `/api/auth`：注册/登录
- `/api/users`：`/@me` 相关接口（个人信息、服务器列表、DM 频道列表）、用户搜索
- `/api/servers`：服务器 CRUD，并在 `/:serverId/*` 下挂载子资源：频道、分类、角色、成员、邀请、搜索等
- `/api/categories`：分类详情操作（如修改、删除）
- `/api/channels`：DM 频道相关操作（如消息、ACK）
- `/api/channels/:channelId/uploads`：上传文件
- `/api/invites`：邀请详情与接受邀请
- `/api/webhooks`：公开执行 Webhook
- `/api/infra`：服务类型在线状态（供前端下拉框/高亮）
- `/api/bots`：基础设施引导接口（仅内网 + `MEW_ADMIN_SECRET`）

模块组织遵循“Feature-First”，典型文件：

- `*.routes.ts`：路由与中间件编排
- `*.controller.ts`：请求/响应薄层
- `*.service.ts`：业务逻辑（也负责广播 WebSocket 事件）
- `*.model.ts`：Mongoose Schema
- `*.validation.ts`：Zod 校验（通过 `middleware/validate.ts` 统一接入）

---

## 🛡️ 认证与错误处理

- **认证**：`server/src/middleware/auth.ts` 使用 JWT，将用户信息挂载到 `req.user`。
- **统一错误响应**：`server/src/utils/errorHandler.ts`，常见格式为 `{ "message": "..." }`。
- **输入校验**：模块内 `*.validation.ts` 通过 Zod 定义，并在路由层显式 `validate(schema)`。

---

## 🔐 权限与层级

权限字符串定义：`server/src/constants/permissions.ts`。

- 路由侧通过 `authorizeServer(...)` / `authorizeChannel(...)` 做权限门禁（见 `server/src/middleware/checkPermission.ts`）。
- 角色/成员/频道覆盖的有效权限计算位于 `server/src/utils/permission.service.ts`。
- 部分“管理类操作”还会做层级校验（见 `server/src/utils/hierarchy.utils.ts`）。

当权限结构发生变化（角色修改、成员角色修改、频道覆盖修改），会广播 `PERMISSIONS_UPDATE`，以驱动客户端失效缓存并重新拉取。

---

## ⚡️ WebSocket 网关（Socket.IO）

网关入口：`server/src/server.ts` 与 `server/src/gateway/*`：

- 连接鉴权：`server/src/gateway/middleware.ts`
- 房间加入策略：`server/src/gateway/handlers.ts`（加入 `channelId/serverId/userId` 房间）
- 广播封装：`server/src/gateway/events.ts`（`socketManager.broadcast(...)` / `broadcastToUser(...)`）

服务层在数据变更后会广播事件（例如消息创建后广播 `MESSAGE_CREATE`），让前端实时更新，而不是轮询。

---

## 🤖 Bot Service 引导（Infrastructure）

为避免用户手动复制动态 Token，Bot 的“托管归属”改为 `serviceType`：

- 前端创建/编辑 Bot 时必须选择 `serviceType`（来源：`GET /api/infra/available-services`）。
- Bot Service 通过内网接口批量拉取配置：`POST /api/bots/bootstrap`（Header: `X-Mew-Admin-Secret`，Body: `{ serviceType }`）。
- 后端在 Bot 创建/更新后会向 `/infra` 命名空间的对应房间广播 `SYSTEM_BOT_CONFIG_UPDATE`（payload: `{ serviceType, botId }`）。

补充：

- `plugins/sdk` 目前采用 **轮询同步**（`MEW_CONFIG_SYNC_INTERVAL_SECONDS`）+ `POST /api/infra/service-types/register` 上报在线；并未默认接入 `/infra` Socket.IO 推送。
- 如需“推送触发热更新”，可让 Bot Service 连接 `/infra` 并在收到 `SYSTEM_BOT_CONFIG_UPDATE` 后调用 `GET /api/bots/:botId/bootstrap` 拉取单个 Bot 配置。

## 📎 文件上传（S3 兼容）

上传路由：`server/src/api/upload/upload.routes.ts`（挂载于 `/api/channels/:channelId/uploads`）：

- `POST /presign`：返回用于浏览器直传的预签名 PUT URL（推荐前端优先使用）。
- `multer` 中间件（`server/src/middleware/upload.ts`）接收单文件字段 `file`。
- **流式上传**：通过自定义的 `S3StreamingStorage` 存储引擎（`server/src/middleware/s3Storage.ts`），文件流被直接传输到 S3，避免了在服务器上进行内存或磁盘缓冲，效率更高。
- 上传逻辑封装在 `server/src/utils/s3.ts#uploadStream`。
- 返回 `attachments` 需要的元数据：`{ filename, contentType, key, size }`。

后端在“对外返回消息”时会把 `key` 补全成 `attachments[].url`（见 `server/src/api/message/message.service.ts`）。
