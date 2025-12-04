import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '../services/socket';
import { Channel } from '../types';

export const useDmEvents = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleDmCreate = (channel: Channel) => {
      // Optimistically update the DM list cache
      queryClient.setQueryData(['dmChannels'], (old: Channel[] | undefined) => {
        if (!old) return [channel];
        // Avoid duplicates
        if (old.find(c => c._id === channel._id)) return old;
        return [channel, ...old];
      });
    };

    socket.on('DM_CHANNEL_CREATE', handleDmCreate);

    return () => {
      socket.off('DM_CHANNEL_CREATE', handleDmCreate);
    };
  }, [queryClient]);
};
