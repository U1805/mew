import { create } from 'zustand';
import { useUnreadStore } from './unreadStore';
import { useHiddenStore } from './hiddenStore';

interface UIState {
  currentServerId: string | null;
  currentChannelId: string | null;
  isMemberListOpen: boolean; // Controls both Desktop toggle and Mobile Drawer
  isSettingsOpen: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  isDmSearchOpen: boolean;
  dmSearchQuery: string;
  targetMessageId: string | null;
  mobileSidebarOpen: boolean; 
  replyTo: any;

  // Actions
  setCurrentServer: (id: string | null) => void;
  setCurrentChannel: (id: string | null) => void;
  toggleMemberList: () => void;
  setMemberListOpen: (isOpen: boolean) => void; // Added setter
  openSettings: () => void;
  closeSettings: () => void;
  setSearchOpen: (isOpen: boolean) => void;
  setSearchQuery: (query: string) => void;
  setDmSearchOpen: (isOpen: boolean) => void;
  setDmSearchQuery: (query: string) => void;
  setTargetMessageId: (id: string | null) => void;
  setReplyTo: (replyTo: any) => void;
  clearReplyTo: () => void;
  toggleMobileSidebar: (isOpen?: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  currentServerId: null,
  currentChannelId: null,
  isMemberListOpen: false, // Default closed, Layout will open for Desktop
  isSettingsOpen: false,
  isSearchOpen: false,
  searchQuery: '',
  isDmSearchOpen: false,
  dmSearchQuery: '',
  targetMessageId: null,
  replyTo: null,
  mobileSidebarOpen: true, 

  setCurrentServer: (id) =>
    set({
      currentServerId: id,
      currentChannelId: null,
      isSearchOpen: false,
      searchQuery: '',
      isDmSearchOpen: false,
      dmSearchQuery: '',
      mobileSidebarOpen: true, 
    }),

  setCurrentChannel: (id) => {
    if (id) {
      useUnreadStore.getState().removeUnreadChannel(id);
      useHiddenStore.getState().removeHiddenChannel(id);
    }
    set({ 
        currentChannelId: id, 
        isDmSearchOpen: false, 
        dmSearchQuery: '',
        mobileSidebarOpen: false 
    });
  },

  toggleMemberList: () => set((state) => ({ isMemberListOpen: !state.isMemberListOpen })),
  setMemberListOpen: (isOpen) => set({ isMemberListOpen: isOpen }), // Implementation
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  setSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDmSearchOpen: (isOpen) => set({ isDmSearchOpen: isOpen }),
  setDmSearchQuery: (query) => set({ dmSearchQuery: query }),
  setTargetMessageId: (id) => set({ targetMessageId: id }),
  setReplyTo: (replyTo) => set({ replyTo }),
  clearReplyTo: () => set({ replyTo: null }),
  
  toggleMobileSidebar: (isOpen) => set((state) => ({ 
    mobileSidebarOpen: isOpen !== undefined ? isOpen : !state.mobileSidebarOpen 
  })),
}));
