# Mew - API 技术规格文档

**最后更新时间: 2025-12-05**

本文档详细描述了 Mew 即时通讯（IM）平台核心功能的**当前实现**，旨在作为前端开发的权威技术蓝图。本文档已与后端代码库 (`backend/src`) 同步。

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

代表一个服务器实例。服务器的所有者由 `ServerMember` 模型中 `role: 'OWNER'` 的记录确定。

```typescript
{
  name: { type: String, required: true },
  avatarUrl: String
}
```

### 3. ServerMember (服务器成员)

将用户与服务器关联起来，定义其角色。

```typescript
{
  serverId: { type: ObjectId, ref: 'Server', required: true },
  userId: { type: ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['OWNER', 'MEMBER'], default: 'MEMBER' },
  nickname: String
}
// (serverId, userId) 上有复合唯一索引
```

### 4. Invite (邀请)

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

### 5. Category (分组)

服务器内的频道分组。

```typescript
{
  name: { type: String, required: true },
  serverId: { type: ObjectId, ref: 'Server', required: true },
  position: Number // 可选，用于UI排序
}
```

### 6. Channel (频道)

消息发生的场所。

```typescript
// 类型枚举
enum ChannelType {
  GUILD_TEXT = 'GUILD_TEXT', // 服务器文字频道
  DM = 'DM',                 // 私聊频道
}

{
  name: String, // DM 类型时通常为空或自动生成
  type: { type: String, enum: ['GUILD_TEXT', 'DM'], required: true },
  serverId: { type: ObjectId, ref: 'Server' }, // 仅 GUILD_TEXT 有
  categoryId: { type: ObjectId, ref: 'Category' }, // 仅 GUILD_TEXT 有
  recipients: [{ type: ObjectId, ref: 'User' }], // 仅 DM 有
  position: Number
}
```

### 7. Message (消息)

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
  authorId: { type: ObjectId, ref: 'User', required: true }, // Populate 后包含 username, avatarUrl
  type: { type: String, default: 'message/default' },
  content: { type: String, required: true }, // 文本内容
  payload: Object, // 用于插件化渲染的自定义数据
  attachments: [AttachmentSchema],
  mentions: [{ type: ObjectId, ref: 'User' }],
  referencedMessageId: { type: ObjectId, ref: 'Message' }, // 回复消息引用
  reactions: [ReactionSchema],
  editedAt: Date, // 编辑时间，未编辑则为空
  retractedAt: Date // 撤回时间，未撤回则为空
}
```

### 8. Webhook (钩子)

用于存储 Webhook 的配置信息。

```typescript
{
  name: { type: String, required: true },
  avatarUrl: String,
  channelId: { type: ObjectId, ref: 'Channel', required: true, index: true },
  serverId: { type: ObjectId, ref: 'Server', required: true, index: true },
  token: { type: String, required: true }, // 用于验证请求的唯一令牌
  botUserId: { type: ObjectId, ref: 'User', required: true } // 关联的机器人用户 ID
}
```

### 9. ChannelReadState (频道已读状态)

记录用户在特定频道中最后读取的消息。

```typescript
{
  userId: { type: ObjectId, ref: 'User', required: true },
  channelId: { type: ObjectId, ref: 'Channel', required: true },
  lastReadMessageId: { type: ObjectId, ref: 'Message', required: true }
}
// (userId, channelId) 上有复合唯一索引
```

---


## 二、 RESTful API 设计

**基础 URL**: `/api`
**认证**: 所有受保护接口均需在 Header 中携带 `Authorization: Bearer <TOKEN>`。

### 1. 认证 (Auth)
*Path: `/api/auth`*

- `POST /register`: 注册 (Body: `email`, `username`, `password`)
- `POST /login`: 登录 (Body: `email`, `password`) -> 返回 `{ user, token }`

### 2. 用户 (Users)
*Path: `/api/users`*

- `GET /@me`: 获取当前用户信息。
- `GET /@me/servers`: 获取当前用户**作为成员**的所有服务器列表。
- `POST /@me/channels`: 创建或获取私聊(DM)频道 (Body: `{ recipientId: string }`)
- `GET /@me/channels`: 获取当前用户的私聊(DM)频道列表。
  - **响应更新**: 每个返回的频道对象现在额外包含 `lastMessage: IMessage | null` 和 `lastReadMessageId: ObjectId | null` 字段。
- `GET /search`: 模糊搜索用户 (Query: `q`) -> 返回 `[{ _id, username, avatarUrl }]`
- `GET /:userId`: 获取指定ID用户的公开信息。成功时返回用户对象，包含 `_id`, `username`, `avatarUrl`, `isBot`, `createdAt`。如果用户不存在则返回 404。

### 3. 服务器 (Servers)
*Path: `/api/servers`*

- `POST /`: 创建服务器 (Body: `name`, `avatarUrl?`) -> 成功后，调用者自动成为 `OWNER`。
- `GET /:serverId`: 获取服务器详情 (需为成员)。
- `PATCH /:serverId`: 更新服务器信息 (需为 `OWNER`)。
- `DELETE /:serverId`: 删除服务器 (需为 `OWNER`)。

### 4. 成员管理 (Server Members)
*Path: `/api/servers/:serverId/members`*

- `GET /`: 获取服务器的完整成员列表 (需为成员)。
- `DELETE /@me`: 当前用户主动离开服务器。
- `DELETE /:userId`: 将指定用户从服务器中移除 (需为 `OWNER`)。

### 5. 邀请 (Invites)
*Path 1: `/api/servers/:serverId/invites` (创建)
Path 2: `/api/invites` (接受/查询)*

- `POST /api/servers/:serverId/invites`: 创建邀请链接 (需为 `OWNER` 或有权限)。
- `GET /api/invites/:inviteCode`: 获取邀请链接详情（公开，但需认证）。
- `POST /api/invites/:inviteCode`: 接受邀请并加入服务器（需认证）。

### 6. 分组 (Categories)
*Path: `/api/servers/:serverId/categories` 和 `/api/categories/:categoryId`*

- `GET /api/servers/:serverId/categories`: 获取服务器下的所有分组。
- `POST /api/servers/:serverId/categories`: 创建分组 (需为 `OWNER` 或有权限)。
- `PATCH /api/categories/:categoryId`: 更新分组 (需为 `OWNER` 或有权限)。
- `DELETE /api/categories/:categoryId`: 删除分组 (需为 `OWNER` 或有权限)。

### 7. 频道 (Channels)
*Path: `/api/servers/:serverId/channels`*

- `GET /`: 获取服务器下的所有频道。
  - **响应更新**: 每个返回的频道对象现在额外包含 `lastMessage: IMessage | null` 和 `lastReadMessageId: ObjectId | null` 字段。
- `POST /`: 创建频道 (需为 `OWNER` 或有权限)。
- `PATCH /:channelId`: 更新频道 (需为 `OWNER` 或有权限)。
- `DELETE /:channelId`: 删除频道 (需为 `OWNER` 或有权限)。

### 8. 消息 (Messages)
*Path (服务器频道): `/api/servers/:serverId/channels/:channelId/messages`*
*Path (私聊频道): `/api/channels/:channelId/messages`*

- `GET /`: 获取消息列表 (Query: `limit`, `before`)
- `POST /`: 发送消息 (Body: `content`)
- `PATCH /:messageId`: 编辑消息 (Body: `content`)
- `DELETE /:messageId`: 删除消息。

### 9. 频道已读状态 (Channel Read State)
*Path (服务器频道): `/api/servers/:serverId/channels/:channelId/ack`*
*Path (私聊频道): `/api/channels/:channelId/ack`*

- `POST /`: 标记频道为已读 (Body: `{ lastMessageId: string }`)。此端点将用户的已读状态更新到指定的消息 ID。

### 10. 消息互动 (Reactions)
*Path: `/api/servers/:serverId/channels/:channelId/messages/:messageId/reactions`*

- `PUT /:emoji/@me`: 添加反应。
- `DELETE /:emoji/@me`: 移除反应。

### 11. Webhook 管理
*Path: `/api/servers/:serverId/channels/:channelId/webhooks`*

- `GET /`: 获取频道下的所有 Webhooks。
- `POST /`: 创建一个新的 Webhook (Body: `name`, `avatarUrl?`) -> 返回完整的 Webhook 对象，包括 `token`。
- `PATCH /:webhookId`: 更新 Webhook (Body: `name?`, `avatarUrl?`)。
- `DELETE /:webhookId`: 删除一个 Webhook。

### 12. Webhook 执行 (公开)
*Path: `/api/webhooks/:webhookId/:token`*

这是一个公开端点，不需要 `Authorization` 头。认证通过 URL 中的 `webhookId` 和 `token` 完成。

- `POST /`: 执行 Webhook 以发送消息。
    - Body: `{ "content": "...", "username": "..." (可选), "avatar_url": "..." (可选) }`
    - `username` 和 `avatar_url` 用于临时覆盖 Webhook 的默认名称和头像。

---



## 三、 WebSocket Gateway 设计

基于 **Socket.io** 实现，与 API 同端口。

### 1. 连接与鉴权

客户端连接时需在 `auth` 对象中传递 JWT Token。

```javascript
const socket = io("http://localhost:3000", {
  auth: { token: "..." }
});
```

**自动加入房间 (Auto-Join Rooms):**
连接成功后，服务端会自动将用户 Socket 加入其有权访问的所有频道房间 (`channel._id`) 和服务器房间 (`server._id`)。

### 2. 客户端上行事件 (Client -> Server)

-   `message/create`: 发送新消息 (Payload: `{ channelId, content, ... }`)

### 3. 服务端下行广播事件 (Server -> Client)

所有状态变更都会通过以下事件实时广播给相关房间的在线用户。

- **消息**: `MESSAGE_CREATE`, `MESSAGE_UPDATE` (编辑), `MESSAGE_DELETE` (删除), `MESSAGE_RETRACT` (撤回)
- **反应**: `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`
- **频道**: `CHANNEL_UPDATE`, `CHANNEL_DELETE`
- **私聊频道**: `DM_CHANNEL_CREATE`
    - 当一个用户向另一个用户发起新的私聊时，向接收方用户广播此事件，以便客户端可以动态添加新的私聊会话。
    - Payload: 完整的、已填充好 `recipients` 信息的频道对象。
- **服务器**: `SERVER_UPDATE`, `SERVER_DELETE`
- **分组**: `CATEGORY_UPDATE`, `CATEGORY_DELETE`
- **在线状态**:
    - `PRESENCE_INITIAL_STATE`: 客户端首次连接时，服务端单独发送给该客户端的事件，包含当前所有在线用户的ID数组。 (Payload: `string[]`)
    - `PRESENCE_UPDATE`: 当任何用户上线或下线时，向所有相关客户端广播的事件。 (Payload: `{ userId: string, status: 'online' | 'offline' }`)
