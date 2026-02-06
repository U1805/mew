import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Channel, Message } from '../types';
import { useHiddenStore, useUnreadStore, useUIStore, useNotificationSettingsStore } from '../stores';
import { useAuthStore } from '../stores/authStore';
import { playMessageSound, showDesktopNotification } from '../services/notifications';

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
        const notif = useNotificationSettingsStore.getState();

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

        // --- Notifications (sound + browser) ---
        const authorId = (message as any).authorId;
        const authorObject = authorId && typeof authorId === 'object' ? authorId : undefined;
        const authorUserId = authorObject?._id || (typeof authorId === 'string' ? authorId : undefined);
        if (user && authorUserId && authorUserId === user._id) {
          // Ignore self
        } else {
          const channelLevel = notif.channel[message.channelId] || 'DEFAULT';
          const serverLevel = message.serverId ? (notif.server[message.serverId] || 'ALL_MESSAGES') : 'ALL_MESSAGES';
          const effectiveLevel = channelLevel === 'DEFAULT' ? serverLevel : channelLevel;

          const shouldNotify =
            effectiveLevel !== 'MUTE' &&
            (effectiveLevel !== 'MENTIONS_ONLY' || isMentioned);

          if (shouldNotify) {
            if (notif.user.soundEnabled) {
              void playMessageSound(notif.user.soundVolume);
            }

            if (notif.user.desktopEnabled && !document.hasFocus()) {
              const dmChannels = queryClient.getQueryData<Channel[]>(['dmChannels']);
              const serverChannels = message.serverId ? queryClient.getQueryData<Channel[]>(['channels', message.serverId]) : undefined;

              const channel =
                dmChannels?.find(c => c._id === message.channelId) ||
                serverChannels?.find(c => c._id === message.channelId);

              const authorName = authorObject?.username || 'New message';
              const bodyText = (() => {
                const raw = (message as any).content;
                if (typeof raw === 'string' && raw.trim()) return raw.trim();
                if (Array.isArray((message as any).attachments) && (message as any).attachments.length > 0) return 'Sent an attachment';
                return 'Sent a message';
              })();

              const title = message.serverId
                ? `${authorName} in #${channel?.name || 'channel'}`
                : `${authorName}`;

              showDesktopNotification({
                title,
                body: bodyText,
                icon: authorObject?.avatarUrl,
                tag: `mew:${message.channelId}`,
                data: { serverId: message.serverId, channelId: message.channelId },
              });
            }
          }
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

