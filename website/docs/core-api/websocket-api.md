---
sidebar_label: 'WebSocket API'
---

# ⚡️ WebSocket API

实时事件流是 Mew 体验的核心。

## 连接 (Connection)
使用 `socket.io-client` 进行连接。

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: {
    token: "your_jwt_token_here" // 必须提供
  }
});

socket.on("connect", () => {
  console.log("Connected with ID:", socket.id);
});
```

## 客户端上行事件 (Client -> Server)

| 事件名 | 触发时机 | Payload 类型 |
| :--- | :--- | :--- |
| `message/create` | 客户端发送新消息时 | `{ channelId, content, ... }` |

## 服务端下行事件 (Server -> Client)

| 事件名 | 触发时机 | Payload 类型 |
| :--- | :--- | :--- |
| `PRESENCE_INITIAL_STATE` | 连接成功后，服务器下发当前所有在线用户的 ID 列表 | `string[]` (userIds) |
| `PRESENCE_UPDATE` | 用户上线/下线 | `{ userId: string, status: 'online' \| 'offline' }` |
| **消息事件** | | |
| `MESSAGE_CREATE` | 有新消息时 | `MessageObject` |
| `MESSAGE_UPDATE` | 消息被编辑、删除或撤回时 | `Partial<MessageObject>` |
| `MESSAGE_REACTION_ADD` | 有人添加回应时 | `{ channelId, messageId, reaction: Reaction }` |
| `MESSAGE_REACTION_REMOVE` | 有人取消回应时 | `{ channelId, messageId, reaction: Reaction }` |
| **频道事件** | | |
| `CHANNEL_UPDATE` | 服务器频道信息变更 | `ChannelObject` |
| `CHANNEL_DELETE` | 服务器频道被删除 | `{ channelId: string, serverId: string }` |
| `DM_CHANNEL_CREATE`| 收到新的私信频道时 | `ChannelObject` |
| **分组事件** | | |
| `CATEGORY_UPDATE`| 分组信息变更 | `CategoryObject` |
| `CATEGORY_DELETE`| 分组被删除 | `{ categoryId: string, serverId: string }` |
| **服务器/权限事件** | | |
| `SERVER_UPDATE` | 服务器信息变更 | `ServerObject` |
| `SERVER_DELETE` | 你所在的服务器被删除时 | `{ serverId: string }` |
| `SERVER_KICK` | 你被踢出服务器时 (仅发送给被踢者) | `{ serverId: string }` |
| `MEMBER_LEAVE` | 有成员离开服务器时 (广播给其他成员)| `{ serverId: string, userId: string }` |
| `PERMISSIONS_UPDATE` | 角色、成员角色或频道权限覆盖发生变化时 | `{ serverId: string }` |
