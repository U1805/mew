import { describe, it, expect } from 'vitest';
import type { ServerMember, User } from '../../../shared/types';
import { filterMembersForChannel } from './memberListUtils';

const makeUser = (overrides: Partial<User>): User => ({
  _id: overrides._id ?? 'u1',
  username: overrides.username ?? 'user',
  email: overrides.email ?? 'user@example.com',
  avatarUrl: overrides.avatarUrl,
  isBot: overrides.isBot ?? false,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
});

const makeMember = (overrides: Partial<ServerMember>): ServerMember => ({
  _id: overrides._id ?? 'm1',
  serverId: overrides.serverId ?? 's1',
  userId: overrides.userId ?? makeUser({ _id: 'u1' }),
  roleIds: overrides.roleIds ?? [],
  channelId: overrides.channelId,
  isOwner: overrides.isOwner ?? false,
  nickname: overrides.nickname,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

describe('filterMembersForChannel', () => {
  it('shows only current channel webhook members and hides server-level duplicates', () => {
    const webhookBotUserId = 'bot-webhook-1';

    const members: ServerMember[] = [
      // Real server member entry for webhook bot (no channelId) - should be hidden.
      makeMember({
        _id: 'mem-webhook-plain',
        userId: makeUser({ _id: webhookBotUserId, username: 'WH', isBot: true }),
      }),
      // Virtual webhook member for channel c1 - should be shown.
      makeMember({
        _id: 'wh-c1',
        channelId: 'c1',
        userId: makeUser({ _id: webhookBotUserId, username: 'WH c1', isBot: true }),
      }),
      // Another webhook in channel c2 - should not be shown in c1.
      makeMember({
        _id: 'wh-c2',
        channelId: 'c2',
        userId: makeUser({ _id: 'bot-webhook-2', username: 'WH c2', isBot: true }),
      }),
      // Regular bot (not a webhook) - should be shown everywhere.
      makeMember({
        _id: 'mem-bot',
        userId: makeUser({ _id: 'bot-regular', username: 'Regular Bot', isBot: true }),
      }),
    ];

    const result = filterMembersForChannel(members, 'c1');
    const ids = result.map(m => m._id).sort();

    expect(ids).toEqual(['mem-bot', 'wh-c1'].sort());
    expect(result.find(m => m._id === 'wh-c1')?.channelId).toBe('c1');
  });

  it('hides all webhook members when no channel is selected', () => {
    const webhookBotUserId = 'bot-webhook-1';
    const members: ServerMember[] = [
      makeMember({
        _id: 'mem-webhook-plain',
        userId: makeUser({ _id: webhookBotUserId, username: 'WH', isBot: true }),
      }),
      makeMember({
        _id: 'wh-c1',
        channelId: 'c1',
        userId: makeUser({ _id: webhookBotUserId, username: 'WH c1', isBot: true }),
      }),
      makeMember({
        _id: 'mem-human',
        userId: makeUser({ _id: 'human-1', username: 'Alice', isBot: false }),
      }),
    ];

    const result = filterMembersForChannel(members, null);
    expect(result.map(m => m._id)).toEqual(['mem-human']);
  });

  it('dedupes by user and prefers the entry matching current channel', () => {
    const members: ServerMember[] = [
      makeMember({
        _id: 'wh-c2',
        channelId: 'c2',
        userId: makeUser({ _id: 'bot-webhook-1', username: 'WH c2', isBot: true }),
      }),
      makeMember({
        _id: 'wh-c1',
        channelId: 'c1',
        userId: makeUser({ _id: 'bot-webhook-1', username: 'WH c1', isBot: true }),
      }),
    ];

    const result = filterMembersForChannel(members, 'c1');
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe('wh-c1');
  });
});

