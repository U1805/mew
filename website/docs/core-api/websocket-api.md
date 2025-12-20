---
sidebar_label: 'WebSocket API'
sidebar_position: 30
---

# ⚡️ WebSocket API（Socket.IO）

默认网关地址：

- `http://localhost:3000`

定位：

- WebSocket（Socket.IO）负责“状态变化”的实时推送（新消息、频道更新、权限变化等）。
- 资源型 CRUD 仍通过 REST API 完成（见 [`core-api/rest-api`](./rest-api.md)）。

认证方式：

- 连接时通过 `auth.token` 传入 JWT（见 `server/src/gateway/middleware.ts`）。

数据结构参考：

- [`core-api/data-structures`](./data-structures.md)

---

## 连接示例

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: '<jwt>' },
  transports: ['websocket'],
});

socket.on('ready', () => {
  console.log('gateway ready');
});
```

---

## 房间（Rooms）与广播策略

服务端会在连接后将用户加入以下房间（见 `server/src/gateway/handlers.ts`）：

- `channelId`：用户可达的所有频道（服务器频道与 DM）
- `serverId`：用户加入的所有服务器
- `userId`：个人房间（用于定向事件）

业务层广播封装见 `server/src/gateway/events.ts`：

- `socketManager.broadcast(event, roomId, payload)`：向某个房间广播
- `socketManager.broadcastToUser(userId, event, payload)`：向个人房间定向发送

---

## 客户端上行事件（Client → Server）

### `message/create`

用于通过 WebSocket 发送消息（见 `server/src/gateway/handlers.ts`）。

```ts
type MessageCreatePayload = {
  channelId: string;
  content?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    key: string;
    size: number;
  }>;

  // 以下字段在当前实现中会被透传到 createMessage（是否使用取决于业务）
  type?: string;
  payload?: Record<string, any>;
};
```

说明：

- 服务端会把 `authorId` 强制设置为当前连接用户。
- 当前 `message/create` 未像 REST 那样使用 Zod 校验与 `authorizeChannel('SEND_MESSAGES')` 中间件；请以代码实现为准。

---

## 服务端下行事件（Server → Client）

### 连接与在线状态

| 事件名 | Payload | 触发 |
|---|---|---|
| `ready` | `void` | 连接完成、加入房间后 |
| `PRESENCE_INITIAL_STATE` | `string[]`（userIds） | 连接后下发当前在线用户集合 |
| `PRESENCE_UPDATE` | `{ userId: string, status: 'online' \| 'offline' }` | 有用户上下线 |

> `PRESENCE_UPDATE` 是全局广播（`io.emit`），不按房间区分（见 `server/src/gateway/handlers.ts`）。

### 消息事件（频道房间：`channelId`）

| 事件名 | Payload |
|---|---|
| `MESSAGE_CREATE` | `Message` |
| `MESSAGE_UPDATE` | `Message`（编辑/撤回后） |
| `MESSAGE_REACTION_ADD` | `Message`（更新后的完整对象） |
| `MESSAGE_REACTION_REMOVE` | `Message`（更新后的完整对象） |

补充说明：

- DM 场景下，`MESSAGE_CREATE` 除了广播到 `channelId` 房间外，还会定向发送到每个收件人的 `userId` 个人房间，以提高可靠性（见 `server/src/api/message/message.service.ts`）。

### 频道与分组事件（服务器房间：`serverId`）

| 事件名 | Payload |
|---|---|
| `CHANNEL_UPDATE` | `Channel` |
| `CHANNEL_DELETE` | `{ channelId: string, serverId: string }` |
| `CATEGORY_UPDATE` | `Category` |
| `CATEGORY_DELETE` | `{ categoryId: string }` |

### DM 频道事件（个人房间：`userId`）

| 事件名 | Payload |
|---|---|
| `DM_CHANNEL_CREATE` | `Channel`（包含 `recipients`） |

### 服务器与权限事件（服务器房间/个人房间）

| 事件名 | Payload | 广播范围 |
|---|---|---|
| `SERVER_UPDATE` | `Server` | `serverId` 房间 |
| `SERVER_DELETE` | `{ serverId: string }` | `serverId` 房间 |
| `SERVER_KICK` | `{ serverId: string }` | 被踢用户的 `userId` 房间 |
| `MEMBER_LEAVE` | `{ serverId: string, userId: string }` | `serverId` 房间 |
| `PERMISSIONS_UPDATE` | `{ serverId: string, channelId?: string, userId?: string }` | `serverId` 房间；部分场景也会定向发给 `userId` |
