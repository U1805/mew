# Mew - 即时通讯平台实现规划

本文档详细描述了 Mew 即时通讯（IM）平台核心功能的实现方案，旨在作为后续开发工作的技术蓝图。方案严格遵循 `PROJECT.md` 中定义的愿景，专注于构建一个稳定、可靠且高度可扩展的 IM 核心。

## 一、 数据模型设计 (MongoDB Schema)

采用 Mongoose 设计，以下是核心实体的 Schema 定义。

### 1. User (用户)

```typescript
{
  _id: ObjectId,
  username: { type: String, required: true, unique: true },
  avatarUrl: String,
  isBot: { type: Boolean, default: false },
  token: { type: String, required: true }, // Encrypted
  createdAt: Date,
  updatedAt: Date
}
```

### 2. Server (服务器)

```typescript
{
  _id: ObjectId,
  name: { type: String, required: true },
  avatarUrl: String, // 服务器头像 URL
  ownerId: { type: ObjectId, ref: 'User' },
  createdAt: Date
}
```

### 3. Category (分组)

```typescript
{
  _id: ObjectId,
  name: { type: String, required: true },
  serverId: { type: ObjectId, ref: 'Server' },
  position: Number,
  createdAt: Date
}
```

### 4. Channel (频道)

```typescript
{
  _id: ObjectId,
  name: String, // Nullable for DM
  type: { type: String, enum: ['GUILD_TEXT', 'DM'], required: true },
  serverId: { type: ObjectId, ref: 'Server' }, // Nullable for DM
  categoryId: { type: ObjectId, ref: 'Category' },
  recipients: [{ type: ObjectId, ref: 'User' }], // For DM
  position: Number,
  createdAt: Date
}
```

### 5. Message (消息)

```typescript
{
  _id: ObjectId,
  channelId: { type: ObjectId, ref: 'Channel', required: true },
  authorId: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, default: 'message/default' },
  content: { type: String, required: true }, // Fallback text
  payload: Object, // Structured data for custom rendering
  attachments: [AttachmentSchema],
  mentions: [{ type: ObjectId, ref: 'User' }],
  referencedMessageId: { type: ObjectId, ref: 'Message' },
  reactions: [ReactionSchema],
  createdAt: Date,
  editedAt: Date
}
```

**内嵌 Schemas:**

*   **Attachment**: `{ filename, contentType, url, size }`
*   **Reaction**: `{ emoji, userIds: [ObjectId] }`

---

## 二、 RESTful API 设计

除特殊说明外，所有 API 均需通过 `Authorization: Bearer <TOKEN>` 进行认证。

- **认证 (公开访问)**
  - `POST /auth/login`: 用户登录以获取认证 Token。此接口本身不需要认证。

- **用户 (`/users`)**
  - `GET /@me`
  - `GET /:userId`

- **服务器 (`/servers`)**
  - `GET /`
  - `POST /` (请求体现在可以包含 `avatarUrl`)
  - `GET /:serverId`
  - `PATCH /:serverId` (请求体现在可以包含 `avatarUrl`)
  - `DELETE /:serverId`

- **频道 (`/channels`, `/servers/:serverId/channels`)**
  - `GET /servers/:serverId/channels`
  - `POST /channels` (创建服务器频道或 DM)
  - `GET /:channelId`
  - `PATCH /:channelId`
  - `DELETE /:channelId`

- **消息 (`/channels/:channelId/messages`)**
  - `GET /` (支持 `limit`, `before` 分页)
  - `GET /:messageId`
  - `POST /`
  - `PATCH /:messageId`
  - `DELETE /:messageId`

- **消息交互 (`.../messages/:messageId/reactions`)**
  - `PUT /:emoji/@me`
  - `DELETE /:emoji/@me`

---

## 三、 WebSocket Gateway 设计

实时通信的核心协议。

### 1. 数据包结构

```json
{
  "op": Number,    // Opcode
  "d": Object,     // Data
  "t": String      // Event Name (for op: 0)
}
```

### 2. 操作码 (Opcodes)

| Code | Name          | Direction        | Description          |
| :--- | :------------ | :--------------- | :------------------- |
| 0    | Dispatch      | Server -> Client | 接收一个事件         |
| 1    | Heartbeat     | Client -> Server | 客户端维持连接       |
| 2    | Identify      | Client -> Server | 客户端认证           |
| 10   | Hello         | Server -> Client | 包含心跳间隔         |
| 11   | Heartbeat ACK | Server -> Client | 确认收到心跳         |

### 3. 核心事件 (Events for `op: 0`)

*   `READY`: 认证成功，下发初始状态。
*   `MESSAGE_CREATE`: 新消息。
*   `MESSAGE_UPDATE`: 消息编辑。
*   `MESSAGE_DELETE`: 消息删除。
*   `CHANNEL_CREATE`, `CHANNEL_UPDATE`, `CHANNEL_DELETE`
*   `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`

---

## 四、 项目结构规划

项目采用 Monorepo 结构进行管理，以提高代码复用性并简化依赖管理。根目录包含 `frontend`, `backend`, 和 `bots` 三个主要的工作区。

```
mew/
├── frontend/               # React 前端应用
│   ├── ...
│   └── package.json
│
├── backend/                # Express 后端应用 (IM 核心)
│   ├── src/
│   │   ├── api/              # RESTful API (Routes, Controllers, Middlewares, Validators)
│   │   ├── gateway/          # WebSocket Gateway (Manager, Handlers, Events)
│   │   ├── models/           # Mongoose 数据模型
│   │   ├── services/         # 业务逻辑层
│   │   ├── config/           # 配置管理
│   │   ├── utils/            # 通用工具函数
│   │   ├── app.ts            # Express 应用主入口
│   │   └── server.ts         # 服务器启动脚本
│   ├── .env.example
│   └── package.json
│
├── bots/                   # Bot 服务 (未来实现)
│   ├── ...
│   └── package.json
│
├── package.json              # Monorepo 根 package.json (使用 pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```
