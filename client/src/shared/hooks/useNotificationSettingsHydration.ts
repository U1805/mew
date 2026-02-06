import { useEffect, useMemo } from 'react';
import { memberApi, userApi } from '../services/api';
import { useNotificationSettingsStore } from '../stores';
import { useAuthStore } from '../stores/authStore';
import type { ChannelNotificationLevel, Server, UserNotificationSettings } from '../types';

const sameUserNotificationSettings = (a?: UserNotificationSettings, b?: UserNotificationSettings) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.soundEnabled === b.soundEnabled && a.soundVolume === b.soundVolume && a.desktopEnabled === b.desktopEnabled;
};

const sameChannelLevels = (
  a: Record<string, ChannelNotificationLevel | undefined>,
  b: Record<string, ChannelNotificationLevel | undefined>
) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
};

export const useNotificationSettingsHydration = (servers: Server[] | undefined) => {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);

  const setUserSettings = useNotificationSettingsStore((s) => s.setUserSettings);
  const setServerLevel = useNotificationSettingsStore((s) => s.setServerLevel);
  const setChannelLevels = useNotificationSettingsStore((s) => s.setChannelLevels);

  const serverIdsKey = useMemo(() => {
    return (servers || [])
      .map((s) => s?._id)
      .filter(Boolean)
      .sort()
      .join('|');
  }, [servers]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await userApi.getNotificationSettings();
        if (cancelled) return;

        const settings = res.data as UserNotificationSettings;
        const currentNotif = useNotificationSettingsStore.getState().user;
        if (!sameUserNotificationSettings(currentNotif, settings)) {
          setUserSettings(settings);
        }

        const currentUser = useAuthStore.getState().user;
        if (currentUser && !sameUserNotificationSettings(currentUser.notificationSettings, settings)) {
          setUser({ ...currentUser, notificationSettings: settings });
        }
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, setUser, setUserSettings]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await userApi.getChannelNotificationSettings();
        if (cancelled) return;
        const rows = (Array.isArray(res.data) ? res.data : []) as Array<{ channelId: string; level: ChannelNotificationLevel }>;
        const next: Record<string, ChannelNotificationLevel> = {};
        rows.forEach((r) => {
          if (r?.channelId && r?.level) next[r.channelId] = r.level;
        });
        const current = useNotificationSettingsStore.getState().channel;
        if (!sameChannelLevels(current, next)) setChannelLevels(next);
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, setChannelLevels]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!serverIdsKey) return;

    let cancelled = false;
    (async () => {
      try {
        const serverIds = serverIdsKey.split('|').filter(Boolean);
        const results = await Promise.all(
          serverIds.map(async (serverId) => {
            try {
              const res = await memberApi.getMyNotificationSettings(serverId);
              return { serverId, notificationLevel: res.data?.notificationLevel };
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;
        const currentServerLevels = useNotificationSettingsStore.getState().server;
        results.filter(Boolean).forEach((r: any) => {
          if (r?.serverId && r?.notificationLevel) {
            if (currentServerLevels[r.serverId] !== r.notificationLevel) {
              setServerLevel(r.serverId, r.notificationLevel);
            }
          }
        });
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, serverIdsKey, setServerLevel]);
};


