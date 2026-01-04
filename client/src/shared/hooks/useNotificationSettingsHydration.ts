import { useEffect } from 'react';
import { memberApi, userApi } from '../services/api';
import { useAuthStore, useNotificationSettingsStore } from '../stores';
import type { ChannelNotificationLevel, Server, UserNotificationSettings } from '../types';

export const useNotificationSettingsHydration = (servers: Server[] | undefined) => {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);

  const setUserSettings = useNotificationSettingsStore((s) => s.setUserSettings);
  const setServerLevel = useNotificationSettingsStore((s) => s.setServerLevel);
  const setChannelLevels = useNotificationSettingsStore((s) => s.setChannelLevels);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await userApi.getNotificationSettings();
        if (cancelled) return;

        const settings = res.data as UserNotificationSettings;
        setUserSettings(settings);

        if (user) {
          const remember = !!localStorage.getItem('mew_token');
          setAuth(token, { ...user, notificationSettings: settings }, remember);
        }
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, setAuth, setUserSettings, user]);

  useEffect(() => {
    if (!token) return;

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
        setChannelLevels(next);
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, setChannelLevels]);

  useEffect(() => {
    if (!token) return;
    if (!servers || servers.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          servers.map(async (s) => {
            try {
              const res = await memberApi.getMyNotificationSettings(s._id);
              return { serverId: s._id, notificationLevel: res.data?.notificationLevel };
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;
        results.filter(Boolean).forEach((r: any) => {
          if (r?.serverId && r?.notificationLevel) {
            setServerLevel(r.serverId, r.notificationLevel);
          }
        });
      } catch {
        // best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, servers, setServerLevel]);
};

