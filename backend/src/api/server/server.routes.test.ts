import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('Server Routes', () => {
  const userData = {
    email: 'server-test@example.com',
    username: 'servertest',
    password: 'password123',
  };
  let token = '';
  let userId = '';

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(userData);
    const res = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = res.body.token;
    userId = res.body.user._id;
  });

    describe('GET /api/servers/:serverId', () => {
        it('should return 400 for an invalid serverId format', async () => {
      const invalidServerId = '123';
      const res = await request(app)
        .get(`/api/servers/${invalidServerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for a non-existent server', async () => {
      const nonExistentServerId = '605cde185e49a821e84d516d'; // Example ObjectId
      const res = await request(app)
        .get(`/api/servers/${nonExistentServerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toBe(404);
    });

    it('should return server details for a valid serverId', async () => {
      const serverRes = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Details Test Server' });

      const serverId = serverRes.body._id;

      const res = await request(app)
        .get(`/api/servers/${serverId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Details Test Server');
      expect(res.body._id).toBe(serverId);
    });
  });

  describe('GET /api/users/@me/servers', () => {
    it('should return a list of servers the user owns', async () => {
      await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Server One' });

      await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Server Two' });

      const res = await request(app)
        .get('/api/users/@me/servers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body.some((s: any) => s.name === 'Server One')).toBe(true);
      expect(res.body.some((s: any) => s.name === 'Server Two')).toBe(true);
    });
  });

  describe('POST /api/servers', () => {
    const serverData = { name: 'My Test Server' };

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).post('/api/servers').send(serverData);
      expect(res.statusCode).toBe(401);
    });

    it('should create a new server successfully with a valid token', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send(serverData);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe(serverData.name);
      expect(res.body.ownerId).toBe(userId);
    });

    it('should return 400 for invalid server data', async () => {
      const res = await request(app)
        .post('/api/servers')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' }); // Invalid name

      expect(res.statusCode).toBe(400);
    });
  });
});
