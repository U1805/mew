import { create } from 'zustand';
import type { ChannelNotificationLevel, NotificationLevel, User, UserNotificationSettings } from '../types';

const DEFAULT_USER_SETTINGS: UserNotificationSettings = {
  soundEnabled: true,
  soundVolume: 0.6,
  desktopEnabled: false,
};

const loadStoredUserSettings = (): UserNotificationSettings => {
  try {
    const raw = localStorage.getItem('mew_user') || sessionStorage.getItem('mew_user');
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw) as User | null;
    const s = parsed?.notificationSettings;
    return {
      soundEnabled: s?.soundEnabled ?? DEFAULT_USER_SETTINGS.soundEnabled,
      soundVolume: typeof s?.soundVolume === 'number' ? s.soundVolume : DEFAULT_USER_SETTINGS.soundVolume,
      desktopEnabled: s?.desktopEnabled ?? DEFAULT_USER_SETTINGS.desktopEnabled,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
};

interface NotificationSettingsState {
  user: UserNotificationSettings;
  server: Record<string, NotificationLevel | undefined>;
  channel: Record<string, ChannelNotificationLevel | undefined>;

  hydrateFromUser: (user: User | null) => void;
  setUserSettings: (next: Partial<UserNotificationSettings>) => void;
  setServerLevel: (serverId: string, level: NotificationLevel) => void;
  setChannelLevel: (channelId: string, level: ChannelNotificationLevel) => void;
  setChannelLevels: (levels: Record<string, ChannelNotificationLevel | undefined>) => void;
  clear: () => void;
}

export const useNotificationSettingsStore = create<NotificationSettingsState>((set) => ({
  user: loadStoredUserSettings(),
  server: {},
  channel: {},

  hydrateFromUser: (user) =>
    set(() => ({
      user: {
        soundEnabled: user?.notificationSettings?.soundEnabled ?? DEFAULT_USER_SETTINGS.soundEnabled,
        soundVolume: typeof user?.notificationSettings?.soundVolume === 'number' ? user!.notificationSettings!.soundVolume : DEFAULT_USER_SETTINGS.soundVolume,
        desktopEnabled: user?.notificationSettings?.desktopEnabled ?? DEFAULT_USER_SETTINGS.desktopEnabled,
      },
    })),

  setUserSettings: (next) =>
    set((state) => ({
      user: {
        soundEnabled: typeof next.soundEnabled === 'boolean' ? next.soundEnabled : state.user.soundEnabled,
        soundVolume: typeof next.soundVolume === 'number' ? next.soundVolume : state.user.soundVolume,
        desktopEnabled: typeof next.desktopEnabled === 'boolean' ? next.desktopEnabled : state.user.desktopEnabled,
      },
    })),

  setServerLevel: (serverId, level) => set((state) => ({ server: { ...state.server, [serverId]: level } })),
  setChannelLevel: (channelId, level) => set((state) => ({ channel: { ...state.channel, [channelId]: level } })),
  setChannelLevels: (levels) => set(() => ({ channel: { ...levels } })),

  clear: () => set({ user: DEFAULT_USER_SETTINGS, server: {}, channel: {} }),
}));
