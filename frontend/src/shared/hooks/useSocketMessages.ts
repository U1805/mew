import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Message } from '../types';

export const useSocketMessages = (channelId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !channelId) return;

    const handleNewMessage = (newMessage: Message) => {
      if (newMessage.channelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return [newMessage];
          if (old.find(m => m._id === newMessage._id)) return old;
          return [...old, newMessage];
        });
      }
    };

    // Both update and reaction events return the full updated message object
    const handleUpdateMessage = (updatedMessage: Message) => {
      if (updatedMessage.channelId === channelId) {
        queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
          if (!old) return old;
          return old.map(m => m._id === updatedMessage._id ? updatedMessage : m);
        });
      }
    };

    const handleDeleteMessage = ({ messageId, channelId: msgChannelId }: { messageId: string, channelId: string }) => {
      if (msgChannelId === channelId) {
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
