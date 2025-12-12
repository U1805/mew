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

    // 处理新DM频道的创建
    const handleDmCreate = (channel: Channel) => {
      // 当一个DM频道被创建（或被对方重新发起）时，确保它不处于隐藏状态
      useHiddenStore.getState().removeHiddenChannel(channel._id);

      // 更新DM列表缓存
      queryClient.setQueryData(['dmChannels'], (old: Channel[] | undefined) => {
        if (!old) return [channel];
        if (old.find(c => c._id === channel._id)) return old; // 避免重复
        return [channel, ...old];
      });
    };

    // 处理新消息，用于取消隐藏DM
    const handleMessageCreate = (message: Message) => {
      // 检查这条消息是否属于一个已知的DM频道
      const dmChannels: Channel[] | undefined = queryClient.getQueryData(['dmChannels']);
      const isDmMessage = dmChannels?.some(c => c._id === message.channelId);

      // 如果是DM消息，则从隐藏列表中移除该频道
      if (isDmMessage) {
        useHiddenStore.getState().removeHiddenChannel(message.channelId);
      }

      // --- 新增：处理未读提及 ---
      const currentUser = useAuthStore.getState().user;
      const isMentioned = currentUser && (
        (message.mentions && message.mentions.includes(currentUser._id)) ||
        message.content.includes('@everyone') ||
        message.content.includes('@here')
      );

      if (isMentioned) {
        useUnreadStore.getState().addUnreadMention(message._id);
        useUnreadStore.getState().addUnreadChannel(message.channelId); // 同时标记频道为未读
      }
    };

    socket.on('DM_CHANNEL_CREATE', handleDmCreate);
    // 关键：在这里全局监听MESSAGE_CREATE
    socket.on('MESSAGE_CREATE', handleMessageCreate);

    return () => {
      socket.off('DM_CHANNEL_CREATE', handleDmCreate);
      socket.off('MESSAGE_CREATE', handleMessageCreate);
    };
  }, [queryClient]);
};
