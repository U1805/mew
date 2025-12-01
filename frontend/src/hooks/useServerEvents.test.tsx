import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useServerEvents } from './useServerEvents';
import { getSocket } from '../services/socket';
import { EventEmitter } from 'events';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the socket service
vi.mock('../services/socket');

class MockSocket extends EventEmitter {}

const queryClient = new QueryClient();
const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useServerEvents', () => {
  let mockSocket;

  beforeEach(() => {
    mockSocket = new MockSocket();
    getSocket.mockReturnValue(mockSocket);
    vi.spyOn(queryClient, 'setQueryData');
    vi.spyOn(queryClient, 'invalidateQueries');
    vi.clearAllMocks();
  });

  it('should handle CATEGORY_UPDATE event and update query cache', () => {
    const serverId = 'server-1';
    const updatedCategory = { _id: 'category-1', name: 'Updated Name', serverId };

    renderHook(() => useServerEvents(serverId), { wrapper });

    mockSocket.emit('CATEGORY_UPDATE', updatedCategory);

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['categories', serverId],
      expect.any(Function)
    );
  });

  it('should handle CATEGORY_DELETE event and update query cache', () => {
    const serverId = 'server-1';
    const deletedData = { categoryId: 'category-1' };

    renderHook(() => useServerEvents(serverId), { wrapper });

    mockSocket.emit('CATEGORY_DELETE', deletedData);

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['categories', serverId],
      expect.any(Function)
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['channels', serverId] });
  });

  it('should not update cache if category update is for a different server', () => {
    const serverId = 'server-1';
    const otherServerId = 'server-2';
    const updatedCategory = { _id: 'category-1', name: 'Updated Name', serverId: otherServerId };

    renderHook(() => useServerEvents(serverId), { wrapper });

    mockSocket.emit('CATEGORY_UPDATE', updatedCategory);

    expect(queryClient.setQueryData).not.toHaveBeenCalled();
  });
});
