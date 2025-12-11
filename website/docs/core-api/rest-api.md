---
sidebar_label: 'REST API'
---

# 📡 REST API 参考

> **⚠️ 权限与层级**
> 许多管理类接口（如成员、角色）除了需要特定权限外，还遵循**层级规则**。这意味着操作者无法修改或移除一个层级**高于或等于**自己最高角色的目标（成员或角色）。服务器所有者不受此限制。

## 1. 身份与账户 (Auth)

*Path: `/api/auth`*

| Method | Endpoint | 描述 |
| :--- | :--- | :--- |
| `POST` | `/register` | 注册新用户 |
| `POST` | `/login` | 登录并获取 JWT |

<details>
<summary>👀 查看请求/响应示例</summary>

**注册请求 (`/register`)**:
```json
{
  "email": "user@example.com",
  "username": "mew_fan",
  "password": "secure_password"
}
```

**登录请求 (`/login`)**:
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**登录响应**:
```json
{
  "user": { ... }, // UserObject
  "token": "eyJhbGciOiJIUzI1Ni..."
}
```
</details>

## 2. 用户 (Users)

*Path: `/api/users`*

管理当前用户 (`@me`) 的数据与关系。

| Method | Endpoint | 描述 |
| :--- | :--- | :--- |
| `GET` | `/@me` | 获取当前登录用户的完整档案。 |
| `GET` | `/@me/servers` | 列出我加入的所有服务器。 |
| `GET` | `/@me/channels` | 列出我所有的私信 (DM) 频道。 |
| `POST` | `/@me/channels` | 创建或获取一个私信频道。**Body**: `{ "recipientId": "..." }` |
| `GET` | `/search` | 根据用户名模糊搜索用户。**Query**: `q=<query>` |
| `GET` | `/:userId` | 获取指定用户的公开信息。 |

## 3. 服务器 (Servers)

*Path: `/api/servers`*

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | 创建一个新服务器。 | (无) |
| `GET` | `/:serverId` | 获取服务器详情。 | (成员) |
| `PATCH` | `/:serverId` | 更新服务器信息（如名称、头像）。 | `MANAGE_SERVER` |
| `DELETE`| `/:serverId` | 删除服务器。 | `ADMINISTRATOR` |

## 4. 成员 (Members)

*Path: `/api/servers/:serverId/members`*

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | 获取服务器的完整成员列表（包括 Webhook 虚拟成员）。 | (成员) |
| `PUT` | `/:userId/roles`| 替换成员的所有角色。**Body**: `{ "roleIds": ["..."] }` | `MANAGE_ROLES` + **层级检查** |
| `DELETE`| `/:userId` | 将成员踢出服务器。 | `KICK_MEMBERS` + **层级检查** |
| `DELETE`| `/@me` | 主动离开服务器。**注意**: 所有者需先转移所有权。 | (成员) |

## 5. 角色 (Roles)

*Path: `/api/servers/:serverId/roles`*

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | 获取服务器的角色列表，按 `position` 升序。 | (成员) |
| `POST` | `/` | 创建一个新角色。**Body**: `{ "name": "...", "permissions": [...] }` | `MANAGE_ROLES` |
| `PATCH` | `/positions` | 批量更新角色顺序。**Body**: `[{ "roleId": "...", "position": 1 }]` | `MANAGE_ROLES` + **层级检查** |
| `PATCH` | `/:roleId` | 更新角色信息（名称、颜色、权限）。 | `MANAGE_ROLES` + **层级检查** |
| `DELETE`| `/:roleId` | 删除角色。**注意**: 不能删除 `@everyone` 角色。 | `MANAGE_ROLES` + **层级检查** |

## 6. 邀请 (Invites)

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/servers/:serverId/invites` | 创建服务器邀请链接。 | `CREATE_INVITE` |
| `GET` | `/api/invites/:inviteCode` | 获取邀请链接的详情（服务器信息等）。 | (认证用户) |
| `POST` | `/api/invites/:inviteCode` | 接受邀请并加入服务器。 | (认证用户) |

## 7. 分组 (Categories)

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/servers/:serverId/categories` | 获取服务器下的所有分组。 | (成员) |
| `POST` | `/api/servers/:serverId/categories` | 在服务器中创建一个新分组。 | `MANAGE_CHANNEL` |
| `PATCH` | `/api/categories/:categoryId` | 更新分组（名称、位置）。 | `MANAGE_CHANNEL` |
| `DELETE`| `/api/categories/:categoryId` | 删除分组。 | `MANAGE_CHANNEL` |

## 8. 频道 (Channels)

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/servers/:serverId/channels` | 获取该服务器下所有**可见**的频道列表。 | (成员) |
| `POST` | `/api/servers/:serverId/channels` | 在服务器中创建新频道。 | `MANAGE_CHANNEL` |
| `PATCH` | `/api/servers/:serverId/channels/:channelId` | 更新频道信息。 | `MANAGE_CHANNEL` |
| `DELETE`| `/api/servers/:serverId/channels/:channelId` | 删除频道。 | `MANAGE_CHANNEL` |
| `GET` | `/api/servers/:serverId/channels/:channelId/permissions` | 获取频道的权限覆盖列表。 | `MANAGE_CHANNEL` |
| `PUT` | `/api/servers/:serverId/channels/:channelId/permissions` | **批量替换**频道的权限覆盖列表。**注意**: 内置自我锁定保护，防止移除自己的管理权限。 | `MANAGE_CHANNEL` |
| `POST` | `/api/servers/:serverId/channels/:channelId/ack` | 标记服务器频道为已读。**Body**: `{ "lastMessageId": "..." }` | (成员) |
| `POST` | `/api/channels/:channelId/ack` | 标记私信频道为已读。**Body**: `{ "lastMessageId": "..." }` | (成员) |

## 9. 消息 (Messages)

### 获取消息
*   **`GET`** `/api/servers/:serverId/channels/:channelId/messages`
*   **`GET`** `/api/channels/:channelId/messages` (用于 DM)
    *   **权限**: 隐式 `VIEW_CHANNEL` (基于频道可见性)
    *   **Query Params**:
        *   `limit`: *number* (默认 50, 最大 100)
        *   `before`: *string* (Message ID, 用于分页加载旧消息)

### 发送消息
*   **`POST`** `/api/servers/:serverId/channels/:channelId/messages`
*   **`POST`** `/api/channels/:channelId/messages` (用于 DM)
    *   **权限**: `SEND_MESSAGES`
    *   **Body**: `{ "content": "Hello World", "attachments?": [...], "payload?": {...} }`

### 编辑与删除
*   **`PATCH`** `/api/.../messages/:messageId`
    *   编辑消息内容。
    *   **权限**: 消息作者 或 `MANAGE_MESSAGES`
    *   **Body**: `{ "content": "New content" }`
*   **`DELETE`** `/api/.../messages/:messageId`
    *   删除消息 (实际为撤回，内容被替换)。
    *   **权限**: 消息作者 或 `MANAGE_MESSAGES`

## 10. 文件上传 (Uploads)

*Path: `/api/channels/:channelId/uploads`*

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | 上传文件至指定频道。成功后返回文件元数据，用于发送消息时的 `attachments` 数组。 | `ATTACH_FILES` |

<details>
<summary>👀 查看请求/响应示例</summary>

**上传请求**:
*   **Body**: `multipart/form-data`
*   **Field**: `file` = `(binary)`

**成功响应**:
```json
{
  "filename": "my-image.png",
  "contentType": "image/png",
  "key": "aB1cD2eF3g.png",
  "size": 123456
}
```
</details>

## 11. 反应 (Reactions)

对消息添加 Emoji 回应。

*   **`PUT`** `/api/.../messages/:messageId/reactions/:emoji/@me`
    *   添加或切换反应。`:emoji` 需要 URL 编码 (e.g., `👍` -> `%F0%9F%91%8D`)。
    *   **权限**: `ADD_REACTIONS`
*   **`DELETE`** `/api/.../messages/:messageId/reactions/:emoji/@me`
    *   移除自己的反应。
    *   **权限**: (成员)

## 12. Webhooks

Bot 集成的核心入口。

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/servers/:serverId/channels/:channelId/webhooks` | 获取频道的 Webhook 列表。 | `MANAGE_WEBHOOKS` |
| `POST` | `/api/servers/:serverId/channels/:channelId/webhooks` | 为频道创建 Webhook。 | `MANAGE_WEBHOOKS` |
| `PATCH` | `/api/servers/:serverId/channels/:channelId/webhooks/:webhookId`| 更新 Webhook。 | `MANAGE_WEBHOOKS` |
| `DELETE`| `/api/servers/:serverId/channels/:channelId/webhooks/:webhookId`| 删除 Webhook。 | `MANAGE_WEBHOOKS` |
| `POST` | `/api/webhooks/:webhookId/:token` | **(公开)** 执行 Webhook 发送消息。 | (无) |

<details>
<summary>👀 查看 Webhook 执行请求 Body</summary>

```json
{
  "content": "Message from bot",
  "username": "Overridden Name (Optional)",
  "avatar_url": "http://... (Optional)"
}
```
</details>

## 13. 搜索 (Search)

| Method | Endpoint | 描述 | 权限要求 |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/servers/:serverId/search` | 在服务器内搜索消息。 **Query**: `q=<query>&channelId=<...>` | (成员) |
