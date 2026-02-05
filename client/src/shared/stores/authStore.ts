import { create } from 'zustand';
import { usePresenceStore } from './presenceStore';
import { disconnectSocket } from '../services/socket';
import { User } from '../types';
import { useNotificationSettingsStore } from './notificationSettingsStore';

export interface AuthState {
  status: 'unknown' | 'authenticated' | 'unauthenticated';
  user: User | null;
  setUser: (user: User | null) => void;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: JSON.parse(localStorage.getItem('mew_user') || 'null'),

  setUser: (user: User | null) => {
    if (user) localStorage.setItem('mew_user', JSON.stringify(user));
    else localStorage.removeItem('mew_user');
    set({ user, status: user ? 'authenticated' : 'unauthenticated' });
    useNotificationSettingsStore.getState().hydrateFromUser(user);
  },

  hydrate: async () => {
    try {
      const { authApi } = await import('../services/api');
      // First try /users/@me directly (access token cookie may still be valid).
      const me = await authApi.getMe();
      get().setUser(me.data);
    } catch (err: any) {
      // Best-effort refresh, then retry /users/@me.
      try {
        const { authApi } = await import('../services/api');
        await authApi.refresh();
        const me = await authApi.getMe();
        get().setUser(me.data);
      } catch {
        set({ status: 'unauthenticated', user: null });
        localStorage.removeItem('mew_user');
        useNotificationSettingsStore.getState().clear();
      }
    }
  },

  logout: async () => {
    try {
      const { authApi } = await import('../services/api');
      await authApi.logout();
    } catch {
      // ignore
    }

    localStorage.removeItem('mew_user');
    set({ status: 'unauthenticated', user: null });
    disconnectSocket();
    usePresenceStore.getState().clearOnlineStatus();
    useNotificationSettingsStore.getState().clear();
  },
}));

