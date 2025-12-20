import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import ServerMember from '../member/member.model';
import Server from '../server/server.model';

describe('Invite Routes', () => {
  let ownerToken = '';
  let serverId = '';
  let server: any;

  const ownerData = {
    email: 'invite-owner@example.com',
    username: 'inviteowner',
    password: 'password123',
  };

  beforeEach(async () => {
    // Create server owner
    await request(app).post('/api/auth/register').send(ownerData);
    const ownerRes = await request(app).post('/api/auth/login').send({ email: ownerData.email, password: ownerData.password });
    ownerToken = ownerRes.body.token;

    // Create a server
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Invite Test Server' });
    serverId = serverRes.body._id;
    server = await Server.findById(serverId);
  });

  describe('POST /api/invites/:inviteCode', () => {
    it('should allow a new user to join a server and assign them the @everyone role', async () => {
      // 1. Create an invite for the server
      const inviteRes = await request(app)
        .post(`/api/servers/${serverId}/invites`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});
      const inviteCode = inviteRes.body.code;

      // 2. Create and log in a new user
      const newUser = {
        email: 'new-member@example.com',
        username: 'newmember',
        password: 'password123'
      };
      await request(app).post('/api/auth/register').send(newUser);
      const loginRes = await request(app).post('/api/auth/login').send({ email: newUser.email, password: newUser.password });
      const newUserToken = loginRes.body.token;
      const newUserId = loginRes.body.user._id;

      // 3. New user accepts the invite
      const acceptRes = await request(app)
        .post(`/api/invites/${inviteCode}`)
        .set('Authorization', `Bearer ${newUserToken}`);

      expect(acceptRes.statusCode).toBe(200);

      // 4. Verify the new member in the database
      const member = await ServerMember.findOne({ serverId, userId: newUserId });
      expect(member).not.toBeNull();
      expect(member?.roleIds.map(String)).toContain(server.everyoneRoleId.toString());
      expect(member?.isOwner).toBe(false);
    });
  });
});
