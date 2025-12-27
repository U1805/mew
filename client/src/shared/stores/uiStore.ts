import { create } from 'zustand';
import { useUnreadStore } from './unreadStore';
import { useHiddenStore } from './hiddenStore';

interface UIState {
  currentServerId: string | null;
  currentChannelId: string | null;
  isMemberListOpen: boolean;
  isSettingsOpen: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  isDmSearchOpen: boolean;
  dmSearchQuery: string;
  targetMessageId: string | null;
  replyTo:
    | {
        messageId: string;
        channelId: string;
        authorUsername?: string;
        preview?: string;
      }
    | null;
  setCurrentServer: (id: string | null) => void;
  setCurrentChannel: (id: string | null) => void;
  toggleMemberList: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setSearchOpen: (isOpen: boolean) => void;
  setSearchQuery: (query: string) => void;
  setDmSearchOpen: (isOpen: boolean) => void;
  setDmSearchQuery: (query: string) => void;
  setTargetMessageId: (id: string | null) => void;
  setReplyTo: (replyTo: UIState['replyTo']) => void;
  clearReplyTo: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentServerId: null,
  currentChannelId: null,
  isMemberListOpen: true,
  isSettingsOpen: false,
  isSearchOpen: false,
  searchQuery: '',
  isDmSearchOpen: false,
  dmSearchQuery: '',
  targetMessageId: null,
  replyTo: null,
  setCurrentServer: (id) =>
    set({
      currentServerId: id,
      currentChannelId: null,
      isSearchOpen: false,
      searchQuery: '',
      isDmSearchOpen: false,
      dmSearchQuery: '',
    }),
  setCurrentChannel: (id) => {
    if (id) {
      useUnreadStore.getState().removeUnreadChannel(id);
      useHiddenStore.getState().removeHiddenChannel(id);
    }
    set({ currentChannelId: id, isDmSearchOpen: false, dmSearchQuery: '' });
  },
  toggleMemberList: () => set((state) => ({ isMemberListOpen: !state.isMemberListOpen })),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  setSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDmSearchOpen: (isOpen) => set({ isDmSearchOpen: isOpen }),
  setDmSearchQuery: (query) => set({ dmSearchQuery: query }),
  setTargetMessageId: (id) => set({ targetMessageId: id }),
  setReplyTo: (replyTo) => set({ replyTo }),
  clearReplyTo: () => set({ replyTo: null }),
}));

