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
- **Docker Compose** (默认 Nginx 反代): `http://localhost/api`
- **Web 客户端** (同源请求): `/api`

---

## 认证 (Authentication)

大部分接口都需要通过 JWT (JSON Web Token) 进行认证。请在 HTTP 请求头中携带认证信息：

```bash
Authorization: Bearer <your-jwt-token>
```

除了 `/auth/*` 用于登录注册和 `/webhooks/:webhookId/:token` 用于公开执行 Webhook 的接口外，其他所有接口都需要认证。

#### Token 类型

- **用户 Token (User Token)**
  - **获取方式**: 通过 `POST /auth/login` 接口，使用邮箱和密码换取。
  - **特点**: 具有可配置的过期时间 (由环境变量 `JWT_EXPIRES_IN` 控制)。

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
| `POST /auth/register` | 用户注册。 |
| `POST /auth/login` | 用户登录，换取 JWT。 |
| `POST /auth/bot` | Bot 登录，用 `accessToken` 换取 JWT。 |

:::info 注册限制
当环境变量 `MEW_ALLOW_USER_REGISTRATION` 设置为 `false` 时，`POST /auth/register` 接口将返回 `403 Forbidden`。
:::

---

### 用户 (Users)

管理用户个人信息、关系与资源。

| 接口 (Endpoint) | 描述 |
|---|---|
| `GET /users/@me` | 获取当前登录用户的信息。 |
| `PATCH /users/@me` | 更新当前用户的用户名或头像。 |
| `POST /users/@me/password` | 修改当前用户的密码。 |
| `GET /users/@me/servers` | 获取我加入的所有服务器列表。 |
| `GET /users/@me/channels` | 获取我的所有私信 (DM) 频道列表。 |
| `POST /users/@me/channels` | 创建或获取一个与指定用户的私信频道。 |
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
| `GET /servers/:serverId/roles` | 获取服务器的角色列表（按 `position` 排序）。 | `MANAGE_ROLES` |
| `POST /servers/:serverId/roles` | 创建一个新角色。 | `MANAGE_ROLES` |
| `PATCH /servers/:serverId/roles/positions` | 批量更新角色的顺序。 | `MANAGE_ROLES` |
| `PATCH /servers/:serverId/roles/:roleId` | 更新指定角色的信息（名称、颜色、权限）。 | `MANAGE_ROLES` |
| `DELETE /servers/:serverId/roles/:roleId` | 删除一个角色（`@everyone` 角色不可删除）。 | `MANAGE_ROLES` |

---

### 成员 (Members)

管理服务器内的成员。

| 接口 (Endpoint) | 描述 | 权限要求 |
|---|---|---|
| `GET /servers/:serverId/members` | 获取服务器的成员列表。 | 服务器成员 |
| `DELETE /servers/:serverId/members/@me` | 退出当前服务器。 | 服务器成员 |
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
| `GET /servers/:serverId/categories` | 获取服务器的分组列表。 | `MANAGE_CHANNEL` |
| `POST /servers/:serverId/categories` | 创建一个新分组。 | `MANAGE_CHANNEL` |
| `GET /servers/:serverId/channels` | 获取服务器内对当前用户可见的频道列表。 | 服务器成员 |
| `POST /servers/:serverId/channels` | 创建一个新频道。 | `MANAGE_CHANNEL` |
| `PATCH /channels/:channelId` | 更新频道信息（如名称、主题）。 | `MANAGE_CHANNEL` |
| `DELETE /channels/:channelId` | 删除一个频道。 | `MANAGE_CHANNEL` |
| `PUT /.../:channelId/permissions` | 替换频道的权限覆盖规则。 | `MANAGE_CHANNEL` |
| `POST /channels/:channelId/ack` | 标记频道为已读。 | 频道可见成员 |

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
- **权限**: 操作者必须是消息的作者，或拥有 `MANAGE_MESSAGES` 权限。

:::info
`DELETE` 操作在当前实现中为“撤回”，服务器会清空消息内容和附件，并通过 `MESSAGE_UPDATE` 事件通知所有客户端，而不是物理删除。
:::

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

| 接口 (Endpoint) | 描述 |
|---|---|
| `GET /health` | 健康检查接口，用于 Docker 等环境。 |
| `POST /bots/bootstrap` | Bot Service 用于拉取指定类型的所有 Bot 配置。 |
| `POST /infra/service-types/register` | 注册一个新的 Bot 服务类型。 |
| `GET /infra/available-services` | 获取所有可用的 Bot 服务类型列表。 |
