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

- 除 `/auth/*` 与 `/webhooks/:webhookId/:token*` 外，接口普遍需要 JWT。
- 请求头：`Authorization: Bearer <token>`

Token 类型：

- **User Token**：通过 `POST /auth/login` 获取，具有可配置过期时间（`JWT_EXPIRES_IN`）。
- **Webhook Token**：嵌入在 Webhook URL 中（`/webhooks/:webhookId/:token`），仅用于公开执行 Webhook 发消息。
- **Infra Admin Secret**：用于基础设施接口鉴权（Header：`X-Mew-Admin-Secret`），对应后端环境变量 `MEW_ADMIN_SECRET`。

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
| GET | `/auth/config` | - | `{ allowUserRegistration }` |
| POST | `/auth/register` | `{ email, username, password }` | `{ message, user, token }` |
| POST | `/auth/login` | `{ email, password }` | `{ message, user, token }` |
| POST | `/auth/bot` | `{ accessToken }` | `{ message, user, token }` |

说明：

- 当 `MEW_ALLOW_USER_REGISTRATION=false` 时，`POST /auth/register` 会返回 `403`。
- `POST /auth/bot` 用于 Bot Service：用 Bot 的 `accessToken` 换取可连接网关/调用 API 的 JWT。

---

## Users（/users）

| Method | Path | 描述 |
|---|---|---|
| GET | `/users/@me` | 获取当前用户 |
| PATCH | `/users/@me` | 更新当前用户（支持用户名和头像） |
| GET | `/users/@me/servers` | 我加入的服务器列表 |
| GET | `/users/@me/channels` | 我所有 DM 频道列表 |
| POST | `/users/@me/channels` | 创建/获取 DM：`{ recipientId }` |
| POST | `/users/@me/password` | 修改密码：`{ oldPassword, newPassword }` |
| GET | `/users/@me/bots` | 获取我创建的 Bot 列表 |
| POST | `/users/@me/bots` | 创建 Bot（支持头像上传） |
| GET | `/users/@me/bots/:botId` | 获取 Bot 详情 |
| PATCH | `/users/@me/bots/:botId` | 更新 Bot（支持头像上传） |
| DELETE | `/users/@me/bots/:botId` | 删除 Bot |
| POST | `/users/@me/bots/:botId/token` | 重新生成 `accessToken` |
| GET | `/users/search?q=...` | 按用户名模糊搜索（排除自己） |
| GET | `/users/:userId` | 获取用户公开信息 |

### PATCH /users/@me（用户名/头像）

用于更新当前用户的个人资料。

- 请求格式：`multipart/form-data`
- 字段：
  - `avatar`（`file`）：可选，新的头像文件。
  - `username`（`string`）：可选，新的用户名。

---

## Bots（/users/@me/bots）

说明：

- Bot 的 `config` 在后端以 **JSON 字符串** 存储（由 Bot 插件自行约定其 schema）。
- `accessToken` 默认不会出现在查询响应里；仅在「创建」与「重新生成 token」时返回（见 `server/src/api/bot/bot.model.ts` 的 `select: false`）。

创建/更新头像：

- `multipart/form-data`
- 字段名：`avatar`（单文件）
- 其它字段（如 `name/serviceType/config`）按表单字段传入

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

## Server Bots（/servers/:serverId/bots）

用于将“用户创建的 Bot（BotUser）”邀请进某个服务器（仅 server owner 可操作）。

| Method | Path | 描述 |
|---|---|---|
| GET | `/servers/:serverId/bots/search?q=...` | 按用户名搜索可邀请的 Bot 用户（仅返回确实绑定了 Bot 的用户，且不在该服务器内） |
| POST | `/servers/:serverId/bots/:botUserId` | 邀请 Bot 加入服务器（无响应 body，`204`） |

说明：

- 路由要求：已是该服务器成员 + server owner（见 `server/src/api/botInvite/botInvite.routes.ts`）。
- 邀请成功后会向服务器房间广播 `MEMBER_JOIN`。

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
  - 权限：操作者需要是消息的作者，或拥有 `MANAGE_MESSAGES` 权限。
  - 实现：`DELETE` 当前实现为“撤回”，会清空内容与附件并写入 `retractedAt`，并通过 `MESSAGE_UPDATE` 通知客户端（见 `server/src/api/message/message.service.ts`）。

---

## Reactions（消息表情回应）

| Method | Path | 描述 |
|---|---|---|
| PUT | `/.../messages/:messageId/reactions/:emoji/@me` | 添加/切换反应 |
| DELETE | `/.../messages/:messageId/reactions/:emoji/@me` | 移除自己的反应 |

说明：

- 权限：当前实现仅要求用户已认证，并未校验 `ADD_REACTIONS` 权限。任何能看到消息的认证用户都可以添加/删除回应。

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
  - Body：`{ content, username?, avatar_url?, type?, payload? }`
  - 返回：创建后的 `Message`

公开上传（无需 JWT）：

- `POST /webhooks/:webhookId/:token/upload`
  - `multipart/form-data`
  - 字段名：`file`（单文件）
  - 返回：`Attachment`（`{ filename, contentType, key, size }`）

---

## Search（/servers/:serverId/search）

- `GET /servers/:serverId/search?q=...&channelId?=...&limit?=...&page?=...`
  - 具体响应结构取决于搜索实现（见 `server/src/api/search/search.service.ts`）。

---

## Health（/health）

- `GET /health`：健康检查（用于 docker-compose healthcheck，见 `server/src/api/health/health.routes.ts`）。

---

## Bot Bootstrap（/bots，infra-only）

这组接口用于 Bot Service 按 `serviceType` 拉取托管配置：

- `POST /bots/bootstrap`
  - Header：`X-Mew-Admin-Secret: <MEW_ADMIN_SECRET>`
  - Body：`{ serviceType }`
- `GET /bots/:botId/bootstrap`
  - Header：`X-Mew-Admin-Secret: <MEW_ADMIN_SECRET>`

说明：

- 路由同时受 `infraIpOnly`（内网/白名单）与 `verifyAdminSecret` 保护（见 `server/src/api/bot/bot.bootstrap.routes.ts`）。

---

## Infra（/infra）

- `POST /infra/service-types/register`（infra-only）
  - Header：`X-Mew-Admin-Secret: <MEW_ADMIN_SECRET>`
  - Body：`{ serviceType }`（也支持 query）
- `GET /infra/available-services`（需要 JWT）
  - 返回：`{ services: Array<{ serviceType, online, connections }> }`
