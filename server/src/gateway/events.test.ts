import { describe, it, expect, vi } from 'vitest';
import { SocketManager } from './events';

describe('gateway/SocketManager', () => {
  it('throws if getIO is called before init', () => {
    const manager = new SocketManager();
    expect(() => manager.getIO()).toThrow('Socket.IO not initialized!');
  });

  it('broadcast emits to room when initialized', () => {
    const manager = new SocketManager();
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    (manager as any).io = { to };

    manager.broadcast('EVENT', 'room1', { a: 1 });

    expect(to).toHaveBeenCalledWith('room1');
    expect(emit).toHaveBeenCalledWith('EVENT', { a: 1 });
  });

  it('broadcastToUser emits to user room when initialized', () => {
    const manager = new SocketManager();
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    (manager as any).io = { to };

    manager.broadcastToUser('u1', 'EVENT', { ok: true });

    expect(to).toHaveBeenCalledWith('u1');
    expect(emit).toHaveBeenCalledWith('EVENT', { ok: true });
  });
});

