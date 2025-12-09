---
sidebar_label: '数据模型'
---

# 📦 数据模型 (Data Structures)

为了方便理解，我们使用 TypeScript Interface 风格来描述核心对象。

## UserObject
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

## RoleObject
```typescript
interface Role {
  _id: string;
  name: string;
  serverId: string;
  permissions: string[]; // 权限键的数组
  color: string;
  position: number;
  isDefault: boolean; // 是否为 @everyone 角色
  createdAt: string;
  updatedAt: string;
}
```

## ServerMemberObject
```typescript
interface ServerMember {
  _id: string;
  serverId: string;
  userId: User; // 已填充(Populated)的用户对象
  roleIds: string[];
  isOwner: boolean;
  nickname?: string;
  createdAt: string;
  updatedAt: string;
}
```

## ChannelObject
```typescript
interface Channel {
  _id:string;
  type: "GUILD_TEXT" | "DM";
  name?: string;                     // 仅 GUILD_TEXT 有
  serverId?: string;                 // 仅 GUILD_TEXT 有
  categoryId?: string;               // 频道所属分组 ID
  position?: number;
  recipients?: User[];               // 仅 DM 有 (Populated)
  permissionOverrides?: Array<{       // 权限覆盖规则
    targetType: 'role' | 'member';
    targetId: string;
    allow: string[];
    deny: string[];
  }>;
  // 以下字段在获取频道列表时由后端动态计算并附加
  lastMessage?: Message;             // 该频道的最后一条消息
  lastReadMessageId?: string;        // 当前用户最后已读的消息 ID
  permissions?: string[];            // 当前用户在此频道的最终有效权限
}
```

## MessageObject
```typescript
interface Message {
  _id: string;
  channelId: string;
  authorId: User;          // 已填充(Populated)的用户详情
  type: string;            // e.g., 'message/default'
  content: string;
  payload?: Record<string, any>; // 附加数据
  attachments?: Array<{
    filename: string;
    contentType: string;
    url: string;
    size: number;
  }>;
  mentions?: string[]; // User ID 数组
  referencedMessageId?: string; // 回复的消息ID
  reactions?: Array<{
    emoji: string;
    userIds: string[];
  }>;
  // 状态时间戳
  createdAt: string;
  updatedAt: string;
  editedAt?: string;       // 如果被编辑过
  retractedAt?: string;    // 如果被撤回过
}
```
