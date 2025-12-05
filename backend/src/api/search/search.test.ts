import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { ChannelType } from '../channel/channel.model';
import { createMessage } from '../message/message.service';

describe('Search Routes', () => {
  const userData = {
    email: 'search-test@example.com',
    username: 'searchtest',
    password: 'password123',
  };
  let token = '';
  let userId = '';
  let serverId = '';
  let channel1Id = '';
  let channel2Id = '';

  beforeEach(async () => {
    // Register and login user
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;
    userId = loginRes.body.user._id;

    // Create server
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Search Test Server' });
    serverId = serverRes.body._id;

    // Create channels
    const channel1Res = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'channel-1', type: ChannelType.GUILD_TEXT });
    channel1Id = channel1Res.body._id;

    const channel2Res = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'channel-2', type: ChannelType.GUILD_TEXT });
    channel2Id = channel2Res.body._id;

    // Create messages
    await createMessage({ channelId: channel1Id, authorId: userId, content: 'This is a test message about cats.' });
    await createMessage({ channelId: channel1Id, authorId: userId, content: 'Another message talking about dogs.' });
    await createMessage({ channelId: channel2Id, authorId: userId, content: 'A message in another channel, also about cats.' });
    await createMessage({ channelId: channel2Id, authorId: userId, content: 'Just a random message.' });
  });

  it('should return 400 if search query `q` is missing', async () => {
    const res = await request(app)
      .get(`/api/servers/${serverId}/search`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(400);
  });

  it('should search for messages across all channels in a server', async () => {
    const res = await request(app)
      .get(`/api/servers/${serverId}/search?q=cats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages.length).toBe(2);
    expect(res.body.messages.every((m: any) => m.content.includes('cats'))).toBe(true);
  });

  it('should restrict search to a specific channel if channelId is provided', async () => {
    const res = await request(app)
      .get(`/api/servers/${serverId}/search?q=cats&channelId=${channel1Id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages.length).toBe(1);
    expect(res.body.messages[0].channelId).toBe(channel1Id);
    expect(res.body.messages[0].content).toContain('cats');
  });

  it('should handle pagination correctly', async () => {
    // Create more messages for pagination test
    for (let i = 0; i < 10; i++) {
      await createMessage({ channelId: channel1Id, authorId: userId, content: `Paginated cat message ${i}` });
    }

    const res = await request(app)
      .get(`/api/servers/${serverId}/search?q=cat&limit=5&page=2`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.messages.length).toBe(5);
    expect(res.body.pagination.total).toBe(12); // 2 original + 10 new
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.totalPages).toBe(3);
  });

  it('should return 403 if a non-member tries to search', async () => {
    // Create a new user who is not a member of the server
    const nonMemberData = { email: 'nonmember@search.com', username: 'nonmember', password: 'password123' };
    await request(app).post('/api/auth/register').send(nonMemberData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: nonMemberData.email, password: nonMemberData.password });
    const nonMemberToken = loginRes.body.token;

    const res = await request(app)
      .get(`/api/servers/${serverId}/search?q=test`)
      .set('Authorization', `Bearer ${nonMemberToken}`);

    expect(res.statusCode).toBe(403);
  });
});
