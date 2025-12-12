import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Message } from '../types';
import { useUIStore, useUnreadStore } from '../stores';

export const useSocketMessages = (channelId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!channelId) return;

    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (newMessage: Message) => {
      // 1. Update cache if we are viewing this channel
      if (channelId && newMessage.channelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
            if (!old) return [newMessage];

            // 检查是否存在重复的真实消息
            if (old.find(m => m._id === newMessage._id)) return old;

            // 寻找并替换乐观更新的临时消息
            // 临时消息的ID是一个ISO日期字符串，不是一个有效的ObjectId
            const tempMessageIndex = old.findIndex(m => !/^[0-9a-fA-F]{24}$/.test(m._id) && m.content === newMessage.content);

            if (tempMessageIndex > -1) {
                old[tempMessageIndex] = newMessage;
                return [...old];
            }

            return [...old, newMessage];
        });
      }

      // 2. Global Unread Logic
      // Check against the actual current channel in the store to ensure accuracy
      const currentChannelId = useUIStore.getState().currentChannelId;
      if (newMessage.channelId !== currentChannelId) {
          useUnreadStore.getState().addUnreadChannel(newMessage.channelId);
      }
    };

    const handleUpdateMessage = (updatedMessage: Message) => {
      if (channelId && updatedMessage.channelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return old;
          return old.map(m => m._id === updatedMessage._id ? updatedMessage : m);
        });
      }
    };

    const handleDeleteMessage = ({ messageId, channelId: msgChannelId }: { messageId: string, channelId: string }) => {
      if (channelId && msgChannelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return old;
          return old.filter(m => m._id !== messageId);
        });
      }
    };

    socket.on('MESSAGE_CREATE', handleNewMessage);
    socket.on('MESSAGE_UPDATE', handleUpdateMessage);
    socket.on('MESSAGE_DELETE', handleDeleteMessage);
    
    // Design doc specifies these events return the full Message object with updated reactions
    socket.on('MESSAGE_REACTION_ADD', handleUpdateMessage);
    socket.on('MESSAGE_REACTION_REMOVE', handleUpdateMessage);

    return () => {
      socket.off('MESSAGE_CREATE', handleNewMessage);
      socket.off('MESSAGE_UPDATE', handleUpdateMessage);
      socket.off('MESSAGE_DELETE', handleDeleteMessage);
      socket.off('MESSAGE_REACTION_ADD', handleUpdateMessage);
      socket.off('MESSAGE_REACTION_REMOVE', handleUpdateMessage);
    };
  }, [channelId, queryClient]);
};
