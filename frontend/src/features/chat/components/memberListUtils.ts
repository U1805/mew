import type { ServerMember } from '../../../shared/types';

const getMemberUserKey = (member: ServerMember) => member.userId?._id ?? member._id;

/**
 * The backend may return webhook bot users twice:
 * - as a real server member (no `channelId`)
 * - as a virtual "webhook member" (with `channelId`)
 *
 * Member list should only show webhook members belonging to the current channel.
 */
export const filterMembersForChannel = (
  members: ServerMember[],
  currentChannelId: string | null
): ServerMember[] => {
  if (!Array.isArray(members) || members.length === 0) return [];

  const webhookBotUserIds = new Set<string>();
  for (const member of members) {
    const userId = member.userId?._id;
    if (userId && member.channelId) webhookBotUserIds.add(userId);
  }

  const filtered = members.filter(member => {
    const userId = member.userId?._id;
    if (!userId) return true;

    if (!webhookBotUserIds.has(userId)) return true;

    // Webhook bots: only show the member for the active channel.
    return !!currentChannelId && member.channelId === currentChannelId;
  });

  // Dedupe by userId (or fallback id), preferring channel-scoped entries.
  const byUser = new Map<string, ServerMember>();
  for (const member of filtered) {
    const key = getMemberUserKey(member);
    const existing = byUser.get(key);
    if (!existing) {
      byUser.set(key, member);
      continue;
    }

    const existingHasChannel = !!existing.channelId;
    const incomingHasChannel = !!member.channelId;

    if (!existingHasChannel && incomingHasChannel) {
      byUser.set(key, member);
    } else if (existingHasChannel && incomingHasChannel && currentChannelId) {
      // If both are channel-scoped (unexpected), prefer the one matching current channel.
      if (existing.channelId !== currentChannelId && member.channelId === currentChannelId) {
        byUser.set(key, member);
      }
    }
  }

  return Array.from(byUser.values());
};

