import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { messageApi } from '../services/api';
import { Message } from '../types';

const DEFAULT_PAGE_SIZE = 50;

const isValidObjectId = (id: string) => /^[0-9a-fA-F]{24}$/.test(id);

const sortAsc = (messages: Message[]) =>
  [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

const mergeByIdAsc = (base: Message[], incoming: Message[]) => {
  const mergedById = new Map<string, Message>();
  base.forEach((m) => mergedById.set(m._id, m));
  incoming.forEach((m) => mergedById.set(m._id, m));
  return sortAsc(Array.from(mergedById.values()));
};

export const useMessages = (
  serverId: string | null,
  channelId: string | null,
  options?: { enabled?: boolean }
) => {
  const queryClient = useQueryClient();
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    setIsFetchingOlder(false);
    setHasMoreOlder(true);
  }, [channelId]);

  const query = useQuery({
    queryKey: ['messages', channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const res = await messageApi.list(serverId ?? undefined, channelId, {
        limit: DEFAULT_PAGE_SIZE,
      });
      const latestPage = sortAsc(res.data as Message[]);
      const current = (queryClient.getQueryData(['messages', channelId]) as Message[] | undefined) ?? [];

      // Keep already loaded history; refresh only updates/extends the latest window.
      const merged = mergeByIdAsc(current, latestPage);
      setHasMoreOlder((prev) => prev && (res.data as Message[]).length === DEFAULT_PAGE_SIZE);
      return merged;
    },
    enabled: !!channelId && enabled,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Socket events are the primary realtime path; this polling is a safety net for dropped events.
    refetchInterval: enabled && channelId ? 15000 : false,
    refetchIntervalInBackground: false,
  });

  const fetchOlder = useCallback(async () => {
    if (!enabled) return;
    if (!channelId) return;
    if (isFetchingOlder || !hasMoreOlder) return;

    const current = (queryClient.getQueryData(['messages', channelId]) as Message[] | undefined) ?? [];
    const oldestRealMessageId = current.find((m) => isValidObjectId(m._id))?._id;
    if (!oldestRealMessageId) {
      setHasMoreOlder(false);
      return;
    }

    setIsFetchingOlder(true);
    try {
      const res = await messageApi.list(serverId ?? undefined, channelId, {
        limit: DEFAULT_PAGE_SIZE,
        before: oldestRealMessageId,
      });

      const older = sortAsc(res.data as Message[]);
      if (!older.length) {
        setHasMoreOlder(false);
        return;
      }

      queryClient.setQueryData(['messages', channelId], (old: Message[] | undefined) => {
        const existing = old ?? [];
        const existingIds = new Set(existing.map((m) => m._id));
        const toPrepend = older.filter((m) => !existingIds.has(m._id));
        return sortAsc([...toPrepend, ...existing]);
      });

      setHasMoreOlder((res.data as Message[]).length === DEFAULT_PAGE_SIZE);
    } finally {
      setIsFetchingOlder(false);
    }
  }, [channelId, enabled, hasMoreOlder, isFetchingOlder, queryClient, serverId]);

  return useMemo(
    () => ({
      ...query,
      fetchOlder,
      isFetchingOlder,
      hasMoreOlder,
    }),
    [fetchOlder, hasMoreOlder, isFetchingOlder, query]
  );
};
