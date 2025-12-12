import { create } from 'zustand';
import { usePresenceStore } from './presenceStore';
import { disconnectSocket } from '../services/socket';
import { User } from '../types';

export interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User | null, remember?: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('mew_token') || sessionStorage.getItem('mew_token'),
  user: JSON.parse(localStorage.getItem('mew_user') || sessionStorage.getItem('mew_user') || 'null'),

  setAuth: (token: string, user: User | null, remember: boolean = true) => {
    const storage = remember ? localStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : localStorage;

    storage.setItem('mew_token', token);
    if (user) {
      storage.setItem('mew_user', JSON.stringify(user));
    } else {
      storage.removeItem('mew_user');
    }

    otherStorage.removeItem('mew_token');
    otherStorage.removeItem('mew_user');

    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem('mew_token');
    localStorage.removeItem('mew_user');
    sessionStorage.removeItem('mew_token');
    sessionStorage.removeItem('mew_user');
    set({ token: null, user: null });
    disconnectSocket();
    usePresenceStore.getState().clearOnlineStatus();
  },
}));

