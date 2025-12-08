import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Channel, Message } from '../types';
import { useHiddenStore } from '../stores/store'; // Import the hidden store

export const useDmEvents = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleDmCreate = (channel: Channel) => {
      // Optimistically update the DM list cache
      // When a DM channel is created (or re-initiated by another user), ensure it's not hidden.
      useHiddenStore.getState().removeHiddenChannel(channel._id);

      // Optimistically update the DM list cache
      queryClient.setQueryData(['dmChannels'], (old: Channel[] | undefined) => {
        if (!old) return [channel];
        // Avoid duplicates
        if (old.find(c => c._id === channel._id)) return old;
        return [channel, ...old];
      });
    };

    const handleMessageCreate = (message: Message) => {
      const dmChannels: Channel[] | undefined = queryClient.getQueryData(['dmChannels']);
      const targetDm = dmChannels?.find(c => c._id === message.channelId);

      // If a message arrives in a known DM channel, unhide it.
      if (targetDm) {
        useHiddenStore.getState().removeHiddenChannel(message.channelId);
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
