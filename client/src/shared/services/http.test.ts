import { describe, it, expect, beforeEach, vi } from 'vitest';

let token: string | null = null;
const requestUse = vi.fn();
const responseUse = vi.fn();

vi.mock('axios', () => {
  const instance = { interceptors: { request: { use: requestUse }, response: { use: responseUse } } };
  return {
    default: {
      create: vi.fn(() => instance),
      post: vi.fn(),
    },
  };
});

vi.mock('../stores', () => ({
  useAuthStore: {
    getState: () => ({ token }),
  },
}));

describe('shared/services/http', () => {
  beforeEach(() => {
    token = null;
    requestUse.mockClear();
    responseUse.mockClear();
    vi.resetModules();
  });

  it('attaches Authorization header when token exists', async () => {
    token = 't1';
    const httpModule = await import('./http');
    expect(requestUse).toHaveBeenCalledTimes(1);
    const interceptor = requestUse.mock.calls[0][0] as (config: any) => any;

    const config = { headers: {} as Record<string, string> };
    const result = interceptor(config);

    expect(result.headers.Authorization).toBe('Bearer t1');
    expect(httpModule.API_URL).toContain('/api');
  });

  it('does not set Authorization when no token', async () => {
    token = null;
    await import('./http');
    const interceptor = requestUse.mock.calls[0][0] as (config: any) => any;

    const config = { headers: {} as Record<string, string> };
    const result = interceptor(config);

    expect(result.headers.Authorization).toBeUndefined();
  });
});

