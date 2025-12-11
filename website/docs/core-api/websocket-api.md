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
  },
  transports: ['websocket'] // 建议指定 transport
});

socket.on("connect", () => {
  console.log("Connected with ID:", socket.id);
});
```

## 客户端上行事件 (Client -> Server)

| 事件名 | 触发时机 | Payload 类型 |
| :--- | :--- | :--- |
| `message/create` | 客户端通过 WebSocket 发送新消息时 | `{ channelId: string, content: string, attachments?: Attachment[] }` |

## 服务端下行事件 (Server -> Client)

| 事件名 | 触发时机 | Payload 类型 |
| :--- | :--- | :--- |
| `ready` | 客户端连接、认证并加入所有房间后，服务器发送此事件表示就绪 | `void` |
| `PRESENCE_INITIAL_STATE` | `ready` 事件后，服务器下发当前所有在线用户的 ID 列表 | `string[]` (userIds) |
| `PRESENCE_UPDATE` | 用户上线或下线时 | `{ userId: string, status: 'online' \| 'offline' }` |
| **消息事件 (Message Events)** | | |
| `MESSAGE_CREATE` | 创建新消息时（包括用户消息和 Webhook 消息） | `MessageObject` (完整的消息对象) |
| `MESSAGE_UPDATE` | 消息被编辑或撤回（删除）时 | `MessageObject` (更新后的完整消息对象) |
| `MESSAGE_REACTION_ADD` | 有人添加回应时 | `MessageObject` (更新后的完整消息对象) |
| `MESSAGE_REACTION_REMOVE` | 有人取消回应时 | `MessageObject` (更新后的完整消息对象) |
| **频道与分组事件 (Channel & Category Events)** | | |
| `CHANNEL_UPDATE` | 服务器频道信息变更（如名称、所属分组） | `ChannelObject` |
| `CHANNEL_DELETE` | 服务器频道被删除 | `{ channelId: string, serverId: string }` |
| `DM_CHANNEL_CREATE`| 收到新的私信频道时 (仅发送给相关用户) | `ChannelObject` (包含 `recipients` 数组) |
| `CATEGORY_UPDATE`| 分组信息变更（如名称、位置） | `CategoryObject` |
| `CATEGORY_DELETE`| 分组被删除 | `{ categoryId: string }` |
| **服务器与成员事件 (Server & Member Events)** | | |
| `SERVER_UPDATE` | 服务器信息变更（如名称、头像） | `ServerObject` |
| `SERVER_DELETE` | 你所在的服务器被删除时 | `{ serverId: string }` |
| `SERVER_KICK` | 你被踢出服务器时 (仅发送给被踢者) | `{ serverId: string }` |
| `MEMBER_LEAVE` | 有成员离开服务器时 (广播给服务器内其他成员)| `{ serverId: string, userId: string }` |
| `PERMISSIONS_UPDATE` | 服务器或频道的权限结构发生变化时。例如：角色权限变更、成员角色变更、频道权限覆盖变更。 | `{ serverId: string, channelId?: string, userId?: string }` |