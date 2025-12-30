---
sidebar_label: 'WebSocket API'
sidebar_position: 30
title: ⚡️ WebSocket API
---

实时通信能力是基于 `WebSocket` (通过 `Socket.IO` 实现) 构建的，负责在客户端和服务端之间高效地推送状态变更。

## 核心定位

:::info 设计理念
API 设计遵循**职责分离**的原则：

- **WebSocket (Socket.IO)**: 专注于**实时推送**。当状态发生变化时（如新消息、频道更新、用户在线状态变更），服务端会通过 WebSocket 主动将事件推送给客户端。
- **REST API**: 负责处理**资源操作**（CRUD）。所有常规的创建、读取、更新、删除操作都应通过 REST API 完成，因为它包含完整的权限校验、数据验证和业务处理链路。

为了简化客户端实现，我们也提供了一个轻量级的 `message/create` 上行事件，但请注意其与 REST API 在校验上的差异（详见下文）。
:::

## 默认网关地址

- **本地开发环境**: `http://localhost:3000` (直连 Node.js 服务)
- **Docker Compose 部署**: `http://localhost` (通过 Nginx 反向代理，路径为 `/socket.io`)

## 认证方式

客户端在发起连接时，需要通过 `auth.token` 字段传入用户的 `JWT`。

服务端认证逻辑参见: `server/src/gateway/middleware.ts`。

## 连接示例

你可以使用 `socket.io-client` 库来连接到网关。

```ts title="client/main.ts"
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: '<YOUR_JWT_TOKEN>',
  },
  // 优先使用 WebSocket，但在不支持的环境中允许回退到轮询
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('成功连接到网关');
});

socket.on('ready', () => {
  console.log('网关准备就绪，已成功加入所有房间');
});

socket.on('disconnect', (reason) => {
  console.log(`连接断开: ${reason}`);
});
```

## 房间与广播策略

当用户成功连接后，服务端会自动将其加入到相关的房间（Room）中，以便进行精准的事件广播。

核心逻辑参见: `server/src/gateway/handlers.ts`

- **频道房间 (`channelId`)**: 用户所在的所有服务器频道和私信（DM）频道。
- **服务器房间 (`serverId`)**: 用户加入的所有服务器。
- **个人房间 (`userId`)**: 每个用户独有的房间，用于接收定向推送的事件。

:::info 广播封装
业务层代码通过 `socketManager` 来发送事件，无需直接操作 `socket.io` 实例。
- `socketManager.broadcast(event, roomId, payload)`: 向指定房间广播。
- `socketManager.broadcastToUser(userId, event, payload)`: 向指定用户定向推送。
:::


---

## 服务端下行事件

### 连接与在线状态

| 事件名                 | Payload                                               | 触发时机                               |
| ---------------------- | ----------------------------------------------------- | -------------------------------------- |
| `ready`                | `void`                                                | 连接成功并加入所有房间后。             |
| `PRESENCE_INITIAL_STATE` | `string[]` (在线用户的 userId 列表)                    | `ready` 事件后，下发初始在线用户列表。   |
| `PRESENCE_UPDATE`      | `{ userId: string, status: 'online' \| 'offline' }` | 有用户上线或下线时（全局广播）。       |

### 消息事件

广播至 `channelId` 房间

| 事件名                    | Payload                           | 描述                         |
| ------------------------- | --------------------------------- | ---------------------------- |
| `MESSAGE_CREATE`          | `Message` (完整消息对象)          | 新消息创建                   |
| `MESSAGE_UPDATE`          | `Message` (更新后的消息对象)      | 消息被编辑、撤回或链接预览生成 |
| `MESSAGE_REACTION_ADD`    | `Message` (更新后的消息对象)      | 消息回应增加                 |
| `MESSAGE_REACTION_REMOVE` | `Message` (更新后的消息对象)      | 消息回应移除                 |

:::info 私信 (DM) 场景
为避免事件重复（用户同时在 DM 频道房间和个人房间），DM 相关的消息事件会直接定向推送到通信双方的 `userId` 个人房间。
:::

### 频道与分组事件

广播至 `serverId` 房间

| 事件名            | Payload                                  |
| ----------------- | ---------------------------------------- |
| `CHANNEL_UPDATE`  | `Channel` (更新后的频道对象)             |
| `CHANNEL_DELETE`  | `{ channelId: string, serverId: string }`|
| `CATEGORY_UPDATE` | `Category` (更新后的分组对象)            |
| `CATEGORY_DELETE` | `{ categoryId: string }`                 |

### DM 频道事件

广播至 `userId` 房间

| 事件名              | Payload                          |
| ------------------- | -------------------------------- |
| `DM_CHANNEL_CREATE` | `Channel` (包含 `recipients` 字段) |

### 服务器与权限事件

| 事件名               | Payload                                                       | 广播范围                                                 |
| -------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `SERVER_UPDATE`      | `Server` (更新后的服务器对象)                                 | 对应 `serverId` 房间                                     |
| `SERVER_DELETE`      | `{ serverId: string }`                                        | 对应 `serverId` 房间                                     |
| `SERVER_KICK`        | `{ serverId: string }`                                        | 被踢用户的 `userId` 个人房间                             |
| `MEMBER_JOIN`        | `{ serverId: string, userId: string }`                        | 对应 `serverId` 房间                                     |
| `MEMBER_LEAVE`       | `{ serverId: string, userId: string }`                        | 对应 `serverId` 房间                                     |
| `PERMISSIONS_UPDATE` | `{ serverId: string, channelId?: string, userId?: string }` | 主要广播至 `serverId` 房间，部分场景会定向推送到 `userId` |
