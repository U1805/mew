import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('Infra routes (/api/infra)', () => {
  it('registers service type with admin secret and lists online-only by default', async () => {
    const registerRes = await request(app)
      .post('/api/infra/service-types/register')
      .set('X-Mew-Admin-Secret', process.env.MEW_ADMIN_SECRET!)
      .send({ serviceType: 'rss-fetcher' });

    expect(registerRes.statusCode).toBe(200);

    const user1Data = { email: 'infra-user1@example.com', username: 'infrauser1', password: 'password123' };
    await request(app).post('/api/auth/register').send(user1Data);
    const loginRes1 = await request(app).post('/api/auth/login').send({ email: user1Data.email, password: user1Data.password });
    const token1 = loginRes1.body.token;

    const listRes = await request(app)
      .get('/api/infra/available-services')
      .set('Authorization', `Bearer ${token1}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.services).toEqual([]);
  });

  it('includes offline services when requested', async () => {
    const registerRes = await request(app)
      .post('/api/infra/service-types/register')
      .set('X-Mew-Admin-Secret', process.env.MEW_ADMIN_SECRET!)
      .send({ serviceType: 'rss-fetcher' });

    expect(registerRes.statusCode).toBe(200);

    const user1Data = { email: 'infra-user2@example.com', username: 'infrauser2', password: 'password123' };
    await request(app).post('/api/auth/register').send(user1Data);
    const loginRes1 = await request(app).post('/api/auth/login').send({ email: user1Data.email, password: user1Data.password });
    const token1 = loginRes1.body.token;

    const listRes = await request(app)
      .get('/api/infra/available-services?includeOffline=1')
      .set('Authorization', `Bearer ${token1}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceType: 'rss-fetcher', online: false, connections: 0 }),
      ])
    );
  });

  it('accepts structured configTemplate and stores as JSON string', async () => {
    const registerRes = await request(app)
      .post('/api/infra/service-types/register')
      .set('X-Mew-Admin-Secret', process.env.MEW_ADMIN_SECRET!)
      .send({
        serviceType: 'rss-fetcher',
        configTemplate: [
          {
            webhook: { type: 'url', desc: 'target channel webhook', required: true },
          },
        ],
      });

    expect(registerRes.statusCode).toBe(200);

    const userData = { email: 'infra-user3@example.com', username: 'infrauser3', password: 'password123' };
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    const token = loginRes.body.token;

    const listRes = await request(app)
      .get('/api/infra/available-services?includeOffline=1')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceType: 'rss-fetcher',
          configTemplate: expect.stringContaining('"webhook"'),
        }),
      ])
    );
  });

  it('rejects reserved service types', async () => {
    const registerRes = await request(app)
      .post('/api/infra/service-types/register')
      .set('X-Mew-Admin-Secret', process.env.MEW_ADMIN_SECRET!)
      .send({ serviceType: 'sdk' });

    expect(registerRes.statusCode).toBe(400);
  });

  it('returns botUserId for a dmEnabled bot by serviceType', async () => {
    const registerRes = await request(app)
      .post('/api/infra/service-types/register')
      .set('X-Mew-Admin-Secret', process.env.MEW_ADMIN_SECRET!)
      .send({ serviceType: 'jpdict-agent' });

    expect(registerRes.statusCode).toBe(200);

    const userData = { email: 'infra-bot-owner@example.com', username: 'infrabotowner', password: 'password123' };
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    const token = loginRes.body.token as string;

    const createBotRes = await request(app)
      .post('/api/users/@me/bots')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'MyJpdictBot', serviceType: 'jpdict-agent' });

    expect(createBotRes.statusCode).toBe(201);
    const botId = createBotRes.body._id as string;

    const enableDmRes = await request(app)
      .patch(`/api/users/@me/bots/${botId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dmEnabled: true });

    expect(enableDmRes.statusCode).toBe(200);

    const res = await request(app)
      .get('/api/infra/service-bot-user?serviceType=jpdict-agent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.botUserId).toBeTypeOf('string');
    expect(res.body.botUserId.length).toBeGreaterThan(0);
  });
});

