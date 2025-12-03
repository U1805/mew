
import { create } from 'zustand';

interface PresenceState {
  onlineStatus: Record<string, 'online' | 'offline'>;
  setInitialState: (userIds: string[]) => void;
  updateUserStatus: (userId: string, status: 'online' | 'offline') => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineStatus: {},
  setInitialState: (userIds) => {
    const statusMap: Record<string, 'online' | 'offline'> = {};
    userIds.forEach(id => {
      statusMap[id] = 'online';
    });
    set({ onlineStatus: statusMap });
  },
  updateUserStatus: (userId, status) => set((state) => ({
    onlineStatus: {
      ...state.onlineStatus,
      [userId]: status
    }
  })),
  clearOnlineStatus: () => set({ onlineStatus: {} }),
}));
