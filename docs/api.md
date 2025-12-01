# Mew - 即时通讯平台实现规划

**最后更新时间: 2025-12-02**

本文档详细描述了 Mew 即时通讯（IM）平台核心功能的**当前实现**，旨在作为前端开发的权威技术蓝图。本文档已与后端代码库 (`backend/src`) 同步。

## 一、 数据模型设计 (MongoDB Schema)

所有模型都自动包含 `createdAt` 和 `updatedAt` 时间戳字段。

### 1. User (用户)

存储用户信息和认证凭据。

```typescript
{
  _id: ObjectId,
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false }, // API 默认不返回
  avatarUrl: String,
  isBot: { type: Boolean, default: false }, // 区分机器人账号
  createdAt: Date,
  updatedAt: Date
}
```

### 2. Server (服务器)

代表一个服务器实例（类似于 Discord 的 Guild）。

```typescript
{
  _id: ObjectId,
  name: { type: String, required: true },
  avatarUrl: String,
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
  position: Number, // 可选，用于UI排序
  createdAt: Date,
  updatedAt: Date
}
```

### 4. Channel (频道)

消息发生的场所。

```typescript
// 类型枚举
enum ChannelType {
  GUILD_TEXT = 'GUILD_TEXT', // 服务器文字频道
  DM = 'DM',                 // 私聊频道
}

{
  _id: ObjectId,
  name: String, // DM 类型时通常为空或自动生成
  type: { type: String, enum: ['GUILD_TEXT', 'DM'], required: true },
  serverId: { type: ObjectId, ref: 'Server' }, // 仅 GUILD_TEXT 有
  categoryId: { type: ObjectId, ref: 'Category' }, // 仅 GUILD_TEXT 有
  recipients: [{ type: ObjectId, ref: 'User' }], // 仅 DM 有
  position: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### 5. Message (消息)

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
  _id: ObjectId,
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
  createdAt: Date,
  updatedAt: Date
}
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
- `GET /@me/servers`: 获取当前用户拥有的服务器列表。
- `POST /@me/channels`: 创建或获取私聊(DM)频道。
    - Body: `{ recipientId: string }`

### 3. 服务器 (Servers)
*Path: `/api/servers`*

- `POST /`: 创建服务器 (Body: `name`, `avatarUrl?`)
- `GET /:serverId`: 获取服务器详情。
- `PATCH /:serverId`: 更新服务器信息。
- `DELETE /:serverId`: 删除服务器（级联删除内含的频道和消息）。

### 4. 分组 (Categories)
*Path: `/api/servers/:serverId/categories` and `/api/categories/:categoryId`*

- `GET /api/servers/:serverId/categories`: 获取指定服务器下的所有分组。
- `POST /api/servers/:serverId/categories`: 在服务器下创建分组 (Body: `name`).
- `PATCH /api/categories/:categoryId`: 更新分组 (Body: `name?`, `position?`).
- `DELETE /api/categories/:categoryId`: 删除分组。

### 5. 频道 (Channels)
*Path 1: `/api/servers/:serverId/channels` (创建)*
*Path 2: `/api/servers/:serverId/channels/:channelId` (操作)*
*(注：操作路径中保留 serverId 是为了路由挂载方便，虽然 ID 唯一)*

- `GET /`: 获取当前服务器下的所有频道。
- `POST /`: 创建频道 (Body: `name`, `type`, `categoryId?`)
- `PATCH /:channelId`: 更新频道 (Body: `name?`, `categoryId?`).
- `DELETE /:channelId`: 删除频道。

### 6. 消息 (Messages)
*Path: `/api/servers/:serverId/channels/:channelId/messages`*
*(注：私聊消息路径逻辑上不含 serverId，但在当前路由挂载下统一处理，后续可能优化)*

- `GET /`: 获取消息列表。
    - Query: `limit` (默认 50), `before` (消息ID，用于分页加载旧消息)
- `POST /`: 发送消息 (Body: `content`)
- `PATCH /:messageId`: 编辑消息 (Body: `content`)
- `DELETE /:messageId`: 删除消息。

### 7. 消息互动 (Reactions)
*Path: `/api/servers/:serverId/channels/:channelId/messages/:messageId/reactions`*

- `PUT /:emoji/@me`: 添加反应 (Emoji 需 URL 编码)。
- `DELETE /:emoji/@me`: 移除反应。

---

## 三、 WebSocket Gateway 设计

基于 **Socket.io** 实现。
URL: `http://domain:port` (与 API 同端口)

### 1. 连接与鉴权

客户端连接时必须在握手阶段传递 JWT Token：

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: {
    token: "eyJhbGciOi..." // 你的 JWT Token
  },
  transports: ['websocket']
});
```

**自动加入房间 (Auto-Join Rooms):**
连接成功后，服务端会自动将 Socket 加入以下房间，无需客户端手动 emit join 事件：
1.  用户作为接收者的所有 **DM Channel ID** 房间。
2.  用户拥有的所有 **Server ID** 房间（用于接收服务器级更新）。
3.  用户拥有的服务器下的所有 **Channel ID** 房间。

### 2. 客户端上行事件 (Client -> Server)

客户端可以通过 Socket 发送消息（也可以通过 REST API 发送，效果相同）。

目前主要通过此事件发送消息。

-   `message/create`
    -   **Payload**: `{ channelId: string, content: string, referencedMessageId?: string }`
    -   **说明**: 客户端发送新消息。服务端收到后会创建消息，并向频道房间广播一个同名的下行事件。

### 3. 服务端下行广播事件 (Server -> Client)

所有通过 REST API 或 Socket 产生的状态变更，都会通过以下事件实时广播给相关房间的在线用户。事件命名采用 **SCREAMING_SNAKE_CASE**。

#### 消息相关
-   `MESSAGE_CREATE`
    -   Data: `IMessage` (已 Populate authorId)
    -   *触发*: 发送新消息（通过 REST API 或 WebSocket）。
-   `MESSAGE_UPDATE`
    -   Data: `IMessage` (已 Populate)
    -   *触发*: 编辑消息内容。
-   `MESSAGE_DELETE`
    -   Data: `{ messageId: string, channelId: string }`
    -   *触发*: 删除消息。
-   `MESSAGE_REACTION_ADD`
    -   Data: `IMessage` (包含更新后的 reactions 数组)
    -   *触发*: 用户添加反应。
-   `MESSAGE_REACTION_REMOVE`
    -   Data: `IMessage` (包含更新后的 reactions 数组)
    -   *触发*: 用户取消反应。

#### 频道相关
-   `CHANNEL_UPDATE`
    -   Data: `IChannel`
    -   *触发*: 重命名频道、移动分组等。
-   `CHANNEL_DELETE`
    -   Data: `{ channelId: string }`
    -   *触发*: 删除频道。

#### 服务器相关
-   `SERVER_UPDATE`
    -   Data: `IServer`
    -   *触发*: 修改服务器名称/头像。
-   `SERVER_DELETE`
    -   Data: `{ serverId: string }`
    -   *触发*: 解散服务器。

#### 分组相关
-   `CATEGORY_UPDATE`
    -   Data: `ICategory`
    -   *触发*: 重命名分组、移动分组位置。
-   `CATEGORY_DELETE`
    -   Data: `{ categoryId: string }`
    -   *触发*: 删除分组。
```