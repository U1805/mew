---
sidebar_label: '核心平台设计'
---

# 🏛️ 核心平台设计

Mew 平台是整个生态系统的基石。它不直接参与具体的业务逻辑（如爬取推特或生成式 AI 回复），而是专注于提供一个**实时、持久化、高并发**的消息总线。

本章将深入剖析支撑 Mew 运行的三大支柱：**数据模型**、**消息协议**与**通信接口**。

---

## 2.1 数据库架构

Mew 使用 **MongoDB** 作为主存储。虽然它是 NoSQL 数据库，但我们采用了**“关系型引用”**的设计模式。除了极少数强耦合数据（如消息中的附件），我们尽量避免深层嵌套，而是通过 `ObjectId` 进行关联，以确保数据的一致性和查询的灵活性。

### 实体关系图

```mermaid
erDiagram
    User ||--o{ ServerMember : "joins"
    User ||--o{ Message : "sends"
    Server ||--|{ ServerMember : "has"
    Server ||--|{ Channel : "contains"
    Server ||--|{ Role : "defines"
    Channel ||--|{ Message : "stores"
    Channel }|--|| Category : "belongs to"

    User {
        ObjectId _id
        string username
        string email
    }
    Server {
        ObjectId _id
        string name
        ObjectId ownerId
    }
    Channel {
        ObjectId _id
        string type
        string name
    }
    Message {
        ObjectId _id
        string content
        string type
        object payload
    }
```

### 集合定义

以下定义使用 TypeScript 接口描述数据的存储形态（Schema）。

#### 👤 用户与鉴权
**`users`**
系统中的全局身份实体，包含人类用户和 Bot 用户。
```typescript
// Collection: servers
{
  _id: ObjectId,
  name: String,       // 服务器名称
  avatarUrl: String,  // 服务器图标 URL (可选)
  everyoneRoleId: ObjectId, // @everyone 默认角色的ID (ref: roles)
  createdAt: Date,
  updatedAt: Date
}
```

#### 🏰 服务器与组织
**`servers`**
最高层级的数据容器，类似于 Discord 的 Guild。
```typescript
// Collection: roles
{
  _id: ObjectId,
  name: String,               // 角色名称
  serverId: ObjectId,         // 所属服务器ID (ref: servers)
  permissions: [String],      // 权限字符串列表
  color: String,              // 角色颜色
  position: Number,           // 角色位置，用于层级判断
  isDefault: Boolean,         // 是否为 @everyone 角色
  createdAt: Date,
  updatedAt: Date
}
```

**`serverMembers`**
关联表，记录 `User` 与 `Server` 的多对多关系及在特定服务器内的属性。
```typescript
// Collection: serverMembers
{
  _id: ObjectId,
  serverId: ObjectId, // 所属服务器ID (ref: servers)
  userId: ObjectId,   // 用户ID (ref: users)
  roleIds: [ObjectId],// 拥有的角色ID列表 (ref: roles)
  isOwner: Boolean,   // 是否为服务器所有者
  nickname: String,   // 在该服务器的昵称 (可选)
  createdAt: Date,
  updatedAt: Date
}
```

#### 💬 频道与消息
**`categories`**
用于组织服务器内的频道。
```typescript
// Collection: categories
{
  _id: ObjectId,
  name: String,         // 分类名称
  serverId: ObjectId,   // 所属服务器ID (ref: servers)
  position: Number,     // 分类位置 (可选)
  createdAt: Date,
  updatedAt: Date
}
```
**`channels`**
通信的基本单元。
```typescript
// Collection: channels
{
  _id: ObjectId,
  name: String,               // 频道名称 (服务器频道)
  type: String,               // 类型: 'GUILD_TEXT' 或 'DM'
  serverId: ObjectId,         // 所属服务器ID (ref: servers, 仅 GUILD_TEXT)
  categoryId: ObjectId,       // 所属分类ID (ref: categories, 仅 GUILD_TEXT)
  recipients: [ObjectId],     // 参与者ID列表 (ref: users, 仅 DM)
  position: Number,           // 频道位置 (可选)
  permissionOverrides: [      // 频道级权限覆盖
    {
      targetType: String,     // 'role' 或 'member'
      targetId: ObjectId,
      allow: [String],
      deny: [String]
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

**`messages`**
核心资产。此集合数据量最大，设计上针对查询进行了深度优化。
```typescript
// Collection: messages
{
  _id: ObjectId,
  channelId: ObjectId,        // 所属频道ID (ref: channels)
  authorId: ObjectId,         // 发送者ID (ref: users)
  type: String,               // 消息类型，默认为 'message/default'
  content: String,            // 纯文本内容，作为降级方案
  payload: Object,            // 结构化数据，用于前端自定义渲染
  attachments: [              // 附件列表
    {
      filename: String,
      contentType: String,
      url: String,
      size: Number
    }
  ],
  mentions: [ObjectId],       // @ 的用户ID列表
  referencedMessageId: ObjectId, // 回复的消息ID (ref: messages)
  reactions: [                // 表情回应
    {
      emoji: String,
      userIds: [ObjectId]
    }
  ],
  editedAt: Date,             // 消息编辑时间
  retractedAt: Date,          // 消息撤回时间
  createdAt: Date,
  updatedAt: Date
}
```
> **性能提示**: `channelId` 和 `createdAt` 字段已建立索引以优化历史消息查询。`content` 字段已建立文本索引以支持搜索。

**`webhooks`**
用于外部服务向频道内发送消息。
```typescript
// Collection: webhooks
{
  _id: ObjectId,
  name: String,
  avatarUrl: String,
  channelId: ObjectId, // 目标频道 (ref: channels)
  serverId: ObjectId,  // 所属服务器 (ref: servers)
  token: String,       // 用于认证的随机令牌
  botUserId: ObjectId, // 关联的机器人用户ID (ref: users)
  createdAt: Date,
  updatedAt: Date
}
```

---

## 2.2 消息协议

Mew 的核心竞争力在于其**“多态消息协议”**。我们不限制消息必须是文本，它也可以是 RSS 卡片、代码片段甚至是一个交互式的小程序。

### 协议结构
每一条消息都是一个携带了“渲染指令”的数据包。

| 字段 | 类型 | 必填 | 描述 |
| :--- | :--- | :--- | :--- |
| **`type`** | `string` | ✅ | **MIME-like 类型标识**。告诉前端：“请用这个组件来渲染我”。例如: `message/default`, `app/x-rss-card`, `app/x-github-pr` |
| **`content`** | `string` | ✅ | **优雅降级**。消息的纯文本表示。如果客户端不支持上述 `type` 的渲染器，或者用户正在使用纯文本终端，将显示此字段。 |
| **`payload`** | `object` | ❌ | **渲染数据**。包含前端组件渲染所需的所有结构化数据。 |

### 🌟 示例：一条 RSS 卡片消息

```json
{
  "_id": "ObjectId(...)",
  "channelId": "ObjectId(...)",
  "authorId": {
    "_id": "ObjectId(...)",
    "username": "Mew酱",
    "avatarUrl": "url_to_avatar.png"
  },
  "type": "app/x-rss-card",
  "content": "[文章] OpenAI 发布新模型...",
  "payload": {
    "title": "OpenAI 发布新模型",
    "summary": "这是一个重要的里程碑，它将改变...",
    "url": "https://example.com/news/123",
    "thumbnail_url": "https://.../image.png"
  },
  "createdAt": "2023-10-27T10:00:00Z"
}
```

**前端渲染伪代码**:
```javascript
const MessageRenderer = ({ msg }) => {
  // 1. 尝试查找对应类型的插件
  const Plugin = pluginRegistry.get(msg.type);
  
  // 2. 如果存在插件，将 payload 喂给它
  if (Plugin) {
    return <Plugin data={msg.payload} />;
  }
  
  // 3. 否则，回退到默认文本渲染
  return <TextBubble>{msg.content}</TextBubble>;
};
```

---

## 2.3 通信接口

Mew 采用 **Hybrid 通信模式**：WebSocket 负责低延迟的实时事件推送，REST API 负责标准的资源 CRUD 操作。

### 🔌 WebSocket (Socket.io)
*   **Endpoint**: `/`
*   **Auth**: Handshake `auth: { token: "JWT_HERE" }`

#### 服务端广播事件

| 事件名 | 描述 | 触发场景 |
| :--- | :--- | :--- |
| `MESSAGE_CREATE` | 新消息 | 用户或 Bot 发送消息时。包含完整消息对象。 |
| `MESSAGE_UPDATE` | 消息变更 | 消息被编辑。客户端应在本地通过 ID 更新内容。 |
| `MESSAGE_DELETE` | 消息撤回 | 消息被物理删除或标记为撤回。 |
| `PRESENCE_UPDATE` | 状态变更 | 好友上线、下线或切换状态（如“忙碌”）。 |
| `CHANNEL_UPDATE` | 频道变更 | 频道名称、权限或描述发生变化。 |
| `PERMISSIONS_UPDATE` | 权限重算 | 用户的角色发生变动，需强制刷新前端权限缓存。 |

### 🌐 REST API
所有 API 均位于 `/api` 命名空间下。

#### 资源层级概览
```text
/api
├── /auth               # 🔐 登录与注册
├── /users
│   └── /@me            # 👤 当前用户上下文
├── /servers            # 🏰 服务器管理
│   ├── /:id/channels   # 📺 频道管理
│   ├── /:id/roles      # 🛡️ 角色管理
│   └── /:id/members    # 👥 成员管理
├── /channels
│   └── /:id/messages   # 💬 消息发送、查询与编辑
└── /webhooks           # 🪝 外部集成入口
```

> **💡 开发提示**: 详细的 API 字段定义和 Swagger 文档，请启动后端服务后访问 `/api-docs`。