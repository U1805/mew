import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Message } from '../types';

export const useSocketMessages = (channelId: string | null, options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!channelId || !enabled) return;

    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (newMessage: Message) => {
      if (newMessage.channelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return [newMessage];

          if (old.some(m => m._id === newMessage._id)) return old;

          // 乐观更新的临时消息 ID 非 ObjectId，需要在真实消息到达时替换。
          const tempMessageIndex = old.findIndex(m => !/^[0-9a-fA-F]{24}$/.test(m._id) && m.content === newMessage.content);

          if (tempMessageIndex > -1) {
            const next = [...old];
            next[tempMessageIndex] = newMessage;
            return next;
          }

          return [...old, newMessage];
        });
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
    socket.on('MESSAGE_REACTION_ADD', handleUpdateMessage);
    socket.on('MESSAGE_REACTION_REMOVE', handleUpdateMessage);

    return () => {
      socket.off('MESSAGE_CREATE', handleNewMessage);
      socket.off('MESSAGE_UPDATE', handleUpdateMessage);
      socket.off('MESSAGE_DELETE', handleDeleteMessage);
      socket.off('MESSAGE_REACTION_ADD', handleUpdateMessage);
      socket.off('MESSAGE_REACTION_REMOVE', handleUpdateMessage);
    };
  }, [channelId, enabled, queryClient]);
};
