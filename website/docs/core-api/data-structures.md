---
sidebar_label: '数据模型'
---

# 📦 数据模型 (Data Structures)

为了方便理解，我们使用 TypeScript Interface 风格来描述核心对象。

## UserObject
用户对象代表一个独立的用户账户。

```typescript
interface User {
  _id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  isBot: boolean;
  createdAt: string; // ISO 8601 Timestamp
  updatedAt: string;
}
```

## ServerObject
服务器对象，即社区或群组。

```typescript
interface Server {
  _id: string;
  name: string;
  avatarUrl?: string;
  everyoneRoleId: string; // 默认 "@everyone" 角色 ID
  createdAt: string;
  updatedAt: string;
}
```

## CategoryObject
频道分类对象，用于在服务器内组织频道。

```typescript
interface Category {
  _id: string;
  name: string;
  serverId: string;
  position?: number;
  createdAt: string;
  updatedAt: string;
}
```

## RoleObject
角色对象，定义了一组权限。

```typescript
interface Role {
  _id: string;
  name: string;
  serverId: string;
  permissions: string[]; // 权限标识符的数组
  color: string;         // Hex 色值
  position: number;      // 用于层级排序，数字越大，层级越高
  isDefault: boolean;    // 标记是否为 @everyone 角色
  createdAt: string;
  updatedAt: string;
}
```

## ServerMemberObject
服务器成员对象，代表用户与服务器的关联关系。

```typescript
interface ServerMember {
  _id: string;
  serverId: string;
  userId: User;          // 已填充(Populated)的用户对象
  roleIds: string[];
  isOwner: boolean;
  nickname?: string;
  channelId?: string;    // 仅用于代表 Webhook 的虚拟成员
  createdAt: string;
  updatedAt: string;
}
```

## ChannelObject
频道对象，可以是服务器内的文本频道或私信频道。

```typescript
interface Channel {
  _id: string;
  type: "GUILD_TEXT" | "DM";
  name?: string;                     // 仅 GUILD_TEXT 类型拥有
  serverId?: string;                 // 仅 GUILD_TEXT 类型拥有
  categoryId?: string;               // 频道所属分组 ID
  position?: number;
  recipients?: User[];               // 仅 DM 类型拥有 (Populated)
  permissionOverrides?: Array<{       // 权限覆盖规则
    targetType: 'role' | 'member';
    targetId: string;
    allow: string[];
    deny: string[];
  }>;
  createdAt: string;
  updatedAt: string;

  // --- 以下字段在获取频道列表时由后端动态计算并附加 ---
  lastMessage?: Message;             // 该频道的最后一条消息
  lastReadMessageId?: string;        // 当前用户最后已读的消息 ID
  permissions?: string[];            // 当前用户在此频道的最终有效权限
}
```

## MessageObject
消息对象，是通信的基本单元。

```typescript
interface Message {
  _id: string;
  channelId: string;
  authorId: User;          // 已填充(Populated)的用户对象
  type: string;            // e.g., 'message/default', 'app/x-rss-card'
  content: string;
  payload?: Record<string, any>; // 用于自定义消息类型的附加数据
  attachments?: Array<{
    filename: string;
    contentType: string;
    key: string;           // S3 对象存储中的唯一键
    size: number;
    url?: string;          // 由后端根据 key 动态生成，不存储于数据库
  }>;
  mentions?: string[];     // 被提及用户的 User ID 数组
  referencedMessageId?: string; // 回复的消息 ID
  reactions?: Array<{
    emoji: string;
    userIds: string[];
  }>;
  createdAt: string;
  updatedAt: string;
  editedAt?: string;       // 消息被编辑的时间戳
  retractedAt?: string;    // 消息被撤回的时间戳
}
```

## InviteObject
邀请链接对象，用于邀请用户加入服务器。

```typescript
interface Invite {
  code: string;
  uses: number;
  maxUses: number;
  expiresAt?: string;
  server: {                // API 返回时填充的服务器信息
    _id: string;
    name: string;
    avatarUrl?: string;
    memberCount: number;   // 动态计算的成员数量
  };
}
```

## WebhookObject
Webhook 对象，允许外部服务向频道发送消息。

```typescript
interface Webhook {
  _id: string;
  name: string;
  avatarUrl?: string;
  channelId: string;
  serverId: string;
  token: string;           // 用于公开执行 Webhook 的令牌
  botUserId: string;       // 关联的机器人用户 ID
  createdAt: string;
  updatedAt: string;
}
```