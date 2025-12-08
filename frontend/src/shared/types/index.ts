export interface User {
  _id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  isBot: boolean;
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
  permissions: string[];
  isDefault: boolean; // For @everyone
  serverId: string;
}

export interface ServerMember {
  _id: string;
  serverId: string;
  userId: User; // Populated user object
  roles?: Role[]; // Populated roles
  // role: 'OWNER' | 'MEMBER'; // Deprecated in favor of roles system, but keeping for now if needed
  role?: string; 
  isOwner?: boolean; // Explicit owner flag
  nickname?: string;
  createdAt: string;
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
  targetType: 'ROLE' | 'MEMBER';
  targetId: string;
  allow: string[];
  deny: string[];
}

export interface Channel {
  _id: string;
  name?: string;
  type: ChannelType;
  serverId?: string;
  categoryId?: string;
  recipients?: string[] | User[]; // Can be IDs or populated Users
  position?: number;
  lastMessage?: Message;
  lastReadMessageId?: string;
  permissionOverrides?: PermissionOverride[];
}

export interface Attachment {
  filename: string;
  contentType: string;
  url: string;
  size: number;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface MessagePayload {
  title?: string;
  summary?: string;
  url?: string;
  thumbnail_url?: string;
  [key: string]: any;
}

export interface Message {
  _id: string;
  channelId: string;
  authorId: User | string; // Populated or ID
  author?: User; // Helper for frontend if populated
  type: string;
  content: string;
  payload?: MessagePayload;
  attachments?: Attachment[];
  mentions?: string[];
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
  token: string;
  botUserId: string;
}