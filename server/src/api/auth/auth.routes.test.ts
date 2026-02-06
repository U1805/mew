import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';
import User from '../user/user.model';
import Bot from '../bot/bot.model';
import mongoose from 'mongoose';

const extractCookieValue = (setCookie: string[] | undefined, name: string): string | null => {
  const all = setCookie || [];
  for (const c of all) {
    const m = c.match(new RegExp(`^${name}=([^;]+)`));
    if (m && m[1]) return m[1];
  }
  return null;
};

const getCsrfSession = async () => {
  const csrfRes = await request(app).get('/api/auth/csrf');
  const csrfCookies = (csrfRes.headers['set-cookie'] as string[] | undefined) || [];
  const csrfToken = extractCookieValue(csrfCookies, 'mew_csrf_token');
  return { csrfCookies, csrfToken };
};

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'register-success-1@example.com',
        username: 'registersuccess1',
        password: 'password123',
      };
      const res = await request(app).post('/api/auth/register').send(userData);
      expect(res.statusCode).toBe(201);
      expect(res.body.user.email).toBe(userData.email);
      expect(res.body.token).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should issue a session refresh cookie by default (no rememberMe)', async () => {
      const userData = {
        email: 'register-session-1@example.com',
        username: 'registersession1',
        password: 'password123',
      };
      const res = await request(app).post('/api/auth/register').send(userData);
      expect(res.statusCode).toBe(201);
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect((cookies || []).join(';')).not.toContain('Max-Age=');
    });

    it('should issue a persistent refresh cookie when rememberMe=true', async () => {
      const userData = {
        email: 'register-persistent-1@example.com',
        username: 'registerpersistent1',
        password: 'password123',
        rememberMe: true,
      };
      const res = await request(app).post('/api/auth/register').send(userData);
      expect(res.statusCode).toBe(201);
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect((cookies || []).join(';')).toContain('Max-Age=');
    });

    it('should return 409 if email is already taken', async () => {
      const userData = {
        email: 'register-conflict-1@example.com',
        username: 'registerconflict1',
        password: 'password123',
      };
      await request(app).post('/api/auth/register').send(userData); // First time
      const res = await request(app).post('/api/auth/register').send(userData); // Second time
      expect(res.statusCode).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should return 400 for invalid data', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'invalid' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should log in an existing user successfully', async () => {
      const userData = {
        email: 'login-success-1@example.com',
        username: 'loginsuccess1',
        password: 'password123',
      };
      await request(app).post('/api/auth/register').send(userData);
      const res = await request(app).post('/api/auth/login').send({
        email: userData.email,
        password: userData.password,
        rememberMe: true,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(userData.email);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should issue a session refresh cookie when rememberMe=false', async () => {
      const userData = {
        email: 'login-session-1@example.com',
        username: 'loginsession1',
        password: 'password123',
      };
      await request(app).post('/api/auth/register').send(userData);
      const res = await request(app).post('/api/auth/login').send({
        email: userData.email,
        password: userData.password,
        rememberMe: false,
      });

      expect(res.statusCode).toBe(200);
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      expect((cookies || []).join(';')).not.toContain('Max-Age=');
    });

    it('should return 401 for incorrect password', async () => {
      const userData = {
        email: 'login-fail-1@example.com',
        username: 'loginfail1',
        password: 'password123',
      };
      await request(app).post('/api/auth/register').send(userData);
      const res = await request(app).post('/api/auth/login').send({
        email: userData.email,
        password: 'wrongpassword',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('cookie-only auth endpoints', () => {
    it('POST /api/auth/register-cookie returns user without token', async () => {
      const userData = {
        email: 'register-cookie-1@example.com',
        username: 'registercookie1',
        password: 'password123',
      };
      const res = await request(app).post('/api/auth/register-cookie').send(userData);
      expect(res.statusCode).toBe(201);
      expect(res.body.user.email).toBe(userData.email);
      expect(res.body.token).toBeUndefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('POST /api/auth/login-cookie returns user without token', async () => {
      const userData = {
        email: 'login-cookie-1@example.com',
        username: 'logincookie1',
        password: 'password123',
      };
      await request(app).post('/api/auth/register').send(userData);
      const res = await request(app).post('/api/auth/login-cookie').send({
        email: userData.email,
        password: userData.password,
        rememberMe: true,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.user.email).toBe(userData.email);
      expect(res.body.token).toBeUndefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('POST /api/auth/refresh-cookie rotates refresh token and returns user without token', async () => {
      const userData = {
        email: 'refresh-cookie-1@example.com',
        username: 'refreshcookie1',
        password: 'password123',
      };

      await request(app).post('/api/auth/register').send(userData);
      const loginRes = await request(app).post('/api/auth/login-cookie').send({
        email: userData.email,
        password: userData.password,
        rememberMe: true,
      });

      expect(loginRes.statusCode).toBe(200);
      const cookies = loginRes.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();

      const { csrfCookies, csrfToken } = await getCsrfSession();
      const refreshRes = await request(app)
        .post('/api/auth/refresh-cookie')
        .set('X-Mew-Csrf-Token', csrfToken || '')
        .set('Cookie', [...(cookies || []), ...csrfCookies]);
      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.body.user).toBeDefined();
      expect(refreshRes.body.token).toBeUndefined();
      expect(refreshRes.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/bot', () => {
    it('should exchange bot accessToken for a JWT', async () => {
      const botUser = await User.create({
        email: 'bot-login-1@internal.mew',
        username: 'bot-login-1',
        password: 'x'.repeat(20),
        isBot: true,
      });

      const accessToken = 't'.repeat(32);
      await Bot.create({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'echo-bot',
        accessToken,
        serviceType: 'rss-fetcher',
        dmEnabled: true,
        config: '{}',
        botUserId: botUser._id,
      });

      const res = await request(app).post('/api/auth/bot').send({ accessToken });
      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user?._id).toBe(botUser._id.toString());
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should return 401 for invalid bot accessToken', async () => {
      const res = await request(app).post('/api/auth/bot').send({ accessToken: 'nope' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('bot refresh flow', () => {
    it('should allow /api/auth/refresh after /api/auth/bot', async () => {
      const botUser = await User.create({
        email: 'bot-refresh-1@internal.mew',
        username: 'bot-refresh-1',
        password: 'x'.repeat(20),
        isBot: true,
      });

      const accessToken = 'r'.repeat(32);
      await Bot.create({
        ownerId: new mongoose.Types.ObjectId(),
        name: 'bot-refresh',
        accessToken,
        serviceType: 'rss-fetcher',
        dmEnabled: true,
        config: '{}',
        botUserId: botUser._id,
      });

      const loginRes = await request(app).post('/api/auth/bot').send({ accessToken });
      expect(loginRes.statusCode).toBe(200);
      const cookies = loginRes.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();

      const { csrfCookies, csrfToken } = await getCsrfSession();
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('X-Mew-Csrf-Token', csrfToken || '')
        .set('Cookie', [...(cookies || []), ...csrfCookies]);
      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.body.token).toBeDefined();
      expect(refreshRes.body.user?._id).toBe(botUser._id.toString());
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate refresh token and return a new access token', async () => {
      const userData = {
        email: 'refresh-1@example.com',
        username: 'refreshuser1',
        password: 'password123',
      };

      await request(app).post('/api/auth/register').send(userData);
      const loginRes = await request(app).post('/api/auth/login').send({
        email: userData.email,
        password: userData.password,
        rememberMe: true,
      });

      expect(loginRes.statusCode).toBe(200);
      const cookies = loginRes.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();

      const { csrfCookies, csrfToken } = await getCsrfSession();
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('X-Mew-Csrf-Token', csrfToken || '')
        .set('Cookie', [...(cookies || []), ...csrfCookies]);
      expect(refreshRes.statusCode).toBe(200);
      expect(refreshRes.body.token).toBeDefined();
      expect(refreshRes.headers['set-cookie']).toBeDefined();

      // Old refresh token should no longer be valid after rotation.
      const refreshAgainOld = await request(app)
        .post('/api/auth/refresh')
        .set('X-Mew-Csrf-Token', csrfToken || '')
        .set('Cookie', [...(cookies || []), ...csrfCookies]);
      expect(refreshAgainOld.statusCode).toBe(401);
    });

    it('should return 403 when CSRF token is missing on refresh (even without refresh cookie)', async () => {
      const res = await request(app).post('/api/auth/refresh');
      expect(res.statusCode).toBe(403);
    });

    it('should return 401 when refresh cookie is missing but CSRF is valid', async () => {
      const { csrfCookies, csrfToken } = await getCsrfSession();
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('X-Mew-Csrf-Token', csrfToken || '')
        .set('Cookie', csrfCookies);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should revoke refresh token and clear cookie', async () => {
      const userData = {
        email: 'logout-1@example.com',
        username: 'logoutuser1',
        password: 'password123',
      };

      await request(app).post('/api/auth/register').send(userData);
      const loginRes = await request(app).post('/api/auth/login').send({
        email: userData.email,
        password: userData.password,
        rememberMe: true,
      });

      const cookies = loginRes.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();

      const { csrfCookies, csrfToken } = await getCsrfSession();
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('X-Mew-Csrf-Token', csrfToken || '')
        .set('Cookie', [...(cookies || []), ...csrfCookies]);
      expect(logoutRes.statusCode).toBe(204);
      expect(logoutRes.headers['set-cookie']).toBeDefined();

      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('X-Mew-Csrf-Token', csrfToken || '')
        .set('Cookie', [...(cookies || []), ...csrfCookies]);
      expect(refreshRes.statusCode).toBe(401);
    });
  });
});
