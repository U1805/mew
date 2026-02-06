import { create } from 'zustand';
import { useUnreadStore } from './unreadStore';
import { useHiddenStore } from './hiddenStore';
import { buildChannelsPathname, safePushState } from '../router/channelsRoute';
import { buildSettingsPathname, type SettingsTab } from '../router/settingsRoute';

interface UIState {
  currentServerId: string | null;
  currentChannelId: string | null;
  isMemberListOpen: boolean; // Controls both Desktop toggle and Mobile Drawer
  isSettingsOpen: boolean;
  settingsTab: SettingsTab;
  settingsReturnToPath: string | null;
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
  hydrateFromRoute: (serverId: string | null, channelId: string | null) => void;
  toggleMemberList: () => void;
  setMemberListOpen: (isOpen: boolean) => void; // Added setter
  openSettings: () => void;
  openSettingsToTab: (tab: SettingsTab) => void;
  closeSettings: () => void;
  selectSettingsTab: (tab: SettingsTab) => void;
  hydrateSettingsFromRoute: (tab: SettingsTab) => void;
  hydrateSettingsClosedFromRoute: () => void;
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
  settingsTab: 'account',
  settingsReturnToPath: null,
  isSearchOpen: false,
  searchQuery: '',
  isDmSearchOpen: false,
  dmSearchQuery: '',
  targetMessageId: null,
  replyTo: null,
  mobileSidebarOpen: true, 

  setCurrentServer: (id) => {
    set({
      currentServerId: id,
      currentChannelId: null,
      isSearchOpen: false,
      searchQuery: '',
      isDmSearchOpen: false,
      dmSearchQuery: '',
      mobileSidebarOpen: true,
    });

    safePushState(buildChannelsPathname({ serverId: id, channelId: null }));
  },

  setCurrentChannel: (id) => {
    if (id) {
      useUnreadStore.getState().removeUnreadChannel(id);
      useHiddenStore.getState().removeHiddenChannel(id);
    }

    const serverId = get().currentServerId;

    set({
      currentChannelId: id,
      isDmSearchOpen: false,
      dmSearchQuery: '',
      mobileSidebarOpen: false,
    });

    safePushState(buildChannelsPathname({ serverId, channelId: id }));
  },

  hydrateFromRoute: (serverId, channelId) => {
    const prev = get();

    const nextServerId = serverId ?? null;
    const nextChannelId = channelId ?? null;

    const serverChanged = prev.currentServerId !== nextServerId;
    const channelChanged = prev.currentChannelId !== nextChannelId;

    if (!serverChanged && !channelChanged) return;

    if (nextChannelId) {
      useUnreadStore.getState().removeUnreadChannel(nextChannelId);
      useHiddenStore.getState().removeHiddenChannel(nextChannelId);
    }

    set({
      currentServerId: nextServerId,
      currentChannelId: nextChannelId,
      ...(serverChanged
        ? {
            isSearchOpen: false,
            searchQuery: '',
            isDmSearchOpen: false,
            dmSearchQuery: '',
          }
        : {}),
      ...(channelChanged
        ? {
            isDmSearchOpen: false,
            dmSearchQuery: '',
          }
        : {}),
      mobileSidebarOpen: nextChannelId ? false : true,
    });
  },

  toggleMemberList: () => set((state) => ({ isMemberListOpen: !state.isMemberListOpen })),
  setMemberListOpen: (isOpen) => set({ isMemberListOpen: isOpen }), // Implementation

  openSettings: () => {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : null;
    const returnTo =
      currentPath && (currentPath === '/settings' || currentPath.startsWith('/settings/')) ? null : currentPath;
    const nextTab = get().settingsTab ?? 'account';

    set((state) => ({
      isSettingsOpen: true,
      settingsTab: nextTab,
      settingsReturnToPath: state.settingsReturnToPath ?? returnTo,
    }));

    safePushState(buildSettingsPathname(nextTab));
  },

  openSettingsToTab: (tab) => {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : null;
    const returnTo =
      currentPath && (currentPath === '/settings' || currentPath.startsWith('/settings/')) ? null : currentPath;

    set((state) => ({
      isSettingsOpen: true,
      settingsTab: tab,
      settingsReturnToPath: state.settingsReturnToPath ?? returnTo,
    }));

    safePushState(buildSettingsPathname(tab));
  },

  closeSettings: () => {
    const returnTo = get().settingsReturnToPath;
    set({ isSettingsOpen: false, settingsReturnToPath: null });

    if (returnTo) {
      safePushState(returnTo);
    } else {
      safePushState(buildChannelsPathname({ serverId: get().currentServerId, channelId: get().currentChannelId }));
    }
  },

  selectSettingsTab: (tab) => {
    set({ settingsTab: tab });
    safePushState(buildSettingsPathname(tab));
  },

  hydrateSettingsFromRoute: (tab) => {
    const current = get();
    if (current.isSettingsOpen && current.settingsTab === tab) return;
    set({ isSettingsOpen: true, settingsTab: tab });
  },

  hydrateSettingsClosedFromRoute: () => {
    const current = get();
    if (!current.isSettingsOpen) return;
    set({ isSettingsOpen: false, settingsReturnToPath: null });
  },

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
