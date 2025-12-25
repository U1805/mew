import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import ServiceTypeModel from '../infra/serviceType.model';

// Mock the socketManager to prevent errors in tests
vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
    getIO: vi.fn(() => ({
      of: vi.fn(() => ({
        to: vi.fn(() => ({ emit: vi.fn() })),
      })),
    })),
  },
}));

describe('Bot self routes (/api/bots/:botId/config)', () => {
  let ownerToken = '';
  let botId = '';
  let botAccessToken = '';
  let botUserToken = '';

  const ownerData = {
    email: 'bot-owner-self@example.com',
    username: 'bot-owner-self',
    password: 'password123',
  };

  beforeEach(async () => {
    await ServiceTypeModel.create({ name: 'rss-fetcher' });

    await request(app).post('/api/auth/register').send(ownerData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: ownerData.email, password: ownerData.password });
    ownerToken = loginRes.body.token;

    const createRes = await request(app)
      .post('/api/users/@me/bots')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'SelfBot',
        serviceType: 'rss-fetcher',
        config: JSON.stringify({
          base_url: 'https://api.example.com/v1',
          api_key: 'k',
          model: 'm',
          system_prompt: 'old',
        }),
      });

    botId = createRes.body._id;
    botAccessToken = createRes.body.accessToken;

    const botLoginRes = await request(app).post('/api/auth/bot').send({ accessToken: botAccessToken });
    botUserToken = botLoginRes.body.token;
  });

  it('allows a bot user to update its own system_prompt (and preserves other fields)', async () => {
    const res = await request(app)
      .patch(`/api/bots/${botId}/config`)
      .set('Authorization', `Bearer ${botUserToken}`)
      .send({ system_prompt: 'new' });

    expect(res.statusCode).toBe(200);
    expect(typeof res.body.config).toBe('string');
    const parsed = JSON.parse(res.body.config);
    expect(parsed.system_prompt).toBe('new');
    expect(parsed.base_url).toBe('https://api.example.com/v1');
    expect(parsed.api_key).toBe('k');
    expect(parsed.model).toBe('m');
  });

  it('rejects non-bot owners (404)', async () => {
    const res = await request(app)
      .patch(`/api/bots/${botId}/config`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ system_prompt: 'hijack' });

    expect(res.statusCode).toBe(404);
  });
});

