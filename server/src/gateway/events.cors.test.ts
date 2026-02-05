import { describe, it, expect, vi } from 'vitest';
import http from 'http';

const callOrigin = (originFn: (origin: string | undefined, cb: (err: any, allow?: boolean) => void) => void, origin?: string) =>
  new Promise<boolean>((resolve, reject) => {
    originFn(origin, (err, allow) => {
      if (err) return reject(err);
      resolve(allow === true);
    });
  });

describe('gateway/events Socket.IO CORS', () => {
  it('allows missing Origin and allowlisted origins, blocks others', async () => {
    vi.resetModules();
    vi.doMock('../config', () => ({
      default: { cors: { allowAnyOrigin: false, allowedOrigins: ['https://a.test'] } },
    }));

    const { SocketManager } = await import('./events');
    const mgr = new SocketManager();
    const io = mgr.init(http.createServer());
    const originFn = (io as any).opts?.cors?.origin as any;

    expect(typeof originFn).toBe('function');
    await expect(callOrigin(originFn, undefined)).resolves.toBe(true);
    await expect(callOrigin(originFn, 'https://a.test')).resolves.toBe(true);
    await expect(callOrigin(originFn, 'https://b.test')).resolves.toBe(false);
  });

  it('allows any origin when allowAnyOrigin=true', async () => {
    vi.resetModules();
    vi.doMock('../config', () => ({
      default: { cors: { allowAnyOrigin: true, allowedOrigins: [] } },
    }));

    const { SocketManager } = await import('./events');
    const mgr = new SocketManager();
    const io = mgr.init(http.createServer());
    const originFn = (io as any).opts?.cors?.origin as any;

    await expect(callOrigin(originFn, 'https://anything.test')).resolves.toBe(true);
  });
});

