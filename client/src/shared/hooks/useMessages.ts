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

export const useMessages = (serverId: string | null, channelId: string | null) => {
  const queryClient = useQueryClient();
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

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
      const initial = sortAsc(res.data as Message[]);
      setHasMoreOlder((res.data as Message[]).length === DEFAULT_PAGE_SIZE);
      return initial;
    },
    enabled: !!channelId,
    refetchOnWindowFocus: false,
  });

  const fetchOlder = useCallback(async () => {
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
  }, [channelId, hasMoreOlder, isFetchingOlder, queryClient, serverId]);

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
