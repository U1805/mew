import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useMessages } from './useMessages';
import { messageApi } from '../services/api';

// Mock the messageApi
vi.mock('../services/api', () => ({
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
  const TestProvider = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  TestProvider.displayName = 'TestProvider';
  return TestProvider;
};

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch messages for DM when serverId is null', async () => {
    (messageApi.list as Mock).mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useMessages(null, 'channel-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(messageApi.list).toHaveBeenCalledWith(undefined, 'channel-1', { limit: 50 });
  });

  it('should not fetch messages if channelId is null', () => {
    renderHook(() => useMessages('server-1', null), { wrapper: createWrapper() });
    expect(messageApi.list).not.toHaveBeenCalled();
  });

  it('should fetch and return sorted messages when serverId and channelId are provided', async () => {
    const mockMessages = [
      { _id: '1', content: 'Hello', createdAt: new Date('2023-01-01T10:00:00Z').toISOString() },
      { _id: '2', content: 'World', createdAt: new Date('2023-01-01T09:00:00Z').toISOString() }, // Unsorted
    ];
    (messageApi.list as Mock).mockResolvedValue({ data: mockMessages });

    const { result } = renderHook(() => useMessages('server-1', 'channel-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(messageApi.list).toHaveBeenCalledWith('server-1', 'channel-1', { limit: 50 });
    expect(result.current.data).toEqual([
      { _id: '2', content: 'World', createdAt: new Date('2023-01-01T09:00:00Z').toISOString() },
      { _id: '1', content: 'Hello', createdAt: new Date('2023-01-01T10:00:00Z').toISOString() },
    ]);
  });

  it('should return an empty array if the API call fails', async () => {
    (messageApi.list as Mock).mockRejectedValue(new Error('API Error'));
    const { result } = renderHook(() => useMessages('server-1', 'channel-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });

  it('does not fetch when disabled', () => {
    renderHook(() => useMessages('server-1', 'channel-1', { enabled: false }), { wrapper: createWrapper() });
    expect(messageApi.list).not.toHaveBeenCalled();
  });

  it('preserves already-loaded older messages when latest page refetches', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          refetchInterval: false,
        },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    queryClient.setQueryData(['messages', 'channel-1'], [
      { _id: 'older-1', content: 'older', createdAt: new Date('2023-01-01T08:00:00Z').toISOString() },
      { _id: 'newer-1', content: 'newer', createdAt: new Date('2023-01-01T09:00:00Z').toISOString() },
    ]);

    (messageApi.list as Mock).mockResolvedValue({
      data: [
        { _id: 'newer-1', content: 'newer-updated', createdAt: new Date('2023-01-01T09:00:00Z').toISOString() },
        { _id: 'latest-1', content: 'latest', createdAt: new Date('2023-01-01T10:00:00Z').toISOString() },
      ],
    });

    const { result } = renderHook(() => useMessages('server-1', 'channel-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { _id: 'older-1', content: 'older', createdAt: new Date('2023-01-01T08:00:00Z').toISOString() },
      { _id: 'newer-1', content: 'newer-updated', createdAt: new Date('2023-01-01T09:00:00Z').toISOString() },
      { _id: 'latest-1', content: 'latest', createdAt: new Date('2023-01-01T10:00:00Z').toISOString() },
    ]);
  });
});
