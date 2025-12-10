import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { usePresenceStore } from './presenceStore';
import { disconnectSocket } from '../services/socket';
import { User, Channel } from '../types';
import { QueryClient } from '@tanstack/react-query';

export interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User | null, remember?: boolean) => void;
  logout: () => void;
}

interface UIState {
  currentServerId: string | null;
  currentChannelId: string | null;
  isMemberListOpen: boolean;
  isSettingsOpen: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  targetMessageId: string | null;
  setCurrentServer: (id: string | null) => void;
  setCurrentChannel: (id: string | null) => void;
  toggleMemberList: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setSearchOpen: (isOpen: boolean) => void;
  setSearchQuery: (query: string) => void;
  setTargetMessageId: (id: string | null) => void;
}

type ModalType = 'createServer' | 'createChannel' | 'createCategory' | 'editCategory' | 'deleteCategory' | 'serverSettings' | 'deleteServer' | 'leaveServer' | 'channelSettings' | 'deleteChannel' | 'deleteMessage' | 'findUser' | 'userProfile' | 'createInvite' | 'joinServer' | 'kickUser' | 'addPermissionOverride' | 'confirm';

interface ModalState {
  activeModal: ModalType | null;
  modalData: any;
  openModal: (modal: ModalType, data?: any) => void;
  closeModal: () => void;
}

interface UnreadState {
  unreadChannelIds: Set<string>;
  unreadMentionMessageIds: Set<string>; // Added to track specific mention messages
  addUnreadChannel: (channelId: string) => void;
  removeUnreadChannel: (channelId: string) => void;
  addUnreadMention: (messageId: string) => void;
  removeUnreadMention: (messageId: string) => void;
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

export const useUnreadStore = create<UnreadState>((set, get) => ({
  unreadChannelIds: new Set(),
  unreadMentionMessageIds: new Set(),
  addUnreadChannel: (channelId) => {
    if (get().unreadChannelIds.has(channelId)) return;
    set((state) => {
      const newSet = new Set(state.unreadChannelIds);
      newSet.add(channelId);
      return { unreadChannelIds: newSet };
    });
    if (notifyServerStore) notifyServerStore(channelId, 'add');
  },
  removeUnreadChannel: (channelId) => {
    if (!get().unreadChannelIds.has(channelId)) return;
    set((state) => {
      const newSet = new Set(state.unreadChannelIds);
      newSet.delete(channelId);
      return { unreadChannelIds: newSet };
    });
    if (notifyServerStore) notifyServerStore(channelId, 'remove');
  },

  addUnreadMention: (messageId) => {
    if (get().unreadMentionMessageIds.has(messageId)) return;
    set((state) => {
        const newSet = new Set(state.unreadMentionMessageIds);
        newSet.add(messageId);
        return { unreadMentionMessageIds: newSet };
    });
  },

  removeUnreadMention: (messageId) => {
    if (!get().unreadMentionMessageIds.has(messageId)) return;
    set((state) => {
        const newSet = new Set(state.unreadMentionMessageIds);
        newSet.delete(messageId);
        return { unreadMentionMessageIds: newSet };
    });
  },
}));

// Communication bridge between channel unread store and server unread store.
// This will be initialized in a top-level component (e.g., Layout.tsx).
export let notifyServerStore: (channelId: string, action: 'add' | 'remove') => void;

export interface UnreadServerState {
  unreadServerIds: Set<string>;
  initializeNotifier: (queryClient: QueryClient, allServerIds: string[]) => void;
}

export const useUnreadServerStore = create<UnreadServerState>((set) => ({
  unreadServerIds: new Set(),
  initializeNotifier: (queryClient, allServerIds) => {
    notifyServerStore = (channelId, action) => {
      let serverIdForChannel: string | null = null;

      for (const serverId of allServerIds) {
        const channels = queryClient.getQueryData(['channels', serverId]) as Channel[] | undefined;
        if (channels?.some(c => c._id === channelId)) {
          serverIdForChannel = serverId;
          break;
        }
      }

      if (!serverIdForChannel) return;

      const finalServerId = serverIdForChannel; // To satisfy TypeScript's non-null assertion

      set(state => {
        const newUnreadServerIds = new Set(state.unreadServerIds);
        // Use a fresh lookup of the unread channels set inside the setter for accuracy
        const currentUnreadChannelIds = useUnreadStore.getState().unreadChannelIds;

        // Determine if after this action, ANY channel in this server is still unread.
        const hasOtherUnread = ((queryClient.getQueryData(['channels', finalServerId]) as Channel[] | undefined) || [])
          .some(c => currentUnreadChannelIds.has(c._id));

        if (hasOtherUnread) {
          newUnreadServerIds.add(finalServerId);
        } else {
          newUnreadServerIds.delete(finalServerId);
        }

        return { unreadServerIds: newUnreadServerIds };
      });
    };
  },
}));

export const useUIStore = create<UIState>((set) => ({
  currentServerId: null,
  currentChannelId: null,
  isMemberListOpen: true,
  isSettingsOpen: false,
  isSearchOpen: false,
  searchQuery: '',
  targetMessageId: null,
  setCurrentServer: (id) => set({ currentServerId: id, currentChannelId: null, isSearchOpen: false, searchQuery: '' }),
  setCurrentChannel: (id) => {
    if (id) {
      // When a channel becomes active, it should no longer be unread or hidden.
      useUnreadStore.getState().removeUnreadChannel(id);
      useHiddenStore.getState().removeHiddenChannel(id);
    }
    set({ currentChannelId: id });
  },
  toggleMemberList: () => set((state) => ({ isMemberListOpen: !state.isMemberListOpen })),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  setSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setTargetMessageId: (id) => set({ targetMessageId: id }),
}));

export const useModalStore = create<ModalState>((set) => ({
  activeModal: null,
  modalData: null,
  openModal: (modal, data = null) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}));

interface HiddenState {
  hiddenDmChannelIds: Set<string>;
  addHiddenChannel: (channelId: string) => void;
  removeHiddenChannel: (channelId: string) => void;
}

export const useHiddenStore = create<HiddenState>()(
  persist(
    (set, get) => ({
      hiddenDmChannelIds: new Set(),
      addHiddenChannel: (channelId) => {
        if (get().hiddenDmChannelIds.has(channelId)) return;
        set((state) => {
          const newSet = new Set(state.hiddenDmChannelIds);
          newSet.add(channelId);
          return { hiddenDmChannelIds: newSet };
        });
      },
      removeHiddenChannel: (channelId) => {
        if (!get().hiddenDmChannelIds.has(channelId)) return;
        set((state) => {
            const newSet = new Set(state.hiddenDmChannelIds);
            newSet.delete(channelId);
            return { hiddenDmChannelIds: newSet };
        });
      },
    }),
    {
      name: 'mew-hidden-channels-storage',
      storage: createJSONStorage(() => localStorage, {
        reviver: (key, value) => {
          if (key === 'hiddenDmChannelIds' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // @ts-ignore
            return new Set(value.value);
          }
          return value;
        },
        replacer: (key, value) => {
          if (key === 'hiddenDmChannelIds' && value instanceof Set) {
            return { value: Array.from(value) };
          }
          return value;
        },
      }),
      partialize: (state) => ({ hiddenDmChannelIds: state.hiddenDmChannelIds }),
    }
  )
);