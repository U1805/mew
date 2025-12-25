import { describe, it, expect, beforeEach, vi } from 'vitest';
import UserModel from '../api/user/user.model';
import BotModel from '../api/bot/bot.model';
import { onlineUsers } from '../gateway/presence.service';

vi.mock('../gateway/events', () => ({
  socketManager: {
    getIO: vi.fn(() => ({ emit: vi.fn() })),
  },
}));

import { socketManager } from '../gateway/events';
import { syncBotUsersPresenceForServiceType } from './botPresenceSync';

describe('syncBotUsersPresenceForServiceType', () => {
  beforeEach(() => {
    onlineUsers.clear();
  });

  it('marks bot users online/offline and emits PRESENCE_UPDATE', async () => {
    const user = await UserModel.create({
      email: 'bot-presence@example.com',
      username: 'bot-presence',
      password: 'hashed',
      isBot: true,
    });

    await BotModel.create({
      ownerId: user._id,
      botUserId: user._id,
      name: 'Bot',
      accessToken: 'token',
      serviceType: 'my-service',
      dmEnabled: false,
      config: '{}',
    });

    const emit = vi.fn();
    vi.mocked(socketManager.getIO).mockReturnValue({ emit } as any);

    await syncBotUsersPresenceForServiceType('my-service', 'online');
    expect(onlineUsers.has(user._id.toString())).toBe(true);
    expect(emit).toHaveBeenCalledWith('PRESENCE_UPDATE', { userId: user._id.toString(), status: 'online' });

    await syncBotUsersPresenceForServiceType('my-service', 'offline');
    expect(onlineUsers.has(user._id.toString())).toBe(false);
    expect(emit).toHaveBeenCalledWith('PRESENCE_UPDATE', { userId: user._id.toString(), status: 'offline' });
  });
});

