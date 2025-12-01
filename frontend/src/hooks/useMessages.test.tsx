import { renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useMessages } from './useMessages';
import { messageApi } from '@/services/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the messageApi
vi.mock('@/services/api', () => ({
  messageApi: {
    list: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not fetch messages if serverId or channelId are null', () => {
    renderHook(() => useMessages(null, 'channel-1'), { wrapper: createWrapper() });
    expect(messageApi.list).not.toHaveBeenCalled();

    renderHook(() => useMessages('server-1', null), { wrapper: createWrapper() });
    expect(messageApi.list).not.toHaveBeenCalled();
  });

  it('should fetch and return sorted messages when serverId and channelId are provided', async () => {
    const mockMessages = [
      { _id: '1', content: 'Hello', createdAt: new Date('2023-01-01T10:00:00Z').toISOString() },
      { _id: '2', content: 'World', createdAt: new Date('2023-01-01T09:00:00Z').toISOString() }, // Unsorted
    ];
    (messageApi.list as vi.Mock).mockResolvedValue({ data: mockMessages });

    const { result } = renderHook(() => useMessages('server-1', 'channel-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(messageApi.list).toHaveBeenCalledWith('server-1', 'channel-1');
    expect(result.current.data).toEqual([
      { _id: '2', content: 'World', createdAt: new Date('2023-01-01T09:00:00Z').toISOString() },
      { _id: '1', content: 'Hello', createdAt: new Date('2023-01-01T10:00:00Z').toISOString() },
    ]);
  });

  it('should return an empty array if the API call fails', async () => {
    (messageApi.list as vi.Mock).mockRejectedValue(new Error('API Error'));
    const { result } = renderHook(() => useMessages('server-1', 'channel-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });
});