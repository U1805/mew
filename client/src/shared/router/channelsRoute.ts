import { safePushState, safeReplaceState } from './history';

export type ChannelsRouteState = {
  serverId: string | null;
  channelId: string | null;
};

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

export const buildChannelsPathname = ({ serverId, channelId }: ChannelsRouteState): string => {
  if (!serverId) {
    return channelId ? `/channels/@me/${encodeURIComponent(channelId)}` : '/channels/@me';
  }

  return channelId
    ? `/channels/${encodeURIComponent(serverId)}/${encodeURIComponent(channelId)}`
    : `/channels/${encodeURIComponent(serverId)}`;
};

export const parseChannelsPathname = (pathname: string): ChannelsRouteState | null => {
  const normalized = `/${trimSlashes(pathname)}`;
  const parts = trimSlashes(normalized).split('/').filter(Boolean);

  if (parts.length < 2) return null;
  if (parts[0] !== 'channels') return null;

  const first = parts[1];
  const second = parts.length >= 3 ? parts[2] : null;

  if (first === '@me') {
    return { serverId: null, channelId: second ? decodeURIComponent(second) : null };
  }

  return { serverId: decodeURIComponent(first), channelId: second ? decodeURIComponent(second) : null };
};

export { safePushState, safeReplaceState };
