import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../config', async () => {
  const actual = await vi.importActual<typeof import('../../config')>('../../config');
  return { default: { ...actual.default, allowUserRegistration: false } };
});

describe('Auth Routes (registration disabled)', () => {
  it('should return 403 when registration is disabled', async () => {
    const app = (await import('../../app')).default;

    const configRes = await request(app).get('/api/auth/config');
    expect(configRes.statusCode).toBe(200);
    expect(configRes.body).toEqual({ allowUserRegistration: false });

    const userData = {
      email: 'register-disabled-1@example.com',
      username: 'registerdisabled1',
      password: 'password123',
    };

    const res = await request(app).post('/api/auth/register').send(userData);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('User registration is disabled.');
  });
});
