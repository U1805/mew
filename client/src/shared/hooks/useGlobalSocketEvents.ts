import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Channel, Message } from '../types';
import { useHiddenStore, useUnreadStore, useAuthStore, useUIStore } from '../stores';

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
      try {
        if (!message || typeof message !== 'object') return;

        const { currentChannelId } = useUIStore.getState();
        const { user } = useAuthStore.getState();
        const { addUnreadChannel, addUnreadMention } = useUnreadStore.getState();

        const isViewingChannel = message.channelId === currentChannelId && document.hasFocus();

        // If user is viewing the channel, do nothing, as the message will be handled by useSocketMessages
        if (isViewingChannel) {
          return;
        }

        // If not viewing, add to unread
        addUnreadChannel(message.channelId);

        // Handle mentions (message.content may be missing for attachment/card messages)
        const rawContent = (message as any).content;
        const contentText = typeof rawContent === 'string' ? rawContent : '';
        const isMentioned = !!user &&
          (message.mentions?.some(m => typeof m === 'string' ? m === user._id : m._id === user._id) ||
           contentText.includes('@everyone') ||
           contentText.includes('@here'));

        if (isMentioned) {
          addUnreadMention(message._id);
        }

        // Update the last message in the channel list cache
        const updateChannelCache = (queryKey: string[], newMessage: Message) => {
          queryClient.setQueryData<Channel[]>(queryKey, (oldChannels) => {
            if (!oldChannels) return oldChannels;
            return oldChannels.map(channel =>
              channel._id === newMessage.channelId
                ? { ...channel, lastMessage: newMessage }
                : channel
            );
          });
        };

        // Bring back hidden DM channel on new message and update cache
        const dmChannels: Channel[] | undefined = queryClient.getQueryData(['dmChannels']);
        if (dmChannels?.some(c => c._id === message.channelId)) {
          useHiddenStore.getState().removeHiddenChannel(message.channelId);
          updateChannelCache(['dmChannels'], message);
        } else if (message.serverId) {
          updateChannelCache(['channels', message.serverId], message);
        }
      } catch (err) {
        if ((import.meta as any).env?.DEV) {
          // eslint-disable-next-line no-console
          console.error('useGlobalSocketEvents: handleMessageCreate failed', err);
        }
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
