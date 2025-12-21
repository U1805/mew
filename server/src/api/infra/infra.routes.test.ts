import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('Infra routes (/api/infra)', () => {
  it('registers service type with admin secret and lists it for authenticated users', async () => {
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
    expect(listRes.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serviceType: 'rss-fetcher', online: false }),
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
});

