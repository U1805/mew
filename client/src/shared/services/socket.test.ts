import { describe, it, expect, beforeEach, vi } from 'vitest';

const on = vi.fn();
const disconnect = vi.fn();
const connect = vi.fn();
const io = vi.fn(() => ({ on, disconnect, connect }));
let status: 'unknown' | 'authenticated' | 'unauthenticated' = 'unauthenticated';
const logout = vi.fn();

vi.mock('socket.io-client', () => ({
  io: (...args: any[]) => (io as any)(...args),
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('./http', () => ({
  API_URL: '/api',
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({ status, logout }),
  },
}));

describe('shared/services/socket', () => {
  beforeEach(() => {
    status = 'unauthenticated';
    io.mockClear();
    on.mockClear();
    disconnect.mockClear();
    connect.mockClear();
    logout.mockClear();
    vi.resetModules();
  });

  it('returns null when unauthenticated', async () => {
    const { getSocket } = await import('./socket');
    expect(getSocket()).toBeNull();
    expect(io).not.toHaveBeenCalled();
  });

  it('creates a singleton socket when authenticated', async () => {
    status = 'authenticated';
    const { getSocket, disconnectSocket } = await import('./socket');

    const s1 = getSocket();
    const s2 = getSocket();

    expect(s1).toBeTruthy();
    expect(s2).toBe(s1);
    expect(io).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledWith(
      expect.objectContaining({
        transports: ['websocket', 'polling'],
        withCredentials: true,
      })
    );
    expect(on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(on).toHaveBeenCalledWith('disconnect', expect.any(Function));

    disconnectSocket();
    expect(disconnect).toHaveBeenCalledTimes(1);

    const s3 = getSocket();
    expect(io).toHaveBeenCalledTimes(2);
    expect(s3).not.toBe(s1);
  });
});

