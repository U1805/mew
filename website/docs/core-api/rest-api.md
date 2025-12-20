---
sidebar_label: 'REST API'
sidebar_position: 20
---

# 📡 REST API 参考

默认基址：

- HTTP：`http://localhost:3000/api`

定位：

- REST API 负责“资源状态”的同步读写（CRUD），例如用户、服务器、频道、消息、上传等。
- 实时事件推送请使用 WebSocket（见 [`core-api/websocket-api`](./websocket-api.md)）。

认证：

- 除 `POST /auth/*` 与 `POST /webhooks/:webhookId/:token` 外，接口普遍需要 JWT。
- 请求头：`Authorization: Bearer <token>`

Token 类型：

- **User Token**：通过 `POST /auth/login` 获取，具有可配置过期时间（`JWT_EXPIRES_IN`）。
- **Webhook Token**：嵌入在 Webhook URL 中（`/webhooks/:webhookId/:token`），仅用于公开执行 Webhook 发消息。

错误响应（常见）：

```json
{ "message": "..." }
```

部分输入问题（如 Zod 校验失败、Mongo CastError/ValidationError）会返回 `400`，并可能包含 `error` 字段（以实现为准，见 `server/src/utils/errorHandler.ts`）。

常见状态码：

| 状态码 | 含义 | 常见原因 |
|---|---|---|
| `400` | Bad Request | 参数缺失/格式错误、校验失败 |
| `401` | Unauthorized | 未提供 Token 或 Token 无效/过期 |
| `403` | Forbidden | 权限不足/成员关系不满足/层级规则不满足 |
| `404` | Not Found | 资源不存在 |
| `409` | Conflict | 唯一性冲突等 |
| `500` | Internal Server Error | 服务器内部错误 |

更具体的数据结构见：[`core-api/data-structures`](./data-structures.md)。

---

## Auth（/auth）

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ email, username, password }` | `{ user, token }` |
| POST | `/auth/login` | `{ email, password }` | `{ user, token }` |

---

## Users（/users）

| Method | Path | 描述 |
|---|---|---|
| GET | `/users/@me` | 获取当前用户 |
| PATCH | `/users/@me` | 更新当前用户（目前支持头像上传） |
| GET | `/users/@me/servers` | 我加入的服务器列表 |
| GET | `/users/@me/channels` | 我所有 DM 频道列表 |
| POST | `/users/@me/channels` | 创建/获取 DM：`{ recipientId }` |
| GET | `/users/search?q=...` | 按用户名模糊搜索（排除自己） |
| GET | `/users/:userId` | 获取用户公开信息 |

### PATCH /users/@me（头像）

- `multipart/form-data`
- 字段名：`avatar`（单文件）

---

## Servers（/servers）

| Method | Path | 描述 |
|---|---|---|
| POST | `/servers` | 创建服务器：`{ name, avatarUrl? }` |
| GET | `/servers/:serverId` | 获取服务器详情（需成员身份） |
| PATCH | `/servers/:serverId` | 更新服务器（需 `MANAGE_SERVER`） |
| DELETE | `/servers/:serverId` | 删除服务器（需 `ADMINISTRATOR`） |
| POST | `/servers/:serverId/icon` | 上传并更新服务器图标（需 `MANAGE_SERVER`） |

### POST /servers/:serverId/icon（服务器图标）

- `multipart/form-data`
- 字段名：`icon`（单文件）

---

## Roles（/servers/:serverId/roles）

| Method | Path | 描述 |
|---|---|---|
| GET | `/servers/:serverId/roles` | 获取角色列表（按 `position`） |
| POST | `/servers/:serverId/roles` | 创建角色（路由要求 `MANAGE_ROLES`；实现上仅允许 owner 创建） |
| PATCH | `/servers/:serverId/roles/positions` | 批量更新角色顺序 |
| PATCH | `/servers/:serverId/roles/:roleId` | 更新角色（名称/颜色/权限等） |
| DELETE | `/servers/:serverId/roles/:roleId` | 删除角色（不能删除 `@everyone`） |

---

## Members（/servers/:serverId/members）

| Method | Path | 描述 |
|---|---|---|
| GET | `/servers/:serverId/members` | 成员列表（会合并 Webhook 虚拟成员） |
| DELETE | `/servers/:serverId/members/@me` | 退出服务器（owner 需先转移所有权） |
| DELETE | `/servers/:serverId/members/:userId` | 踢出成员（路由要求 `KICK_MEMBERS`，并有层级校验） |
| PUT | `/servers/:serverId/members/:userId/roles` | 替换成员角色（路由要求 `MANAGE_ROLES`，并有层级校验） |

---

## Invites（/servers/:serverId/invites 与 /invites）

| Method | Path | 描述 |
|---|---|---|
| POST | `/servers/:serverId/invites` | 创建邀请（需 `CREATE_INVITE`） |
| GET | `/invites/:inviteCode` | 获取邀请预览（需认证） |
| POST | `/invites/:inviteCode` | 接受邀请并加入服务器（需认证） |

---

## Categories（/servers/:serverId/categories 与 /categories）

| Method | Path | 描述 |
|---|---|---|
| GET | `/servers/:serverId/categories` | 获取服务器分组列表 |
| POST | `/servers/:serverId/categories` | 创建分组（需 `MANAGE_CHANNEL`） |
| PATCH | `/categories/:categoryId` | 更新分组（需 `MANAGE_CHANNEL`） |
| DELETE | `/categories/:categoryId` | 删除分组（需 `MANAGE_CHANNEL`） |

---

## Channels（/servers/:serverId/channels 与 /channels）

### 服务器频道

| Method | Path | 描述 |
|---|---|---|
| GET | `/servers/:serverId/channels` | 获取服务器可见频道（附带 `permissions/lastMessage/lastReadMessageId`） |
| POST | `/servers/:serverId/channels` | 创建频道（需 `MANAGE_CHANNEL`） |
| PATCH | `/servers/:serverId/channels/:channelId` | 更新频道（`name`, `categoryId`, `topic`）（需 `MANAGE_CHANNEL`） |
| DELETE | `/servers/:serverId/channels/:channelId` | 删除频道（需 `MANAGE_CHANNEL`） |
| GET | `/servers/:serverId/channels/:channelId/permissions` | 获取频道权限覆盖（需 `MANAGE_CHANNEL`） |
| PUT | `/servers/:serverId/channels/:channelId/permissions` | 替换权限覆盖（需 `MANAGE_CHANNEL`，含自我锁定保护） |
| POST | `/servers/:serverId/channels/:channelId/ack` | 标记已读：`{ lastMessageId }` |

### DM 频道

| Method | Path | 描述 |
|---|---|---|
| POST | `/channels/:channelId/ack` | 标记已读：`{ lastMessageId }` |

---

## Messages（/messages）

消息路由会同时挂载在：

- 服务器频道：`/servers/:serverId/channels/:channelId/messages`
- DM 频道：`/channels/:channelId/messages`

### 获取消息

- `GET /.../messages?limit=50&before=<messageId?>`
  - `limit`：1–100（默认 50）
  - `before`：用于向更旧消息翻页（以 messageId 作为游标）

### 发送消息

- `POST /.../messages`
- Body：`{ content?, attachments? }`
  - `content` 与 `attachments` 至少提供其一（见 `server/src/api/message/message.validation.ts`）

### 编辑 / 撤回（删除）

- `PATCH /.../messages/:messageId`：`{ content }`
- `DELETE /.../messages/:messageId`
  - 当前实现为“撤回”：会清空内容与附件并写入 `retractedAt`，并通过 `MESSAGE_UPDATE` 通知客户端（见 `server/src/api/message/message.service.ts`）。

---

## Reactions（消息表情回应）

| Method | Path | 描述 |
|---|---|---|
| PUT | `/.../messages/:messageId/reactions/:emoji/@me` | 添加/切换反应 |
| DELETE | `/.../messages/:messageId/reactions/:emoji/@me` | 移除自己的反应 |

说明：

- 当前实现未在路由层显式校验 `ADD_REACTIONS`，仅要求认证（以实现为准）。

---

## Uploads（/channels/:channelId/uploads）

| Method | Path | 描述 |
|---|---|---|
| POST | `/channels/:channelId/uploads` | 上传附件（需 `ATTACH_FILES`） |

上传规则：

- `multipart/form-data`
- 字段名：`file`（单文件）
- 响应：`{ filename, contentType, key, size }`（`key` 用于作为消息 `attachments` 的输入）

---

## Webhooks（频道内管理 + 公开执行）

管理路由（挂载在服务器频道下）：

- `GET /servers/:serverId/channels/:channelId/webhooks`
- `POST /servers/:serverId/channels/:channelId/webhooks`
- `PATCH /servers/:serverId/channels/:channelId/webhooks/:webhookId`
- `DELETE /servers/:serverId/channels/:channelId/webhooks/:webhookId`

公开执行（无需 JWT）：

- `POST /webhooks/:webhookId/:token`
  - Body：`{ content, username?, avatar_url? }`
  - 返回：创建后的 `Message`

---

## Search（/servers/:serverId/search）

- `GET /servers/:serverId/search?q=...&channelId?=...&limit?=...&page?=...`
  - 具体响应结构取决于搜索实现（见 `server/src/api/search/search.service.ts`）。
