import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import ServiceTypeModel from '../infra/serviceType.model';

describe('Bot bootstrap route (/api/bots/bootstrap)', () => {
  beforeEach(async () => {
    await ServiceTypeModel.create({ name: 'rss-fetcher' });
  });

  it('rejects missing admin secret', async () => {
    const res = await request(app)
      .post('/api/bots/bootstrap')
      .send({ serviceType: 'rss-fetcher' });
    expect(res.statusCode).toBe(401);
  });

  it('returns bots with tokens for matching serviceType', async () => {
    const user1Data = { email: 'boot-user1@example.com', username: 'bootuser1', password: 'password123' };
    await request(app).post('/api/auth/register').send(user1Data);
    const loginRes1 = await request(app).post('/api/auth/login').send({ email: user1Data.email, password: user1Data.password });
    const token1 = loginRes1.body.token;

    const createRes = await request(app)
      .post('/api/users/@me/bots')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'MyBootBot', serviceType: 'rss-fetcher' });

    expect(createRes.statusCode).toBe(201);

    const res = await request(app)
      .post('/api/bots/bootstrap')
      .set('X-Mew-Admin-Secret', process.env.MEW_ADMIN_SECRET!)
      .send({ serviceType: 'rss-fetcher' });

    expect(res.statusCode).toBe(200);
    expect(res.body.bots).toBeInstanceOf(Array);
    expect(res.body.bots.length).toBe(1);
    expect(res.body.bots[0]).toHaveProperty('accessToken');
    expect(res.body.bots[0].serviceType).toBe('rss-fetcher');

    const res2 = await request(app)
      .get(`/api/bots/${createRes.body._id}/bootstrap?serviceType=rss-fetcher`)
      .set('X-Mew-Admin-Secret', process.env.MEW_ADMIN_SECRET!);

    expect(res2.statusCode).toBe(200);
    expect(res2.body.bot).toHaveProperty('accessToken');
    expect(res2.body.bot._id).toBe(createRes.body._id);
  });
});
