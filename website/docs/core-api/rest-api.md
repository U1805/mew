---
sidebar_label: 'REST API'
sidebar_position: 20
---

# 📡 REST API 参考指南

本篇文档提供了项目核心 REST API 的详细参考。

REST API 负责应用中核心资源的“状态”同步与管理（CRUD），例如用户、服务器、频道、消息等。

:::info API 定位
- **REST API**：用于资源的 **增删改查 (CRUD)**。当你需要获取用户信息、发送一条消息、创建一个服务器时，你会使用它。
- **WebSocket API**：用于 **实时事件推送**。当其他用户发送了消息、修改了身份组时，服务器会通过 WebSocket 通知你。详情请见 [WebSocket API](./websocket-api.md)。
:::

### 基准 URL (Base URL)

根据部署环境的不同，API 的基准地址会有所差异：

- **本地开发** (直连 Node.js 服务): `http://localhost:3000/api`
- **Docker Compose** (默认 Nginx 反代): `http://localhost:151/api`
- **Web 客户端** (同源请求): `/api`

---

## 认证 (Authentication)

大部分接口都需要 Access Token 认证。可以通过 HTTP 请求头携带 Bearer Token，也可以使用后端下发的 HttpOnly Cookie（`mew_access_token`）：

```bash
Authorization: Bearer <your-jwt-token>
```

默认不需要 Access Token 的接口包括：
- `/auth/*`（登录注册、刷新、注销、CSRF）
- `/health`（健康检查）
- `/webhooks/:webhookId/:token*`（公开执行 Webhook）
- `/bots/bootstrap`、`/bots/:botId/bootstrap`、`/infra/service-types/register`（基础设施接口，使用 IP 白名单 + `X-Mew-Admin-Secret`）

#### Token 类型

- **访问令牌 (Access Token)**
  - **获取方式**: `POST /auth/login`、`POST /auth/register`、`POST /auth/bot`、`POST /auth/refresh`（或对应 `*-cookie` 版本）。
  - **特点**: 可通过 `Authorization: Bearer <token>` 或 Cookie `mew_access_token` 使用；过期时间由 `JWT_EXPIRES_IN` 控制。

- **Webhook Token**
  - **获取方式**: 在服务器频道的 Webhook 管理中生成。
  - **特点**: 作为 URL 的一部分 (`/webhooks/:webhookId/:token`)，仅用于公开触发 Webhook 发送消息，权限极小。

- **基础设施管理员密钥 (Infra Admin Secret)**
  - **使用方式**: 在请求头中添加 `X-Mew-Admin-Secret: <secret>`。
  - **特点**: 用于基础设施层面的接口鉴权（如 Bot Service 注册），对应后端环境变量 `MEW_ADMIN_SECRET`，请妥善保管。

---

## 错误处理与状态码

#### 错误响应格式

一个通用的错误响应如下：
```json
{ "message": "具体的错误信息..." }
```

对于参数校验失败（`400 Bad Request`），响应会包含更详细的字段信息：
```json
{
  "message": "Validation error",
  "errors": [
    { "path": "username", "message": "Username is required" }
  ]
}
```

#### 常见状态码

| 状态码 | 含义 | 常见原因 |
|---|---|---|
| `400` | Bad Request | 参数缺失、格式错误、服务端校验失败。 |
| `401` | Unauthorized | 未提供 Token，或 Token 无效/已过期。 |
| `403` | Forbidden | 权限不足，例如非服务器管理员尝试修改服务器设置。 |
| `404` | Not Found | 请求的资源不存在，例如访问一个不存在的用户或消息。 |
| `409` | Conflict | 资源冲突，例如尝试创建一个已存在的用户。 |
| `500` | Internal Server Error | 服务器内部发生未知错误。 |

:::info
更具体的数据结构定义，请参阅 [`core-api/data-structures`](./data-structures.md)。
:::

---

## 接口列表

### 认证 (Auth)

用于用户注册、登录与 Bot 认证。

| 接口 (Endpoint) | 描述 |
|---|---|
| `GET /auth/config` | 获取认证配置，如是否允许新用户注册。 |
| `GET /auth/csrf` | 下发 CSRF Cookie（`mew_csrf_token`），供浏览器后续写请求使用。 |
| `POST /auth/register` | 用户注册。 |
| `POST /auth/register-cookie` | 用户注册（仅依赖 Cookie 会话，不在响应体返回 `token`）。 |
| `POST /auth/login` | 用户登录，换取 JWT。 |
| `POST /auth/login-cookie` | 用户登录（仅依赖 Cookie 会话，不在响应体返回 `token`）。 |
| `POST /auth/bot` | Bot 登录，用 `accessToken` 换取 JWT。 |
| `POST /auth/refresh` | 使用 Refresh Token 刷新 Access Token。 |
| `POST /auth/refresh-cookie` | 刷新会话（仅依赖 Cookie 会话，不在响应体返回 `token`）。 |
| `POST /auth/logout` | 注销并清理 Refresh Token。 |

:::info 注册限制
当环境变量 `MEW_ALLOW_USER_REGISTRATION` 设置为 `false` 时，`POST /auth/register` 接口将返回 `403 Forbidden`。
:::

:::info CSRF（浏览器）
除 `GET /auth/config`、`GET /auth/csrf` 外，`/auth` 下的写操作都经过 CSRF 校验。  
浏览器调用时通常先请求 `GET /auth/csrf`，再把同值写入请求头 `X-Mew-Csrf-Token`。
:::

:::info Refresh Token (Cookie)
后端会在登录/注册时通过 **HttpOnly Cookie** 下发会话 Cookie：
- Access Token Cookie：`mew_access_token`（Path: `/`）
- Refresh Token Cookie：`mew_refresh_token`（Path: `/api/auth`）
- 刷新：`POST /auth/refresh` 或 `POST /auth/refresh-cookie` 会轮换 Refresh Token，并更新 Access Token Cookie
- 注销：`POST /auth/logout` 会撤销当前 Refresh Token 并清理两类 Cookie
:::

---

### 用户 (Users)

管理用户个人信息、关系与资源。

| 接口 (Endpoint) | 描述 |
|---|---|
| `GET /users/@me` | 获取当前登录用户的信息。 |
| `PATCH /users/@me` | 更新当前用户的用户名或头像。 |
| `POST /users/@me/password` | 修改当前用户的密码。 |
| `GET /users/@me/notification-settings` | 获取我的通知设置。 |
| `PUT /users/@me/notification-settings` | 更新我的通知设置。 |
| `GET /users/@me/channel-notification-settings` | 获取我对各频道的通知设置列表。 |
| `GET /users/@me/servers` | 获取我加入的所有服务器列表。 |
| `GET /users/@me/channels` | 获取我的所有私信 (DM) 频道列表。 |
| `POST /users/@me/channels` | 创建或获取一个与指定用户的私信频道。 |
| `GET /users/@me/stickers` | 获取我的贴纸列表。 |
| `POST /users/@me/stickers` | 上传并创建一个我的贴纸。 |
| `PATCH /users/@me/stickers/:stickerId` | 更新我的贴纸信息。 |
| `DELETE /users/@me/stickers/:stickerId` | 删除我的贴纸。 |
| `GET /users/search?q=` | 根据用户名模糊搜索用户（不包含自己）。 |
| `GET /users/:userId` | 获取指定用户的公开信息。 |

#### 更新用户信息 (`PATCH /users/@me`)

此接口用于更新用户的**用户名**和**头像**。

- **请求格式**: `multipart/form-data`
- **字段**:
  - `username` (string, 可选): 新的用户名。
  - `avatar` (file, 可选): 新的头像图片文件。

---

### 机器人 (Bots)

管理由用户创建的机器人。

| 接口 (Endpoint) | 描述 |
|---|---|
| `GET /users/@me/bots` | 获取我创建的所有 Bot 列表。 |
| `POST /users/@me/bots` | 创建一个新的 Bot。 |
| `GET /users/@me/bots/:botId` | 获取指定 Bot 的详情。 |
| `PATCH /users/@me/bots/:botId` | 更新指定 Bot 的信息。 |
| `DELETE /users/@me/bots/:botId` | 删除一个 Bot。 |
| `POST /users/@me/bots/:botId/token` | 为 Bot 重新生成 `accessToken`。 |
| `GET /users/@me/bots/:botId/stickers` | 获取此 Bot 的贴纸列表。 |
| `POST /users/@me/bots/:botId/stickers` | 上传并创建一个 Bot 贴纸。 |
| `PATCH /users/@me/bots/:botId/stickers/:stickerId` | 更新 Bot 贴纸信息。 |
| `DELETE /users/@me/bots/:botId/stickers/:stickerId` | 删除 Bot 贴纸。 |

:::info Bot 配置与 Token 安全
- Bot 的 `config` 字段在后端以 **JSON 字符串** 格式存储，其内部结构由具体 Bot 插件自行定义。
- 出于安全考虑，`accessToken` 默认不会在查询 Bot 信息的响应中返回。它只在 **创建 Bot** 或 **重新生成 Token** 时才会返回一次，请务必妥善保存。
:::

---

### 服务器 (Servers)

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `POST /servers` | 创建一个新服务器。 | (无) |
| `GET /servers/:serverId` | 获取服务器详情。 | 服务器成员 |
| `PATCH /servers/:serverId` | 更新服务器信息（名称等）。 | `MANAGE_SERVER` |
| `DELETE /servers/:serverId` | 删除服务器。 | `ADMINISTRATOR` |
| `POST /servers/:serverId/icon` | 上传并更新服务器图标。 | `MANAGE_SERVER` |

#### 邀请 Bot (`/servers/:serverId/bots`)

此组接口用于将用户创建的 Bot 添加到服务器中。

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `GET /.../bots/search?q=` | 搜索可被邀请加入此服务器的 Bot。 | 服务器所有者 |
| `POST /.../bots/:botUserId` | 邀请指定 Bot 用户加入服务器。 | 服务器所有者 |

---

### 身份组 (Roles)

管理服务器内的用户身份组与权限。

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `GET /servers/:serverId/roles` | 获取服务器的角色列表（按 `position` 排序）。 | 已认证用户 |
| `POST /servers/:serverId/roles` | 创建一个新角色。 | `MANAGE_ROLES`（并且需为服务器所有者） |
| `PATCH /servers/:serverId/roles/positions` | 批量更新角色的顺序。 | `MANAGE_ROLES` |
| `PATCH /servers/:serverId/roles/:roleId` | 更新指定角色的信息（名称、颜色、权限）。 | `MANAGE_ROLES` |
| `DELETE /servers/:serverId/roles/:roleId` | 删除一个角色（`@everyone` 角色不可删除）。 | `MANAGE_ROLES` |

:::info 说明
`GET /servers/:serverId/roles` 当前仅要求登录（后端未在路由层做服务器成员校验）。如果你在实现客户端逻辑，仍应按“仅服务器成员可见”的预期来使用。
:::

---

### 成员 (Members)

管理服务器内的成员。

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `GET /servers/:serverId/members` | 获取服务器的成员列表。 | 服务器成员 |
| `DELETE /servers/:serverId/members/@me` | 退出当前服务器。 | 服务器成员 |
| `GET /servers/:serverId/members/@me/notification-settings` | 获取我在该服务器内的通知设置。 | 服务器成员 |
| `PUT /servers/:serverId/members/@me/notification-settings` | 更新我在该服务器内的通知设置。 | 服务器成员 |
| `DELETE /servers/:serverId/members/:userId` | 将指定成员踢出服务器。 | `KICK_MEMBERS` |
| `PUT /servers/:serverId/members/:userId/roles` | 替换指定成员的身份组。 | `MANAGE_ROLES` |

---

### 邀请 (Invites)

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `POST /servers/:serverId/invites` | 为服务器创建一个邀请链接。 | `CREATE_INVITE` |
| `GET /invites/:inviteCode` | 获取邀请链接的预览信息。 | 已认证用户 |
| `POST /invites/:inviteCode` | 接受邀请并加入服务器。 | 已认证用户 |

---

### 分组与频道 (Categories & Channels)

频道与分组的管理。

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `GET /servers/:serverId/categories` | 获取服务器的分组列表。 | 服务器成员 |
| `POST /servers/:serverId/categories` | 创建一个新分组。 | `MANAGE_CHANNEL` |
| `PATCH /categories/:categoryId` | 更新分组信息。 | `MANAGE_CHANNEL` |
| `DELETE /categories/:categoryId` | 删除分组。 | `MANAGE_CHANNEL` |
| `GET /servers/:serverId/channels` | 获取服务器内对当前用户可见的频道列表。 | 服务器成员 |
| `POST /servers/:serverId/channels` | 创建一个新频道。 | `MANAGE_CHANNEL` |
| `PATCH /channels/:channelId` | 更新频道信息（如名称、主题）。 | `MANAGE_CHANNEL` |
| `DELETE /channels/:channelId` | 删除一个频道。 | `MANAGE_CHANNEL` |
| `GET /servers/:serverId/channels/:channelId/permissions` | 获取频道的权限覆盖规则。 | `MANAGE_CHANNEL` |
| `PUT /servers/:serverId/channels/:channelId/permissions` | 替换频道的权限覆盖规则。 | `MANAGE_CHANNEL` |
| `POST /servers/:serverId/channels/:channelId/ack` | 标记服务器频道为已读。 | 服务器成员 |
| `POST /channels/:channelId/ack` | 标记频道为已读（对 DM/频道 ID 场景通用）。 | 频道可见成员 |
| `GET /channels/:channelId/search?q=` | 在指定频道内搜索消息。 | 频道可见成员 |
| `GET /servers/:serverId/search?q=` | 在服务器内搜索消息。 | 服务器成员 |
| `GET /channels/:channelId/notification-settings` | 获取我对该频道的通知设置。 | 频道可见成员 |
| `PUT /channels/:channelId/notification-settings` | 更新我对该频道的通知设置。 | 频道可见成员 |

---

### 消息 (Messages)

消息路由会同时挂载在服务器频道和 DM 频道下：
- `/servers/:serverId/channels/:channelId/messages`
- `/channels/:channelId/messages`

#### 获取消息
`GET /.../messages?limit=50&before=<messageId>`
- `limit`: 单次获取数量，范围 1-100，默认 50。
- `before`: 消息 ID 游标，用于获取此 ID 之前的更早消息（翻页）。

#### 发送消息
`POST /.../messages`
- **Body**: `{ "content"?: "...", "attachments"?: [...] }`
- `content` 和 `attachments` 至少需要提供一个。

#### 编辑与删除消息
- `PATCH /.../messages/:messageId`
- `DELETE /.../messages/:messageId`
- **权限**: 操作者必须是消息的作者；或在服务器频道内拥有 `MANAGE_MESSAGES` 权限。删除消息还允许 Bot 所有者撤回其 Bot 用户发送的消息。

:::info
`DELETE` 操作在当前实现中为“撤回”，服务器会清空消息内容和附件，并通过 `MESSAGE_UPDATE` 事件通知所有客户端，而不是物理删除。
:::

#### 语音转文字 (STT)
`POST /.../messages/:messageId/transcribe`
- **请求格式**: `multipart/form-data`
- **字段**:
  - `file` (file, 必填): 语音文件
- **响应**: `text/plain`（转写后的文本）

---

### 表情回应 (Reactions)

| 接口 (Endpoint) | 描述 |
|---|---|
| `PUT /.../messages/:messageId/reactions/:emoji/@me` | 对消息添加一个表情回应。 |
| `DELETE /.../messages/:messageId/reactions/:emoji/@me` | 移除自己添加的表情回应。 |

---

### 附件上传 (Uploads)

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `POST /channels/:channelId/uploads` | 直接上传文件作为附件。 | `ATTACH_FILES` |
| `POST /channels/:channelId/uploads/presign` | 获取一个预签名的上传 URL (用于大文件直传 S3)。 | `ATTACH_FILES` |
| `GET /channels/:channelId/uploads/:key` | 根据 `key` 下载附件。 | `SEND_MESSAGES` |

---

### Webhooks

#### Webhook 管理 (需要认证)
- `GET /servers/:serverId/channels/:channelId/webhooks`
- `POST /servers/:serverId/channels/:channelId/webhooks`
- `GET /servers/:serverId/channels/:channelId/webhooks/:webhookId/token`
- `POST /servers/:serverId/channels/:channelId/webhooks/:webhookId/reset-token`
- `PATCH /servers/:serverId/channels/:channelId/webhooks/:webhookId`
- `DELETE /servers/:serverId/channels/:channelId/webhooks/:webhookId`

#### 公开执行 (无需认证)

- **发送消息**: `POST /webhooks/:webhookId/:token`
- **上传附件**: `POST /webhooks/:webhookId/:token/upload`
- **获取预签名上传 URL**: `POST /webhooks/:webhookId/:token/presign`

---

### 基础设施 (Infrastructure)

:::caution 高级接口
以下接口主要用于服务内部或 Bot Service 等基础设施层面的通信，普通用户和 Bot 通常无需关心。
:::

:::info 鉴权与访问限制
部分基础设施接口会额外要求：
- 请求头携带 `X-Mew-Admin-Secret`
- 来源 IP 符合基础设施 IP 白名单（见后端 `MEW_INFRA_ALLOWED_IPS`）
:::

| 接口 (Endpoint) | 描述 | 鉴权要求 |
|---|---|---|
| `GET /health` | 健康检查接口，用于 Docker 等环境。 | 无 |
| `POST /bots/bootstrap` | Bot Service 拉取指定类型的所有 Bot 配置。 | `infraIpOnly` + `X-Mew-Admin-Secret` |
| `GET /bots/:botId/bootstrap` | Bot Service 按 Bot ID 拉取单个 Bot 配置（可选 query: `serviceType`）。 | `infraIpOnly` + `X-Mew-Admin-Secret` |
| `PATCH /bots/:botId/config` | Bot 自身更新其配置。 | Bot JWT（`Authorization` 或 `mew_access_token`） |
| `POST /infra/service-types/register` | 注册新的 Bot 服务类型。 | `infraIpOnly` + `X-Mew-Admin-Secret` |
| `GET /infra/available-services` | 获取可用 Bot 服务类型列表。 | 用户/Bot JWT |
| `GET /infra/service-bot-user?serviceType=` | 获取某服务类型可用于 DM 的 botUserId（仅返回 `dmEnabled` 的 Bot）。 | 用户/Bot JWT |

---

### 文本转语音 (TTS)

| 接口 (Endpoint) | 描述 |
|---|---|
| `POST /v1/audio/speech` | 合成语音，Body 至少提供 `text` 或 `input`，返回 `audio/mpeg`（也支持流式输出）。 |

---

### 语音转文字 (OpenAI 兼容 STT)

| 接口 (Endpoint) | 描述 |
|---|---|
| `POST /v1/audio/transcriptions` | 上传语音文件转写。`multipart/form-data`，必填 `file`、`model`，可选 `language`、`prompt`、`response_format`、`temperature`。 |
