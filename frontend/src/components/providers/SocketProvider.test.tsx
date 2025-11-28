import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import { SocketProvider, useSocket } from './SocketProvider';
import React from 'react';

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('@/lib/socket', () => ({
  getSocket: vi.fn(() => mockSocket),
}));

const TestComponent = () => {
  const { socket, isConnected } = useSocket();
  return (
    <div>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <p>Socket ready: {socket ? 'Yes' : 'No'}</p>
    </div>
  );
};

describe('SocketProvider', async () => {
  const { getSocket } = vi.mocked(await import('@/lib/socket'));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes socket connection on mount', () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );
    expect(getSocket).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Socket ready: Yes')).toBeInTheDocument();
  });

  it('updates isConnected state on "connect" event', () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    const connectCallback = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];

    act(() => {
      connectCallback();
    });

    expect(screen.getByText('Connected: Yes')).toBeInTheDocument();
  });

  it('updates isConnected state on "disconnect" event', () => {
    render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    // First connect
    const connectCallback = mockSocket.on.mock.calls.find(call => call[0] === 'connect')[1];
    act(() => {
      connectCallback();
    });
    expect(screen.getByText('Connected: Yes')).toBeInTheDocument();

    // Then disconnect
    const disconnectCallback = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];
    act(() => {
      disconnectCallback();
    });

    expect(screen.getByText('Connected: No')).toBeInTheDocument();
  });

  it('disconnects socket on unmount', () => {
    const { unmount } = render(
      <SocketProvider>
        <TestComponent />
      </SocketProvider>
    );

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});