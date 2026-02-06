import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

const extractCookieValue = (setCookie: string[] | undefined, name: string): string | null => {
  const all = setCookie || [];
  for (const c of all) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m && m[1]) return m[1];
  }
  return null;
};

describe('Auth CSRF', () => {
  it('rejects unsafe requests with Origin when CSRF token is missing', async () => {
    const origin = 'http://localhost:5173';
    const res = await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ email: 'csrf-missing-1@example.com', username: 'csrfmissing1', password: 'password123' });
    expect(res.statusCode).toBe(403);
    expect(res.body?.message).toContain('CSRF');
  });

  it('accepts unsafe requests with Origin when CSRF header matches cookie', async () => {
    const origin = 'http://localhost:5173';

    const csrfRes = await request(app).get('/api/auth/csrf').set('Origin', origin);
    expect(csrfRes.statusCode).toBe(204);

    const csrfSetCookie = csrfRes.headers['set-cookie'] as string[] | undefined;
    const csrfToken = extractCookieValue(csrfSetCookie, 'mew_csrf_token');
    expect(csrfToken).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/register')
      .set('Origin', origin)
      .set('X-Mew-Csrf-Token', csrfToken as string)
      .set('Cookie', csrfSetCookie || [])
      .send({ email: 'csrf-ok-1@example.com', username: 'csrfok1', password: 'password123' });

    expect(res.statusCode).toBe(201);
    expect(res.body?.user?.email).toBe('csrf-ok-1@example.com');
  });

  it('rejects unsafe cookie-auth requests without Origin when CSRF token is missing', async () => {
    const user = { email: 'csrf-cookie-1@example.com', username: 'csrfcookie1', password: 'password123' };
    const regRes = await request(app).post('/api/auth/register').send(user);
    expect(regRes.statusCode).toBe(201);
    const authCookies = regRes.headers['set-cookie'] as string[] | undefined;

    const res = await request(app).post('/api/auth/logout').set('Cookie', authCookies || []);
    expect(res.statusCode).toBe(403);
    expect(res.body?.message).toContain('CSRF');
  });
});
