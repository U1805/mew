import type { PermissionOverride } from '../../../shared/types';

export const CHANNEL_PERMS = [
  {
    group: 'General',
    perms: [{ id: 'MANAGE_CHANNEL', name: 'Manage Channel' }],
  },
  {
    group: 'Text',
    perms: [
      { id: 'SEND_MESSAGES', name: 'Send Messages' },
      { id: 'EMBED_LINKS', name: 'Embed Links' },
      { id: 'ATTACH_FILES', name: 'Attach Files' },
      { id: 'ADD_REACTIONS', name: 'Add Reactions' },
      { id: 'READ_MESSAGE_HISTORY', name: 'Read Message History' },
    ],
  },
] as const;

export type PermissionState = 'allow' | 'deny' | 'inherit';

export interface DisplayOverride {
  id: string;
  targetId: string;
  type: 'role' | 'member';
  name: string;
  color?: string;
  avatarUrl?: string;
  allow: Set<string>;
  deny: Set<string>;
}

export const makeEmptyOverride = (target: { targetId: string; targetType: 'role' | 'member' }): PermissionOverride => ({
  targetId: target.targetId,
  targetType: target.targetType,
  allow: [],
  deny: [],
});
