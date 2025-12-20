---
sidebar_label: '数据模型'
sidebar_position: 10
---

# 📦 数据模型（Data Structures）

本文档描述 **API 对外返回的对象形态**（JSON）。实现来源主要来自后端 Mongoose 模型与 service/controller 的实际返回值。

通用约定：

- `ObjectId` 在 HTTP/WebSocket payload 中表现为 `string`（24 位十六进制）。
- `createdAt/updatedAt/editedAt/...` 在 JSON 中表现为 ISO 字符串。
- 部分字段在数据库中存储为 **S3 key**，对外返回时会被“补全”为可访问 URL（详见下文说明）。

---

## User

来源：`server/src/api/user/user.model.ts`

```ts
export interface User {
  _id: string;
  email: string;
  username: string;
  isBot: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

说明：

- `password` 不会出现在响应里（Mongoose `select: false`）。
- `avatarUrl` 在服务端内部通常存储为对象存储的 `key`；多数对外响应会将其补全为公开 URL（见 `server/src/utils/s3.ts#getS3PublicUrl`）。

---

## Server

来源：`server/src/api/server/server.model.ts` 与 `server/src/api/server/server.service.ts`

```ts
export interface Server {
  _id: string;
  name: string;
  avatarUrl?: string;
  everyoneRoleId: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## Role

来源：`server/src/api/role/role.model.ts`、`server/src/constants/permissions.ts`

```ts
export type Permission =
  | 'ADMINISTRATOR'
  | 'MANAGE_ROLES'
  | 'KICK_MEMBERS'
  | 'CREATE_INVITE'
  | 'MANAGE_SERVER'
  | 'MANAGE_WEBHOOKS'
  | 'MANAGE_CHANNEL'
  | 'SEND_MESSAGES'
  | 'MANAGE_MESSAGES'
  | 'ADD_REACTIONS'
  | 'ATTACH_FILES'
  | 'MENTION_EVERYONE';

export interface Role {
  _id: string;
  serverId: string;
  name: string;
  permissions: Permission[];
  color: string;
  position: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## ServerMember

来源：`server/src/api/member/member.model.ts` 与 `server/src/api/member/member.service.ts`

```ts
export interface ServerMember {
  _id: string;
  serverId: string;
  userId: User | string; // 常见返回为已填充对象
  roleIds: string[];
  isOwner: boolean;
  nickname?: string | null;
  createdAt: string;
  updatedAt: string;

  // 仅“Webhook 虚拟成员”会出现（member 列表接口会合并返回）
  channelId?: string;
}
```

说明：

- 服务器成员列表接口会额外合并“Webhook 虚拟成员”（见 `server/src/api/member/webhookMember.service.ts`），其 `userId` 会被伪造为 `{ isBot: true, username: <webhook name>, ... }`，并附带 `channelId` 以标识归属频道。

---

## Category

来源：`server/src/api/category/category.model.ts`

```ts
export interface Category {
  _id: string;
  serverId: string;
  name: string;
  position?: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## Channel

来源：`server/src/api/channel/channel.model.ts` 与 `server/src/api/channel/channel.repository.ts`

```ts
export type ChannelType = 'GUILD_TEXT' | 'DM';

export interface PermissionOverride {
  targetType: 'role' | 'member';
  targetId: string;
  allow: Permission[];
  deny: Permission[];
}

export interface Channel {
  _id: string;
  type: ChannelType;

  // GUILD_TEXT
  name?: string;
  serverId?: string;
  categoryId?: string | null;
  position?: number;
  permissionOverrides?: PermissionOverride[];

  // DM
  recipients?: Array<Pick<User, '_id' | 'username' | 'avatarUrl'> & Partial<Pick<User, 'email' | 'isBot'>>>;

  createdAt: string;
  updatedAt: string;

  // 列表接口附加字段（服务端聚合/计算而来）
  lastMessage?: Message | null;
  lastReadMessageId?: string | null;
  permissions?: Permission[]; // 对当前用户生效的最终权限
}
```

说明：

- 服务器频道列表 `GET /api/servers/:serverId/channels` 会为每个频道附加 `lastMessage/lastReadMessageId/permissions`。
- DM 列表 `GET /api/users/@me/channels` 同样会附加 `lastMessage/lastReadMessageId/permissions`，并将 `recipients` 填充为用户对象数组。

---

## ChannelReadState（内部模型）

来源：`server/src/api/channel/readState.model.ts`

该模型不直接作为独立资源对外暴露，但其数据会影响频道列表中的 `lastReadMessageId`，并可通过 `ack` 接口更新。

```ts
export interface ChannelReadState {
  _id: string;
  userId: string;
  channelId: string;
  lastReadMessageId: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## Message

来源：`server/src/api/message/message.model.ts` 与 `server/src/api/message/message.service.ts`

```ts
export interface Attachment {
  filename: string;
  contentType: string;
  key: string; // 上传返回的对象存储 key（会被补全为 url）
  size: number;
  url?: string; // 对外返回时动态补全
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  _id: string;
  channelId: string;

  // API 返回通常会 populate authorId（只包含部分字段）
  authorId: Pick<User, '_id' | 'username' | 'avatarUrl' | 'isBot'> | string;

  type: string; // 默认 message/default
  content?: string;
  payload?: Record<string, any>;
  attachments?: Attachment[];
  mentions?: string[];
  referencedMessageId?: string;
  reactions?: Reaction[];

  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  retractedAt?: string;
}
```

说明：

- 后端会对 `attachments[].key` 进行 URL 补全，写入 `attachments[].url`（见 `server/src/api/message/message.service.ts`）。
- Webhook 消息会在 `payload.overrides` 中携带“展示覆盖信息”（见 `server/src/api/webhook/webhook.service.ts`），后端会在返回前应用覆盖（例如替换 `authorId.username/avatarUrl`）。

---

## Invite（邀请预览响应）

来源：`server/src/api/invite/invite.service.ts#getInviteDetails`

```ts
export interface InvitePreview {
  code: string;
  uses: number;
  maxUses?: number;
  expiresAt?: string;
  server: {
    _id: string;
    name: string;
    avatarUrl?: string;
    memberCount: number;
  };
}
```

说明：

- 该预览响应当前不会对 `server.avatarUrl` 做 URL 补全（以实现为准）。

---

## Webhook

来源：`server/src/api/webhook/webhook.model.ts`

```ts
export interface Webhook {
  _id: string;
  name: string;
  avatarUrl?: string;
  channelId: string;
  serverId: string;
  token: string;
  botUserId: string;
  createdAt: string;
  updatedAt: string;
}
```
