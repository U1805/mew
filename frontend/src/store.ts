
import { create } from 'zustand';
import { AuthState, User } from './types';

interface UIState {
  currentServerId: string | null;
  currentChannelId: string | null;
  isMemberListOpen: boolean;
  isSettingsOpen: boolean;
  setCurrentServer: (id: string | null) => void;
  setCurrentChannel: (id: string | null) => void;
  toggleMemberList: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

interface ModalState {
  activeModal: 'createServer' | 'createChannel' | 'createCategory' | 'editCategory' | 'deleteCategory' | 'serverSettings' | 'deleteServer' | 'leaveServer' | 'channelSettings' | 'deleteChannel' | 'deleteMessage' | 'findUser' | 'userProfile' | 'createInvite' | 'joinServer' | 'kickUser' | null;
  modalData: any;
  openModal: (modal: 'createServer' | 'createChannel' | 'createCategory' | 'editCategory' | 'deleteCategory' | 'serverSettings' | 'deleteServer' | 'leaveServer' | 'channelSettings' | 'deleteChannel' | 'deleteMessage' | 'findUser' | 'userProfile' | 'createInvite' | 'joinServer' | 'kickUser', data?: any) => void;
  closeModal: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Initialize from either storage
  token: localStorage.getItem('mew_token') || sessionStorage.getItem('mew_token'),
  user: JSON.parse(localStorage.getItem('mew_user') || sessionStorage.getItem('mew_user') || 'null'),
  
  setAuth: (token: string, user: User | null, remember: boolean = true) => {
    const storage = remember ? localStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : localStorage;

    // Save to preferred storage
    storage.setItem('mew_token', token);
    if (user) {
      storage.setItem('mew_user', JSON.stringify(user));
    } else {
      storage.removeItem('mew_user');
    }

    // Clean other storage to prevent sync issues
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
  },
}));

export const useUIStore = create<UIState>((set) => ({
  currentServerId: null,
  currentChannelId: null,
  isMemberListOpen: true, // Default to open on desktop
  isSettingsOpen: false,
  setCurrentServer: (id) => set({ currentServerId: id, currentChannelId: null }),
  setCurrentChannel: (id) => set({ currentChannelId: id }),
  toggleMemberList: () => set((state) => ({ isMemberListOpen: !state.isMemberListOpen })),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
}));

export const useModalStore = create<ModalState>((set) => ({
  activeModal: null,
  modalData: null,
  openModal: (modal, data = null) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}));