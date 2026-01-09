import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUnreadStore } from '../stores/unreadStore';
import { useServersWithChannels } from '../../features/server/hooks/useServersWithChannels';
import { useDmChannels } from '../../features/channel/hooks/useDmChannels';
import type { Channel } from '../types';

const areSetsEqual = <T>(a: Set<T>, b: Set<T>): boolean => {
  if (a.size !== b.size) return false;
  for (const val of a) {
    if (!b.has(val)) return false;
  }
  return true;
};

export const useUnreadInitialization = () => {
  const { unreadChannelIds, setUnreadChannels } = useUnreadStore();
  const { serversQuery } = useServersWithChannels();
  const { isSuccess: isServersSuccess, data: servers } = serversQuery;
  const { data: dmChannels, isSuccess: isDmChannelsSuccess } = useDmChannels();
  const queryClient = useQueryClient();

  useEffect(() => {
    const newUnreadIds = new Set<string>();

    if (isServersSuccess && servers) {
      for (const server of servers) {
        const channels = queryClient.getQueryData<Channel[]>(['channels', server._id]);
        if (channels) {
          channels.forEach(channel => {
            if (channel.lastMessage && channel.lastMessage._id !== channel.lastReadMessageId) {
              newUnreadIds.add(channel._id);
            }
          });
        }
      }
    }

    if (isDmChannelsSuccess && dmChannels) {
      dmChannels.forEach(channel => {
        if (channel.lastMessage && channel.lastMessage._id !== channel.lastReadMessageId) {
          newUnreadIds.add(channel._id);
        }
      });
    }

    if (!areSetsEqual(newUnreadIds, unreadChannelIds)) {
      setUnreadChannels(newUnreadIds);
    }

  }, [isServersSuccess, servers, isDmChannelsSuccess, dmChannels, queryClient, unreadChannelIds, setUnreadChannels]);
};
