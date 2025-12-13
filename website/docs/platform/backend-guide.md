---
sidebar_label: '后端开发指南'
sidebar_position: 50
slug: /guide/backend-guide
---

# ⚙️ 后端开发指南

后端位于 `backend/`，基于 **Node.js + Express + Mongoose**，提供：

- **REST API**：资源型 CRUD（认证、服务器、频道、消息、上传等）
- **WebSocket 网关（Socket.IO）**：实时事件推送与少量上行写入（如 `message/create`）

接口细节请参考：

- [`core-api/rest-api`](../core-api/rest-api.md)
- [`core-api/websocket-api`](../core-api/websocket-api.md)

---

## 🚀 启动与调试

从仓库根目录：

- 全栈开发：`pnpm dev`
- 仅后端：`pnpm --filter backend dev`

后端会读取 `backend/.env`（模板见 `backend/.env.example`），最低限度建议配置：

- `MONGO_URI`：MongoDB 连接串
- `JWT_SECRET`：JWT 签名密钥

可选配置：

- `S3_*`：头像与附件上传（Garage/MinIO 等 S3 兼容存储）；后端启动时会尝试配置 Bucket CORS（失败不会阻断启动，见 `backend/src/utils/s3.ts`）。

---

## 🧭 路由入口与模块结构

路由注册入口：`backend/src/app.ts`，主要挂载点：

- `/api/auth`：注册/登录
- `/api/users`：`/@me`、DM 列表、用户搜索
- `/api/servers`：服务器 CRUD，并在 `/:serverId/*` 下继续挂载频道/成员/邀请/搜索
- `/api/channels/:channelId/uploads`：上传
- `/api/invites`：邀请详情与接受邀请
- `/api/webhooks`：公开执行 Webhook

模块组织遵循“Feature-First”，典型文件：

- `*.routes.ts`：路由与中间件编排
- `*.controller.ts`：请求/响应薄层
- `*.service.ts`：业务逻辑（也负责广播 WebSocket 事件）
- `*.model.ts`：Mongoose Schema
- `*.validation.ts`：Zod 校验（通过 `middleware/validate.ts` 统一接入）

---

## 🛡️ 认证与错误处理

- **认证**：`backend/src/middleware/auth.ts` 使用 JWT，将用户信息挂载到 `req.user`。
- **统一错误响应**：`backend/src/utils/errorHandler.ts`，常见格式为 `{ "message": "..." }`。
- **输入校验**：模块内 `*.validation.ts` 通过 Zod 定义，并在路由层显式 `validate(schema)`。

---

## 🔐 权限与层级

权限字符串定义：`backend/src/constants/permissions.ts`。

- 路由侧通过 `authorizeServer(...)` / `authorizeChannel(...)` 做权限门禁（见 `backend/src/middleware/checkPermission.ts`）。
- 角色/成员/频道覆盖的有效权限计算位于 `backend/src/utils/permission.service.ts`。
- 部分“管理类操作”还会做层级校验（见 `backend/src/utils/hierarchy.utils.ts`）。

当权限结构发生变化（角色修改、成员角色修改、频道覆盖修改），会广播 `PERMISSIONS_UPDATE`，以驱动客户端失效缓存并重新拉取。

---

## ⚡️ WebSocket 网关（Socket.IO）

网关入口：`backend/src/server.ts` 与 `backend/src/gateway/*`：

- 连接鉴权：`backend/src/gateway/middleware.ts`
- 房间加入策略：`backend/src/gateway/handlers.ts`（加入 `channelId/serverId/userId` 房间）
- 广播封装：`backend/src/gateway/events.ts`（`socketManager.broadcast(...)` / `broadcastToUser(...)`）

服务层在数据变更后会广播事件（例如消息创建后广播 `MESSAGE_CREATE`），让前端实时更新，而不是轮询。

---

## 📎 文件上传（S3 兼容）

上传路由：`backend/src/api/upload/upload.routes.ts`（挂载于 `/api/channels/:channelId/uploads`）：

- `multer` 接收单文件字段 `file`（见 `backend/src/middleware/upload.ts`）
- 上传到 S3：`backend/src/utils/s3.ts#uploadFile`
- 返回 `attachments` 需要的元数据：`{ filename, contentType, key, size }`

后端在“对外返回消息”时会把 `key` 补全成 `attachments[].url`（见 `backend/src/api/message/message.service.ts`）。
