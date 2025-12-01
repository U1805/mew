
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
  ownerId: string;
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

export interface Channel {
  _id: string;
  name?: string;
  type: ChannelType;
  serverId?: string;
  categoryId?: string;
  recipients?: string[] | User[]; // Can be IDs or populated Users
  position?: number;
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

export interface LoginResponse {
  token: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User | null, remember?: boolean) => void;
  logout: () => void;
}