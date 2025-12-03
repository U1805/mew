
import { useEffect } from 'react';
import { getSocket } from '@/shared/services/socket';
import { usePresenceStore } from '@/shared/stores/presenceStore';

export const usePresenceEvents = () => {
  const { setInitialState, updateUserStatus } = usePresenceStore();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleInitialState = (userIds: string[]) => {
      setInitialState(userIds);
    };

    const handlePresenceUpdate = ({ userId, status }: { userId: string, status: 'online' | 'offline' }) => {
      updateUserStatus(userId, status);
    };

    socket.on('PRESENCE_INITIAL_STATE', handleInitialState);
    socket.on('PRESENCE_UPDATE', handlePresenceUpdate);

    return () => {
      socket.off('PRESENCE_INITIAL_STATE', handleInitialState);
      socket.off('PRESENCE_UPDATE', handlePresenceUpdate);
    };
  }, [setInitialState, updateUserStatus]);
};
