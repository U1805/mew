import { describe, it, expect, beforeEach, vi } from 'vitest';

const on = vi.fn();
const disconnect = vi.fn();
const io = vi.fn(() => ({ on, disconnect }));

vi.mock('socket.io-client', () => ({
  io: (...args: any[]) => (io as any)(...args),
}));

describe('shared/services/socket', () => {
  beforeEach(() => {
    localStorage.removeItem('mew_token');
    sessionStorage.removeItem('mew_token');
    io.mockClear();
    on.mockClear();
    disconnect.mockClear();
    vi.resetModules();
  });

  it('returns null when token is missing', async () => {
    const { getSocket } = await import('./socket');
    expect(getSocket()).toBeNull();
    expect(io).not.toHaveBeenCalled();
  });

  it('creates a singleton socket when token exists', async () => {
    localStorage.setItem('mew_token', 'abc');
    const { getSocket, disconnectSocket } = await import('./socket');

    const s1 = getSocket();
    const s2 = getSocket();

    expect(s1).toBeTruthy();
    expect(s2).toBe(s1);
    expect(io).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { token: 'abc' },
        transports: ['websocket', 'polling'],
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

