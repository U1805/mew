import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';
import { Channel } from '../types';
import { useUnreadStore } from './unreadStore';
import { setNotifyServerStore } from './unreadNotifier';

export interface UnreadServerState {
  unreadServerIds: Set<string>;
  initializeNotifier: (queryClient: QueryClient, allServerIds: string[]) => void;
}

export const useUnreadServerStore = create<UnreadServerState>((set) => ({
  unreadServerIds: new Set(),
  initializeNotifier: (queryClient, allServerIds) => {
    setNotifyServerStore((channelId) => {
      let serverIdForChannel: string | null = null;

      for (const serverId of allServerIds) {
        const channels = queryClient.getQueryData(['channels', serverId]) as Channel[] | undefined;
        if (channels?.some(c => c._id === channelId)) {
          serverIdForChannel = serverId;
          break;
        }
      }

      if (!serverIdForChannel) return;

      const finalServerId = serverIdForChannel;

      set(state => {
        const newUnreadServerIds = new Set(state.unreadServerIds);
        const currentUnreadChannelIds = useUnreadStore.getState().unreadChannelIds;

        const hasOtherUnread = ((queryClient.getQueryData(['channels', finalServerId]) as Channel[] | undefined) || [])
          .some(c => currentUnreadChannelIds.has(c._id));

        if (hasOtherUnread) {
          newUnreadServerIds.add(finalServerId);
        } else {
          newUnreadServerIds.delete(finalServerId);
        }

        return { unreadServerIds: newUnreadServerIds };
      });
    });
  },
}));

