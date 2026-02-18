import { safePushState, safeReplaceState } from './history';

export type SettingsTab = 'account' | 'notifications' | 'plugins' | 'bots' | 'stickers' | 'voiceVideo';

export const isSettingsTab = (value: string): value is SettingsTab =>
  value === 'account' ||
  value === 'notifications' ||
  value === 'plugins' ||
  value === 'bots' ||
  value === 'stickers' ||
  value === 'voiceVideo';

export const buildSettingsPathname = (tab?: SettingsTab): string => {
  if (!tab || tab === 'account') return '/settings';
  return `/settings/${encodeURIComponent(tab)}`;
};

export const parseSettingsPathname = (pathname: string): SettingsTab | null => {
  if (pathname === '/settings') return 'account';
  if (!pathname.startsWith('/settings/')) return null;

  const rawTab = pathname.slice('/settings/'.length);
  if (!rawTab) return 'account';

  const tab = decodeURIComponent(rawTab);
  return isSettingsTab(tab) ? tab : null;
};

export const navigateSettings = (tab?: SettingsTab, opts?: { replace?: boolean }) => {
  const path = buildSettingsPathname(tab);
  if (opts?.replace) safeReplaceState(path);
  else safePushState(path);
};

export { safePushState, safeReplaceState };

