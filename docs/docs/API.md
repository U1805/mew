# Mew - API 技术规格文档

**最后更新时间: 2025-12-08**

本文档详细描述了 Mew 即时通讯（IM）平台核心功能的**当前实现**，旨在作为前端开发的权威技术蓝图。本文档已与后端代码库 (`backend/src`) 同步。

> **实现说明**
> 后端广泛使用 **Zod** 进行输入验证。本文档描述的请求体/查询参数均由相应的 Zod schema 强制执行。

## 一、 数据模型设计 (MongoDB Schema)

所有模型都自动包含 `createdAt` 和 `updatedAt` 时间戳字段。

### 1. User (用户)

存储用户信息和认证凭据。

```typescript
{
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false }, // API 默认不返回
  avatarUrl: String,
  isBot: { type: Boolean, default: false } // 区分机器人账号
}
```

### 2. Server (服务器)

代表一个服务器实例。

```typescript
{
  name: { type: String, required: true },
  avatarUrl: String,
  everyoneRoleId: { type: ObjectId, ref: 'Role' } // 存储 @everyone 角色的ID
}
```

### 3. Role (角色)

基于角色的访问控制（RBAC）的核心。角色是权限的命名集合。

```typescript
{
  name: { type: String, required: true },
  serverId: { type: ObjectId, ref: 'Server', required: true, index: true },
  permissions: { type: [String], default: [] }, // 权限键的数组
  color: { type: String, default: '#99AAB5' }, // 十六进制颜色代码
  position: { type: Number, required: true, index: true }, // 角色层级，数字越低层级越低
  isDefault: { type: Boolean, default: false, index: true } // 标识是否为 @everyone 角色
}
```

### 4. ServerMember (服务器成员)

将用户与服务器关联起来，定义其角色和所有权。

```typescript
{
  serverId: { type: ObjectId, ref: 'Server', required: true },
  userId: { type: ObjectId, ref: 'User', required: true },
  roleIds: [{ type: ObjectId, ref: 'Role' }], // 成员拥有的所有角色ID
  isOwner: { type: Boolean, default: false, index: true }, // 是否为服务器所有者
  nickname: String
}
// (serverId, userId) 上有复合唯一索引
```

### 5. Invite (邀请)

用于邀请用户加入服务器。

```typescript
{
  code: { type: String, required: true, unique: true },
  serverId: { type: ObjectId, ref: 'Server', required: true },
  creatorId: { type: ObjectId, ref: 'User', required: true },
  expiresAt: Date, // 可选，过期时间
  maxUses: { type: Number, default: 0 }, // 可选，0为无限次
  uses: { type: Number, default: 0 } // 当前使用次数
}
```

### 6. Category (分组)

服务器内的频道分组。

```typescript
{
  name: { type: String, required: true },
  serverId: { type: ObjectId, ref: 'Server', required: true },
  position: Number // 可选，用于UI排序
}
```

### 7. Channel (频道)

消息发生的场所，包含权限覆盖规则。

```typescript
// 权限覆盖子文档
interface IPermissionOverride {
  targetType: 'role' | 'member';
  targetId: ObjectId;
  allow: string[];
  deny: string[];
}

// 主文档
{
  name: String, // DM 类型时通常为空
  type: { type: String, enum: ['GUILD_TEXT', 'DM'], required: true },
  serverId: { type: ObjectId, ref: 'Server' }, // 仅 GUILD_TEXT 有
  categoryId: { type: ObjectId, ref: 'Category' }, // 仅 GUILD_TEXT 有
  recipients: [{ type: ObjectId, ref: 'User' }], // 仅 DM 有
  position: Number,
  permissionOverrides: [PermissionOverrideSchema] // 权限覆盖规则数组
}
```

### 8. Message (消息)

核心消息数据结构。

```typescript
// 附件结构
interface IAttachment {
  filename: string;
  contentType: string;
  url: string;
  size: number;
}

// 反应结构 (Reactions)
interface IReaction {
  emoji: string;
  userIds: ObjectId[]; // 包含点击该 emoji 的所有用户 ID
}

{
  channelId: { type: ObjectId, ref: 'Channel', required: true },
  authorId: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, default: 'message/default' },
  content: { type: String, required: true },
  payload: Object,
  attachments: [AttachmentSchema],
  mentions: [{ type: ObjectId, ref: 'User' }],
  referencedMessageId: { type: ObjectId, ref: 'Message' },
  reactions: [ReactionSchema],
  editedAt: Date, // 编辑时间
  retractedAt: Date // 撤回时间
}
```

### 9. Webhook (钩子)

用于存储 Webhook 的配置信息。

```typescript
{
  name: { type: String, required: true },
  avatarUrl: String,
  channelId: { type: ObjectId, ref: 'Channel', required: true, index: true },
  serverId: { type: ObjectId, ref: 'Server', required: true, index: true },
  token: { type: String, required: true },
  botUserId: { type: ObjectId, ref: 'User', required: true }
}
```

### 10. ChannelReadState (频道已读状态)

记录用户在特定频道中最后读取的消息。

```typescript
{
  userId: { type: ObjectId, ref: 'User', required: true },
  channelId: { type: ObjectId, ref: 'Channel', required: true },
  lastReadMessageId: { type: ObjectId, ref: 'Message', required: true }
}
```

---

## 二、 RESTful API 设计

**基础 URL**: `/api`
**认证**: 所有受保护接口均需在 Header 中携带 `Authorization: Bearer <TOKEN>`。

> **关于权限层级的重要说明**
> 多个接口（如角色和成员管理）包含**层级检查**。这意味着即使用户拥有必要的权限（如 `MANAGE_ROLES`），他也无法修改或删除一个比自己最高角色层级**更高或相等**的角色或成员。服务器所有者不受此限制。

### 1. 认证 (Auth)
*Path: `/api/auth`*

- `POST /register`: 注册 (Body: `email`, `username`, `password`)
- `POST /login`: 登录 (Body: `email`, `password`) -> 返回 `{ user, token }`

### 2. 用户 (Users)
*Path: `/api/users`*

- `GET /@me`: 获取当前用户信息。
- `GET /@me/servers`: 获取当前用户作为成员的所有服务器列表。
- `POST /@me/channels`: 创建或获取私聊(DM)频道 (Body: `{ recipientId: string }`)
  - **WebSocket**: 触发 `DM_CHANNEL_CREATE` 事件（仅对接收者）。
- `GET /@me/channels`: 获取当前用户的私聊(DM)频道列表。
- `GET /search`: 模糊搜索用户 (Query: `q`)
- `GET /:userId`: 获取指定ID用户的公开信息。

### 3. 消息搜索 (Search)
*Path: `/api/servers/:serverId/search`*

- `GET /`: 在服务器内搜索消息 (需为成员)。
  - **Query 参数**: `q`, `channelId?`, `limit?`, `page?`

### 4. 服务器 (Servers)
*Path: `/api/servers`*

- `POST /`: 创建服务器 (Body: `name`, `avatarUrl?`) -> 调用者自动成为所有者。
- `GET /:serverId`: 获取服务器详情 (需为成员)。
- `PATCH /:serverId`: 更新服务器信息 (需 `MANAGE_SERVER` 权限)。
- `DELETE /:serverId`: 删除服务器 (需 `ADMINISTRATOR` 权限)。

### 5. 成员管理 (Members)
*Path: `/api/servers/:serverId/members`*

- `GET /`: 获取服务器的完整成员列表 (对所有成员开放)。
  - **响应**: 返回 `ServerMember[]` 数组。每个成员对象都通过 `populate` 填充了 `userId` 字段，格式为 `{ _id, username, avatarUrl }`。
- `DELETE /@me`: 当前用户主动离开服务器。
  - **级联效应**: 会自动从所有频道中**删除**此用户相关的权限覆盖规则。
  - **注意**: 服务器的唯一所有者无法离开，必须先转移所有权。
  - **响应**: `204 No Content`。
- `DELETE /:userId`: 将指定用户从服务器中移除 (需 `KICK_MEMBERS` 权限和**层级检查**)。
  - **级联效应**: 会自动从所有频道中**删除**此用户相关的权限覆盖规则。
  - **WebSocket**: 触发 `SERVER_KICK`（对被移除者）和 `MEMBER_LEAVE`（对全服）事件。
  - **注意**: 不能移除自己。
  - **响应**: `204 No Content`。
- `PUT /:userId/roles`: 替换指定成员的所有角色 (需 `MANAGE_ROLES` 权限和**层级检查**)。
  - **Body**: `{ roleIds: string[] }`。
  - **WebSocket**: 触发 `PERMISSIONS_UPDATE` 事件（对全服及被操作用户）。

### 6. 角色管理 (Roles)
*Path: `/api/servers/:serverId/roles`*

- `POST /`: 创建新角色 (需 `MANAGE_ROLES` 权限)。
  - **Body**: `{ name: string, permissions?: string[], color?: string, position?: number }`。如果 `position` 未提供，将自动设为 `(当前最高角色的 position + 1)`。
  - **WebSocket**: 触发 `PERMISSIONS_UPDATE` 事件。
- `GET /`: 获取服务器所有角色列表，按 `position` 升序排序 (对所有成员开放)。
- `PATCH /positions`: 批量更新角色顺序 (需 `MANAGE_ROLES` 权限和对每个角色的**层级检查**)。
  - **Body**: `{ roleId: string, position: number }[]`。
  - **响应**: 返回更新后、按新 `position` 排序的**完整角色列表**。
  - **WebSocket**: 触发 `PERMISSIONS_UPDATE` 事件。
- `PATCH /:roleId`: 更新角色信息 (需 `MANAGE_ROLES` 权限和**层级检查**)。
  - **Body**: `{ name?: string, color?: string, permissions?: string[] }`。
  - **WebSocket**: 触发 `PERMISSIONS_UPDATE` 事件。
- `DELETE /:roleId`: 删除角色 (需 `MANAGE_ROLES` 权限和**层级检查**)。
  - **级联效应**:
    - 会从所有拥有此角色的成员中**移除**该角色。
    - 会从所有频道中**删除**与该角色相关的权限覆盖规则。
  - **注意**: 不能删除默认的 `@everyone` 角色。
  - **响应**: `200 OK` 并返回 `{ message: 'Role deleted successfully.' }`。
  - **WebSocket**: 触发 `PERMISSIONS_UPDATE` 事件。

### 7. 邀请 (Invites)
*Path 1: `/api/servers/:serverId/invites` (创建)
Path 2: `/api/invites` (接受/查询)*

- `POST /api/servers/:serverId/invites`: 创建邀请链接 (需 `CREATE_INVITE` 权限)。
- `GET /api/invites/:inviteCode`: 获取邀请链接详情（需认证）。
- `POST /api/invites/:inviteCode`: 接受邀请并加入服务器（需认证）。

### 8. 分组 (Categories)
*Path: `/api/servers/:serverId/categories` 和 `/api/categories/:categoryId`*

- `GET /..`: 获取服务器下的所有分组。
- `POST /..`: 创建分组 (需 `MANAGE_CHANNEL` 权限)。
- `PATCH /..`: 更新分组 (需 `MANAGE_CHANNEL` 权限)。
- `DELETE /..`: 删除分组 (需 `MANAGE_CHANNEL` 权限)。

### 9. 频道 (Channels)
*Path: `/api/servers/:serverId/channels`*

- `GET /`: 获取服务器下用户**有权查看**的所有频道。
  - **响应**: 每个频道对象会额外包含 `permissions: string[]` (用户在该频道的有效权限), `lastMessage: IMessage | null` 和 `lastReadMessageId: ObjectId | null`。
- `POST /`: 创建频道 (需 `MANAGE_CHANNEL` 权限)。
- `PATCH /:channelId`: 更新频道 (需 `MANAGE_CHANNEL` 权限)。
  - **WebSocket**: 触发 `CHANNEL_UPDATE` 事件。
- `DELETE /:channelId`: 删除频道 (需 `MANAGE_CHANNEL` 权限)。
  - **级联效应**: 会**删除**该频道下的所有消息。
  - **WebSocket**: 触发 `CHANNEL_DELETE` 事件。
- `GET /:channelId/permissions`: 获取频道的所有权限覆盖规则 (需 `MANAGE_CHANNEL` 权限)。
  - **响应**: `PermissionOverride[]`。
- `PUT /:channelId/permissions`: **批量替换**一个频道的所有权限覆盖规则 (需 `MANAGE_CHANNEL` 权限)。
  - **Body**: `PermissionOverride[]`，其中 `PermissionOverride` 是一个对象：`{ targetType: 'role' | 'member', targetId: string, allow: string[], deny: string[] }`。
  - **注意：自我锁定保护**：此接口会进行预计算。如果提交的更改会导致操作者本人失去对该频道的 `MANAGE_CHANNEL` 权限，请求将被拒绝（`403 Forbidden`）。服务器所有者和拥有 `ADMINISTRATOR` 权限的用户不受此限制。
  - **WebSocket**: 触发 `PERMISSIONS_UPDATE` 事件。

### 10. 消息 (Messages)
*Path (服务器频道): `/api/servers/:serverId/channels/:channelId/messages`*
*Path (私聊频道): `/api/channels/:channelId/messages`*

- `GET /`: 获取消息列表 (需 `VIEW_CHANNEL` 权限)。(Query: `limit`, `before`)
- `POST /`: 发送消息 (需 `SEND_MESSAGES` 权限)。(Body: `content`, `attachments?`, `payload?`)
- `PATCH /:messageId`: 编辑消息 (需为消息作者)。
- `DELETE /:messageId`: 删除消息 (需为消息作者或有 `MANAGE_MESSAGES` 权限)。

### 11. 已读状态 (Read State)
*Path (服务器频道): `/api/servers/:serverId/channels/:channelId/ack`*
*Path (私聊频道): `/api/channels/:channelId/ack`*

- `POST /`: 标记频道为已读。(Body: `{ lastMessageId: string }`)
  - **响应**: `204 No Content`。

### 12. 反应 (Reactions)
*Path: `/api/servers/:serverId/channels/:channelId/messages/:messageId/reactions`*

- `PUT /:emoji/@me`: 添加反应 (需 `ADD_REACTIONS` 权限)。
- `DELETE /:emoji/@me`: 移除自己的反应。

### 13. Webhook 管理
*Path: `/api/servers/:serverId/channels/:channelId/webhooks`*
- (需 `MANAGE_WEBHOOKS` 权限)
- `GET /`: 获取所有 Webhooks。
- `POST /`: 创建 Webhook。
- `PATCH /:webhookId`: 更新 Webhook。
- `DELETE /:webhookId`: 删除 Webhook。

### 14. Webhook 执行 (公开)
*Path: `/api/webhooks/:webhookId/:token`*
- `POST /`: 执行 Webhook 以发送消息。

---

## 三、 WebSocket Gateway 设计

### 1. 连接与鉴权

客户端连接时需在 `auth` 对象中传递 JWT Token。

```javascript
const socket = io("http://localhost:3000", {
  auth: { token: "..." }
});
```

### 2. 客户端上行事件 (Client -> Server)

-   `message/create`: 发送新消息 (Payload: `{ channelId, content, ... }`)

### 3. 服务端下行广播事件 (Server -> Client)

- **消息**: `MESSAGE_CREATE`, `MESSAGE_UPDATE` (处理编辑、撤回、删除), `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`
- **频道**: `CHANNEL_UPDATE`, `CHANNEL_DELETE`, `DM_CHANNEL_CREATE`
- **分组**: `CATEGORY_UPDATE`, `CATEGORY_DELETE`
- **服务器**: `SERVER_UPDATE`, `SERVER_DELETE`
- **成员**: `MEMBER_LEAVE` (向全服广播), `SERVER_KICK` (单独向被踢者广播)
- **权限**: `PERMISSIONS_UPDATE` (当任何角色或权限变更时广播，通知客户端重新获取数据)
- **在线状态**: `PRESENCE_INITIAL_STATE`, `PRESENCE_UPDATE`