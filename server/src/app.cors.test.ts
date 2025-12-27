import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import config from './config';
import app from './app';

describe('app (CORS origin branches)', () => {
  const originalCors = {
    allowAnyOrigin: config.cors.allowAnyOrigin,
    allowedOrigins: [...config.cors.allowedOrigins],
  };

  beforeAll(() => {
    config.cors.allowAnyOrigin = originalCors.allowAnyOrigin;
    config.cors.allowedOrigins = [...originalCors.allowedOrigins];
  });

  afterAll(() => {
    config.cors.allowAnyOrigin = originalCors.allowAnyOrigin;
    config.cors.allowedOrigins = [...originalCors.allowedOrigins];
  });

  it('allows any origin when allowAnyOrigin=true', async () => {
    config.cors.allowAnyOrigin = true;
    config.cors.allowedOrigins = [];
    const origin = 'http://example.test';
    const res = await request(app).get('/api/health').set('Origin', origin);

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('allows Origin when it is in allowedOrigins', async () => {
    config.cors.allowAnyOrigin = false;
    config.cors.allowedOrigins = ['http://allowed.test'];
    const res = await request(app).get('/api/health').set('Origin', 'http://allowed.test');

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.test');
  });

  it('does not set CORS headers for disallowed Origin', async () => {
    config.cors.allowAnyOrigin = false;
    config.cors.allowedOrigins = ['http://allowed.test'];
    const res = await request(app).get('/api/health').set('Origin', 'http://blocked.test');

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
