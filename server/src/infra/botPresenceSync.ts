import Bot from '../api/bot/bot.model';
import { socketManager } from '../gateway/events';
import { addUserOnline, removeUserOnline } from '../gateway/presence.service';

type PresenceStatus = 'online' | 'offline';

const botsQueryForServiceType = (serviceType: string) => {
  if (serviceType === 'rss-fetcher') {
    return { $or: [{ serviceType }, { serviceType: { $exists: false } }] };
  }
  return { serviceType };
};

export const syncBotUsersPresenceForServiceType = async (serviceType: string, status: PresenceStatus) => {
  const bots = await Bot.find(botsQueryForServiceType(serviceType)).select('botUserId');
  const botUserIds = bots
    .map((b) => b.botUserId?.toString())
    .filter((id): id is string => !!id);

  for (const userId of botUserIds) {
    if (status === 'online') addUserOnline(userId);
    else removeUserOnline(userId);

    try {
      socketManager.getIO().emit('PRESENCE_UPDATE', { userId, status });
    } catch {
      // Socket server not initialized (e.g., in unit tests); ignore.
    }
  }
};

