import { describe, it, expect, beforeEach, vi } from 'vitest';

const requestUse = vi.fn();
const responseUse = vi.fn();
const create = vi.fn();
const post = vi.fn();

vi.mock('axios', () => {
  const instance = { interceptors: { request: { use: requestUse }, response: { use: responseUse } } };
  return {
    default: {
      create: (...args: any[]) => (create as any)(...args) || instance,
      post: (...args: any[]) => (post as any)(...args),
    },
  };
});

describe('shared/services/http', () => {
  beforeEach(() => {
    requestUse.mockClear();
    responseUse.mockClear();
    create.mockClear();
    post.mockClear();
    vi.resetModules();
  });

  it('creates an axios instance with withCredentials enabled', async () => {
    const httpModule = await import('./http');
    expect(httpModule.API_URL).toContain('/api');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: httpModule.API_URL,
        withCredentials: true,
      })
    );
    expect(requestUse).not.toHaveBeenCalled();
  });
});

