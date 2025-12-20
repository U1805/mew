import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Channel, Message } from '../types';
import { useHiddenStore, useUnreadStore, useAuthStore } from '../stores';

export const useGlobalSocketEvents = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleDmCreate = (channel: Channel) => {
      // DM 重新出现时要解除隐藏并补齐缓存。
      useHiddenStore.getState().removeHiddenChannel(channel._id);

      queryClient.setQueryData(['dmChannels'], (old: Channel[] | undefined) => {
        if (!old) return [channel];
        if (old.find(c => c._id === channel._id)) return old; // 避免重复
        return [channel, ...old];
      });
    };

    const handleMessageCreate = (message: Message) => {
      const dmChannels: Channel[] | undefined = queryClient.getQueryData(['dmChannels']);
      const isDmMessage = dmChannels?.some(c => c._id === message.channelId);

      if (isDmMessage) useHiddenStore.getState().removeHiddenChannel(message.channelId);

      const currentUser = useAuthStore.getState().user;
      const isMentioned = currentUser && ((message.mentions?.includes(currentUser._id)) || message.content.includes('@everyone') || message.content.includes('@here'));

      if (isMentioned) {
        useUnreadStore.getState().addUnreadMention(message._id);
        useUnreadStore.getState().addUnreadChannel(message.channelId);
      }
    };

    socket.on('DM_CHANNEL_CREATE', handleDmCreate);
    socket.on('MESSAGE_CREATE', handleMessageCreate);

    return () => {
      socket.off('DM_CHANNEL_CREATE', handleDmCreate);
      socket.off('MESSAGE_CREATE', handleMessageCreate);
    };
  }, [queryClient]);
};
