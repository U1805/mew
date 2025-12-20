import { create } from 'zustand';
import { getNotifyServerStore } from './unreadNotifier';

interface UnreadState {
  unreadChannelIds: Set<string>;
  unreadMentionMessageIds: Set<string>;
  addUnreadChannel: (channelId: string) => void;
  removeUnreadChannel: (channelId: string) => void;
  addUnreadMention: (messageId: string) => void;
  removeUnreadMention: (messageId: string) => void;
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  unreadChannelIds: new Set(),
  unreadMentionMessageIds: new Set(),
  addUnreadChannel: (channelId) => {
    if (get().unreadChannelIds.has(channelId)) return;
    set((state) => {
      const newSet = new Set(state.unreadChannelIds);
      newSet.add(channelId);
      return { unreadChannelIds: newSet };
    });
    const notifier = getNotifyServerStore();
    if (notifier) notifier(channelId, 'add');
  },
  removeUnreadChannel: (channelId) => {
    if (!get().unreadChannelIds.has(channelId)) return;
    set((state) => {
      const newSet = new Set(state.unreadChannelIds);
      newSet.delete(channelId);
      return { unreadChannelIds: newSet };
    });
    const notifier = getNotifyServerStore();
    if (notifier) notifier(channelId, 'remove');
  },

  addUnreadMention: (messageId) => {
    if (get().unreadMentionMessageIds.has(messageId)) return;
    set((state) => {
      const newSet = new Set(state.unreadMentionMessageIds);
      newSet.add(messageId);
      return { unreadMentionMessageIds: newSet };
    });
  },

  removeUnreadMention: (messageId) => {
    if (!get().unreadMentionMessageIds.has(messageId)) return;
    set((state) => {
      const newSet = new Set(state.unreadMentionMessageIds);
      newSet.delete(messageId);
      return { unreadMentionMessageIds: newSet };
    });
  },
}));

