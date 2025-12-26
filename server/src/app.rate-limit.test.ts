import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

describe('app (rate limit wiring)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('mounts rate limit middleware when MEW_ENABLE_RATE_LIMIT=true', async () => {
    process.env.MEW_ENABLE_RATE_LIMIT = 'true';

    const { default: app } = await import('./app');
    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });

    // express-rate-limit with standardHeaders=true adds RateLimit-* headers.
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('ratelimit-remaining');
    expect(res.headers).toHaveProperty('ratelimit-reset');
  });
});

