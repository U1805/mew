import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// A simple User type based on the implementation_plan.md
interface User {
  _id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  isBot: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: 'auth-storage', // name of item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage),
    }
  )
);
