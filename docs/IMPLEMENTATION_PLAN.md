# Mew - 即时通讯平台实现规划 (v2 - 同步代码)

**最后更新时间: 2025-11-28**

本文档详细描述了 Mew 即时通讯（IM）平台核心功能的**当前实现**，旨在作为前端开发的权威技术蓝图。本文档已与后端代码库同步。

## 一、 数据模型设计 (MongoDB Schema)

所有模型都自动包含 `createdAt` 和 `updatedAt` 时间戳字段。

### 1. User (用户)

存储用户信息和认证凭据。

```typescript
{
  _id: ObjectId,
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false }, // 不会在查询中默认返回
  avatarUrl: String,
  isBot: { type: Boolean, default: false },
  createdAt: Date,
  updatedAt: Date
}
```
**注意**: 认证 `token` 是在登录时动态生成的，不会存储在数据库中。

### 2. Server (服务器)

代表一个服务器实例。

```typescript
{
  _id: ObjectId,
  name: { type: String, required: true },
  avatarUrl: String, // 服务器头像 URL
  ownerId: { type: ObjectId, ref: 'User', required: true },
  createdAt: Date,
  updatedAt: Date
}
```

### 3. Category (分组)

服务器内的频道分组。

```typescript
{
  _id: ObjectId,
  name: { type: String, required: true },
  serverId: { type: ObjectId, ref: 'Server', required: true },
  position: Number, // 可选，用于排序
  createdAt: Date,
  updatedAt: Date
}
```

### 4. Channel (频道)

消息发生的场所，分为服务器频道和私聊。

```typescript
export enum ChannelType {
  GUILD_TEXT = 'GUILD_TEXT',
  DM = 'DM',
}

{
  _id: ObjectId,
  name: String, // 私聊时可为空
  type: { type: String, enum: ['GUILD_TEXT', 'DM'], required: true },
  serverId: { type: ObjectId, ref: 'Server' }, // 私聊时为空
  categoryId: { type: ObjectId, ref: 'Category' }, // 可选
  recipients: [{ type: ObjectId, ref: 'User' }], // 仅用于私聊
  position: Number, // 可选，用于排序
  createdAt: Date,
  updatedAt: Date
}
```

### 5. Message (消息)

核心消息数据结构。

```typescript
// 内嵌 Schema 定义
const AttachmentSchema = {
  filename: string,
  contentType: string,
  url: string,
  size: number
};

const ReactionSchema = {
  emoji: string,
  userIds: [ObjectId] // 点了这个 reaction 的所有用户 ID
};

{
  _id: ObjectId,
  channelId: { type: ObjectId, ref: 'Channel', required: true },
  authorId: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, default: 'message/default' },
  content: { type: String, required: true }, // 降级纯文本
  payload: Object, // 用于自定义渲染的结构化数据
  attachments: [AttachmentSchema],
  mentions: [{ type: ObjectId, ref: 'User' }],
  referencedMessageId: { type: ObjectId, ref: 'Message' }, // 引用的消息
  reactions: [ReactionSchema],
  editedAt: Date, // 消息编辑时间
  createdAt: Date,
  updatedAt: Date
}
```

---

## 二、 RESTful API 设计

**基础URL**: `/api`
**认证**: 除特殊说明外，所有 API 均需在请求头中提供 `Authorization: Bearer <TOKEN>`。

### 认证 (`/auth`)

- `POST /auth/register` (公开)
  - **描述**: 注册新用户。
  - **请求体**: `{"username": "string", "email": "string", "password": "string"}`

- `POST /auth/login` (公开)
  - **描述**: 用户登录，获取 JWT。
  - **请求体**: `{"email": "string", "password": "string"}`
  - **响应**: `{"token": "string"}`

### 用户 (`/users`)

- `GET /users/@me`
  - **描述**: 获取当前认证用户的信息。

- `GET /users/@me/servers`
  - **描述**: 获取当前用户拥有的所有服务器列表。

- `POST /users/@me/channels`
  - **描述**: 创建或获取一个与其他用户的私聊(DM)频道。
  - **请求体**: `{"recipientId": "string"}`

### 服务器 (`/servers`)

- `POST /servers`
  - **描述**: 创建一个新服务器。
  - **请求体**: `{"name": "string", "avatarUrl": "string" (optional)}`

- `GET /servers/:serverId`
  - **描述**: 获取指定服务器的详细信息。

- `PATCH /servers/:serverId`
  - **描述**: 更新服务器信息。
  - **请求体**: `{"name": "string" (optional), "avatarUrl": "string" (optional)}`

- `DELETE /servers/:serverId`
  - **描述**: 删除一个服务器。

### 分组 (`/servers/:serverId/categories` 和 `/categories/:categoryId`)

- `POST /servers/:serverId/categories`
  - **描述**: 在指定服务器下创建新分组。
  - **请求体**: `{"name": "string"}`

- `PATCH /categories/:categoryId`
  - **描述**: 更新分组信息。
  - **请求体**: `{"name": "string" (optional)}`

- `DELETE /categories/:categoryId`
  - **描述**: 删除一个分组。

### 频道 (`/servers/:serverId/channels`)

- `POST /servers/:serverId/channels`
  - **描述**: 在指定服务器下创建新频道。
  - **请求体**: `{"name": "string", "type": "GUILD_TEXT", "categoryId": "string" (optional)}`

- `PATCH /servers/:serverId/channels/:channelId`
  - **描述**: 更新频道信息。
  - **请求体**: `{"name": "string" (optional), "categoryId": "string" (optional)}`

- `DELETE /servers/:serverId/channels/:channelId`
  - **描述**: 删除一个频道。

### 消息 (`/servers/:serverId/channels/:channelId/messages`)

- `GET /`
  - **描述**: 获取频道的消息列表，支持分页。
  - **查询参数**:
    - `limit` (number, 1-100, default: 50)
    - `before` (string, 消息ID, 用于获取此ID之前的消息)

- `POST /`
  - **描述**: 发送一条新消息。
  - **请求体**: `{"content": "string", ...}` (其他字段如 `payload` 待定)

- `PATCH /:messageId`
  - **描述**: 编辑一条已发送的消息。
  - **请求体**: `{"content": "string"}`

- `DELETE /:messageId`
  - **描述**: 删除一条消息。

### 消息交互 (`.../messages/:messageId/reactions`)

- `PUT /:messageId/reactions/:emoji/@me`
  - **描述**: 为消息添加一个 Reaction。
  - **`:emoji`** 参数需要进行 URL 编码。

- `DELETE /:messageId/reactions/:emoji/@me`
  - **描述**: 移除一个 Reaction。
  - **`:emoji`** 参数需要进行 URL 编码。

---

## 三、 WebSocket Gateway 设计

WebSocket 通信基于标准的 Socket.io 事件模型，取代了原计划中复杂的 op-code 协议。

### 1. 连接与认证

- 客户端在建立连接后，必须通过 `auth` 选项传递有效的 JWT。
  ```javascript
  const socket = io("http://localhost:3000", {
    auth: {
      token: "YOUR_JWT_TOKEN"
    }
  });
  ```
- 服务器认证成功后，会自动将该用户加入其所属的所有**服务器房间**和**频道房间**，以便接收相关事件。

### 2. 事件命名

采用 `feature/action` 的格式，如 `message/create`。

### 3. 核心事件

#### 客户端 -> 服务器

- `message/create`
  - **描述**: 客户端请求创建一条新消息。
  - **数据包**: `{"channelId": "string", "content": "string", ...}`

#### 服务器 -> 客户端

- `message/create`
  - **描述**: 通知客户端有新消息创建。
  - **数据包**: 完整的消息对象 (IMessage)。

- `message/update`
  - **描述**: 通知客户端消息被编辑。
  - **数据包**: 部分更新的消息对象，至少包含 `_id`, `channelId`,和被修改的字段。

- `message/delete`
  - **描述**: 通知客户端消息被删除。
  - **数据包**: `{"messageId": "string", "channelId": "string"}`

- `channel/create`, `channel/update`, `channel/delete`
- `server/update`, `server/delete`
- `reaction/add`, `reaction/remove`

**注意**: 这是一个简化的实现，后续会根据需求添加更多事件。
