---
sidebar_label: '数据模型'
sidebar_position: 10
title: '📦 API 数据模型'
description: '深入了解 API 返回的核心数据结构，包括用户、服务器、频道、消息等模型的详细字段说明与使用场景。'
---

# 📦 API 数据模型

为了帮助开发者更好地与 API 进行交互、构建应用或机器人，本文档详细描述了 **API 返回的核心数据结构 (JSON)**。

这些模型定义主要源于后端基于 Mongoose 的数据模型以及 Service/Controller 层处理后的实际返回值。理解这些模型是高效开发的关键。

:::info 通用约定
在阅读具体模型前，请了解以下通用约定：

- **ID 格式**: 所有 `ObjectId` 类型的主键（如 `_id`）在 HTTP/WebSocket 的 payload 中都会序列化为 **24 位的十六进制字符串**。
- **时间格式**: 所有时间戳字段（如 `createdAt`, `updatedAt`）在 JSON 响应中均为 **ISO 8601 格式的字符串** (e.g., `"2023-10-27T10:00:00.000Z"`)。
- **URL 补全**: 部分资源字段（如 `avatarUrl`）在数据库中可能仅存储为对象存储（S3）的 `key`。在通过 API 对外返回时，后端服务会自动将其“补全”为公开可访问的完整 URL。
:::

---

## 核心模型

这些是构成功能基础的最核心的数据结构。

### User (用户)

- **来源**: `server/src/api/user/user.model.ts`

为了优化性能和保护隐私，API 会根据场景返回不同详细程度的用户对象。

- **`UserRef` (用户引用)**: 这是最常见的用户对象形态，用于消息作者、频道成员列表等嵌入式场景，仅包含公开信息。
- **`UserMe` (当前用户信息)**: 当请求个人信息接口（如 `/api/users/@me`）时，会返回包含敏感信息的完整用户对象。

```ts title="TypeScript 定义"
// 用户引用，用于多数嵌入场景
export interface UserRef {
  _id: string;
  username: string;
  discriminator: string; // 用户标识符，用于区分同名用户
  avatarUrl?: string;
  isBot: boolean;
  dmEnabled?: boolean; // 仅 Bot 用户可能出现（例如用户搜索结果）
}

export interface UserNotificationSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0..1
  desktopEnabled: boolean;
}

// 完整的当前用户信息
export interface UserMe extends UserRef {
  email: string;
  notificationSettings?: UserNotificationSettings;
  createdAt: string;
  updatedAt: string;
}
```

**关键点说明**:
- 出于安全考虑，`password` 字段永远不会包含在任何 API 响应中。
- `email` 字段仅在获取个人信息时返回，不会出现在公开的用户引用中。
- `avatarUrl` 在返回时会被自动补全为可访问的公开 URL。

---

### Server (服务器/群组)

- **来源**: `server/src/api/server/server.model.ts`, `server/src/api/server/server.service.ts`

```ts title="TypeScript 定义"
export interface Server {
  _id: string;
  name: string;
  avatarUrl?: string;
  everyoneRoleId: string; // 默认的 @everyone 身份组 ID
  createdAt: string;
  updatedAt: string;
}
```

---

### Message (消息)

- **来源**: `server/src/api/message/message.model.ts`, `server/src/api/message/message.service.ts`

```ts title="TypeScript 定义"
export interface Attachment {
  filename: string;
  contentType: string;
  key: string; // S3 对象存储 key
  size: number;
  url?: string; // 对外返回时动态补全的公开 URL
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  _id: string;
  channelId: string;
  serverId?: string; // 仅服务器频道消息会附带
  authorId: UserRef | string; // API 返回时通常会填充为 UserRef 对象
  type: string; // 默认为 'message/default'
  content?: string;
  // 语音消息的纯文本（可由发送方提供或由 STT 写回）
  plainText?: string;
  // 用于 Bot/LLM 的统一纯文本上下文
  context?: string;
  payload?: MessagePayload; // 用于卡片消息等复杂结构
  attachments?: Attachment[];
  mentions?: string[]; // 提及的用户 ID 列表
  referencedMessageId?: string; // 回复的消息 ID
  reactions?: Reaction[];
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
  retractedAt?: string; // 撤回时间
}

export interface Embed {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
  mediaType?: string;
  contentType?: string;
  videos?: any[];
  favicons?: string[];
}

export interface VoicePayload {
  key: string;
  url?: string;
  contentType: string;
  size: number;
  durationMs?: number;
}

export interface MessagePayload {
  webhookName?: string;
  overrides?: { username?: string; avatarUrl?: string };
  embeds?: Embed[];
  sticker?: Sticker;
  voice?: VoicePayload;
  [key: string]: any;
}
```

**关键点说明**:
- `authorId` 在大多数情况下会被 `populate`（填充）为一个 `UserRef` 对象。
- `attachments` 数组中的每个对象的 `key` 字段会被后端补全为可访问的 `url`。
- 在服务器频道中，消息对象会额外附加 `serverId` 字段；DM 消息通常不包含该字段。
- Webhook 发送的消息，其作者信息（用户名、头像）可能会被 `payload.overrides` 中的内容覆盖后返回。

---

## 群组结构模型

这些模型定义了服务器内部的组织结构、成员关系和权限体系。

### Role (身份组)

- **来源**: `server/src/api/role/role.model.ts`, `server/src/constants/permissions.ts`

```ts title="TypeScript 定义"
export type Permission =
  | 'ADMINISTRATOR'
  | 'MANAGE_ROLES'
  | 'KICK_MEMBERS'
  | 'CREATE_INVITE'
  | 'MANAGE_SERVER'
  | 'MANAGE_STICKERS'
  | 'MANAGE_WEBHOOKS'
  | 'MANAGE_CHANNEL'
  | 'VIEW_CHANNEL'
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
  isDefault: boolean; // 是否为 @everyone 身份组
  createdAt: string;
  updatedAt: string;
}
```

---

### ServerMember (服务器成员)

- **来源**: `server/src/api/member/member.model.ts`, `server/src/api/member/member.service.ts`

```ts title="TypeScript 定义"
export interface ServerMember {
  _id: string;
  serverId: string;
  userId: UserRef | string; // 常见返回为已填充的 UserRef 对象
  roleIds: string[];
  isOwner: boolean;
  nickname?: string | null;
  notificationLevel?: 'ALL_MESSAGES' | 'MENTIONS_ONLY' | 'MUTE';
  createdAt: string;
  updatedAt: string;

  // 仅“Webhook 虚拟成员”会出现
  channelId?: string;
}
```

**关键点说明**:
- 获取服务器成员列表的接口，会额外合并由 Webhook 产生的“虚拟成员”。这类成员的 `userId` 会被构造成一个临时的 `UserRef` 对象，并附带 `channelId` 以标识其归属的频道。

---

### Category (频道分组)

- **来源**: `server/src/api/category/category.model.ts`

```ts title="TypeScript 定义"
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

### Channel (频道)

- **来源**: `server/src/api/channel/channel.model.ts`, `server/src/api/channel/channel.repository.ts`

```ts title="TypeScript 定义"
export type ChannelType = 'GUILD_TEXT' | 'GUILD_WEB' | 'DM';

export interface PermissionOverride {
  targetType: 'role' | 'member';
  targetId: string;
  allow: Permission[];
  deny: Permission[];
}

export interface Channel {
  _id: string;
  type: ChannelType;

  // GUILD_TEXT (服务器文本频道)
  name?: string;
  topic?: string;
  url?: string; // GUILD_WEB 频道地址
  serverId?: string;
  categoryId?: string | null;
  position?: number;
  permissionOverrides?: PermissionOverride[];

  // DM (私信频道)
  recipients?: UserRef[] | string[];

  createdAt: string;
  updatedAt: string;

  // 列表接口附加字段 (服务端聚合/计算而来)
  lastMessage?: Message | null;
  lastReadMessageId?: string | null;
  permissions?: Permission[]; // 对当前用户生效的最终权限
}
```

**关键点说明**:
- 调用频道列表接口时（无论是服务器频道还是私信列表），响应中的每个频道对象都会被动态附加 `lastMessage`、`lastReadMessageId` 和 `permissions` 字段。
- `Channel.type` 实际支持 `GUILD_TEXT`、`GUILD_WEB`、`DM` 三种类型；其中 `GUILD_WEB` 主要用于承载外部 URL（`url` 字段）。
- 私信频道的 `recipients` 字段通常会被填充为 `UserRef` 对象数组。

---

## 功能性模型

这些模型与特定的应用功能（如邀请、机器人等）紧密相关。

### Invite (邀请)

- **来源**: `server/src/api/invite/invite.service.ts#getInviteDetails`

这是获取邀请码详情时返回的预览对象。

```ts title="TypeScript 定义"
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

---

### Webhook

- **来源**: `server/src/api/webhook/webhook.model.ts`

```ts title="TypeScript 定义"
export interface Webhook {
  _id: string;
  name: string;
  avatarUrl?: string;
  channelId: string;
  serverId: string;
  token?: string; // 敏感信息，仅在创建/重置时返回
  botUserId: string;
  createdAt: string;
  updatedAt: string;
}
```

---

### Bot

- **来源**: `server/src/api/bot/bot.model.ts`, `server/src/api/bot/bot.service.ts`

```ts title="TypeScript 定义"
export interface Bot {
  _id: string;
  ownerId: string;
  botUserId?: string;
  name: string;
  avatarUrl?: string;
  serviceType: string;
  dmEnabled: boolean;
  config: string; // JSON 字符串
  createdAt: string;
  updatedAt: string;
  accessToken?: string; // 敏感信息，仅在创建/重置时返回
}
```

---

### Sticker / UserSticker (贴纸)

- **来源**: `server/src/api/sticker/*`, `server/src/api/userSticker/*`

贴纸分为两类：
- **服务器贴纸**：归属于某个 `serverId`，并通过 WebSocket 广播 `STICKER_*` 事件同步给同服务器用户。
- **个人贴纸**：归属于某个 `userId`（在 API 返回中表现为 `ownerId`）。

```ts title="TypeScript 定义"
export type StickerScope = 'server' | 'user';

export interface Sticker {
  _id: string;
  scope: StickerScope;
  serverId?: string;
  ownerId?: string;
  name: string;
  description?: string;
  format: 'png' | 'gif' | 'webp' | 'jpg';
  contentType: string;
  size: number;
  key?: string;
  url: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

:::info
贴纸的 `url` 字段在返回时会被补全为可直接访问的地址；数据库中存储的通常是 `key`。
:::

## 底层与内部模型

这些模型属于底层支持或内部逻辑，开发者通常不直接操作它们，但了解它们有助于理解系统行为。

### ServiceType (可用服务)

- **来源**: `server/src/api/infra/infra.controller.ts`

这是 `/api/infra/available-services` 接口的响应结构，用于展示当前可用的后端服务状态。

```ts title="TypeScript 定义"
export interface ServiceStatus {
  serviceType: string;
  serverName: string;
  icon: string;
  description: string;
  configTemplate: string;
  online: boolean;
  connections: number;
}

export interface AvailableServicesResponse {
  services: ServiceStatus[];
}
```

---

### ChannelReadState (频道已读状态)

- **来源**: `server/src/api/channel/readState.model.ts`

:::info 内部模型说明
`ChannelReadState` 是一个内部模型，不作为独立资源对外暴露。它的作用是记录每个用户对每个频道的已读位置。

- **影响**: 该模型的数据会直接决定频道列表接口返回的 `lastReadMessageId` 字段值。
- **更新**: 客户端通过调用频道 `ack` 接口来更新此状态，从而标记消息为已读。
:::

```ts title="TypeScript 定义"
export interface ChannelReadState {
  _id: string;
  userId: string;
  channelId: string;
  lastReadMessageId: string;
  createdAt: string;
  updatedAt: string;
}
```
