import { Permission } from '../constants/permissions';

export type NotificationLevel = 'ALL_MESSAGES' | 'MENTIONS_ONLY' | 'MUTE';
export type ChannelNotificationLevel = 'DEFAULT' | NotificationLevel;

export interface UserNotificationSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0..1
  desktopEnabled: boolean;
}

export interface User {
  _id: string;
  username: string;
  discriminator?: string;
  email: string;
  avatarUrl?: string;
  isBot: boolean;
  dmEnabled?: boolean;
  notificationSettings?: UserNotificationSettings;
  createdAt: string;
}

export interface Server {
  _id: string;
  name: string;
  avatarUrl?: string;
  ownerId?: string; // Kept for compatibility if needed, though mostly derived from members now
  memberCount?: number;
}

export interface Role {
  _id: string;
  name: string;
  color: string;
  position: number;
  permissions: Permission[];
  isDefault: boolean; // For @everyone
  serverId: string;
}

export interface ServerMember {
  _id: string;
  serverId: string;
  userId: User; // Populated user object
  roleIds?: string[]; // Corrected: The server actually returns roleIds
  channelId?: string; // Optional, primarily for virtual webhook members
  isOwner?: boolean; // Explicit owner flag
  nickname?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invite {
  code: string;
  serverId: string;
  server?: { // Populated or partial server info for preview
      _id: string;
      name: string;
      avatarUrl?: string;
      memberCount?: number;
  };
  creatorId: string;
  uses: number;
  maxUses: number;
  expiresAt?: string;
}

export interface Category {
  _id: string;
  name: string;
  serverId: string;
  position?: number;
}

export enum ChannelType {
  GUILD_TEXT = 'GUILD_TEXT',
  DM = 'DM',
}

export interface PermissionOverride {
  targetType: 'role' | 'member';
  targetId: string;
  allow: string[];
  deny: string[];
}

export interface Channel {
  _id: string;
  name?: string;
  topic?: string;
  type: ChannelType;
  serverId?: string;
  categoryId?: string;
  recipients?: string[] | User[]; // Can be IDs or populated Users
  position?: number;
  lastMessage?: Message;
  lastReadMessageId?: string;
  permissionOverrides?: PermissionOverride[];
  permissions?: string[]; // Effective permissions for the current user in this channel
}

export interface Attachment {
  filename: string;
  contentType: string;
  url: string;
  size: number;
  key?: string;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
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

export interface Sticker {
  _id: string;
  scope: 'server' | 'user';
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

export interface MessagePayload {
  webhookName?: string;
  title?: string;
  summary?: string;
  url?: string;
  thumbnail_url?: string;
  s3_thumbnail_url?: string;
  preview_url?: string;
  s3_preview_url?: string;
  overrides?: {
    username?: string;
    avatarUrl?: string;
  };
  embeds?: Embed[];
  sticker?: Sticker;
  voice?: {
    key: string;
    url?: string;
    contentType: string;
    size: number;
    durationMs?: number;
  };
  [key: string]: any;
}

export interface Message {
  _id: string;
  channelId: string;
  serverId?: string;
  authorId: User | string; // Populated or ID
  author?: User; // Helper for client if populated
  type: string;
  content: string;
  payload?: MessagePayload;
  attachments?: Attachment[];
  mentions?: (string | User)[];
  referencedMessageId?: string;
  reactions?: Reaction[];
  editedAt?: string;
  retractedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Webhook {
  _id: string;
  name: string;
  avatarUrl?: string;
  channelId: string;
  serverId: string;
  token?: string;
  botUserId: string;
}

export interface Bot {
  _id: string;
  ownerId: string;
  name: string;
  avatarUrl?: string;
  accessToken?: string;
  serviceType: string;
  dmEnabled: boolean;
  config?: string; // JSON String
  createdAt: string;
  updatedAt: string;
}
