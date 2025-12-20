import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import ServerMember from './member.model';
import Channel from '../channel/channel.model';
import Role from '../role/role.model';
import Server from '../server/server.model';
import mongoose from 'mongoose';

describe('Member Routes', () => {
  let ownerToken: string;
  let serverId: string;
  let channelId: string;

  const owner = { email: 'member-owner@example.com', username: 'memberowner', password: 'password123' };
  const memberToKick = { email: 'kickme@example.com', username: 'kickme', password: 'password123' };
  let memberToKickId: string;
  let memberToKickToken: string;

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(owner);
    const ownerLoginRes = await request(app).post('/api/auth/login').send({ email: owner.email, password: owner.password });
    ownerToken = ownerLoginRes.body.token;

    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Member Test Server' });
    serverId = serverRes.body._id;

    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'General', type: 'GUILD_TEXT' });
    channelId = channelRes.body._id;

    await request(app).post('/api/auth/register').send(memberToKick);
    const memberLoginRes = await request(app).post('/api/auth/login').send({ email: memberToKick.email, password: memberToKick.password });
    memberToKickId = memberLoginRes.body.user._id;
    memberToKickToken = memberLoginRes.body.token;

    await ServerMember.create({
      serverId,
      userId: memberToKickId,
      roleIds: [serverRes.body.everyoneRoleId]
    });
  });

  describe('DELETE /api/servers/:serverId/members/:userId', () => {
    it('should allow a member with KICK_MEMBERS permission to remove another member and deny without it', async () => {
      const kickerData = { email: 'kicker@example.com', username: 'kicker', password: 'password123' };
      await request(app).post('/api/auth/register').send(kickerData);
      const kickerLoginRes = await request(app).post('/api/auth/login').send({ email: kickerData.email, password: kickerData.password });
      const kickerToken = kickerLoginRes.body.token;

      const inviteRes = await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${ownerToken}`).send({});
      await request(app).post(`/api/invites/${inviteRes.body.code}`).set('Authorization', `Bearer ${kickerToken}`);

      // Deny without permission
      const resFail = await request(app)
        .delete(`/api/servers/${serverId}/members/${memberToKickId}`)
        .set('Authorization', `Bearer ${kickerToken}`);
      expect(resFail.statusCode).toBe(403);

      // Grant permission
      const serverDetailsRes = await request(app).get(`/api/servers/${serverId}`).set('Authorization', `Bearer ${ownerToken}`);
      const everyoneRoleId = serverDetailsRes.body.everyoneRoleId;
      const rolesRes = await request(app).get(`/api/servers/${serverId}/roles`).set('Authorization', `Bearer ${ownerToken}`);
      const everyoneRole = rolesRes.body.find((r: any) => r._id === everyoneRoleId);
      await request(app)
        .patch(`/api/servers/${serverId}/roles/${everyoneRoleId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ permissions: [...everyoneRole.permissions, 'KICK_MEMBERS'] });

      // Allow with permission, but fail due to hierarchy
      const resHierarchyFail = await request(app)
        .delete(`/api/servers/${serverId}/members/${memberToKickId}`)
        .set('Authorization', `Bearer ${kickerToken}`);
      expect(resHierarchyFail.statusCode).toBe(403); // Fails because kicker and kickee are same level

      // Grant kicker a higher role
      const kickerMember = await ServerMember.findOne({ serverId, userId: kickerLoginRes.body.user._id });
      const highRole = await request(app).post(`/api/servers/${serverId}/roles`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Admin', position: 10 });
      await request(app).put(`/api/servers/${serverId}/members/${kickerMember?.userId}/roles`).set('Authorization', `Bearer ${ownerToken}`).send({ roleIds: [highRole.body._id, everyoneRoleId]});

      // Allow with permission and hierarchy
      const resSuccess = await request(app)
        .delete(`/api/servers/${serverId}/members/${memberToKickId}`)
        .set('Authorization', `Bearer ${kickerToken}`);
      expect(resSuccess.statusCode).toBe(204);
    });

    it('should cascade delete member-specific permission overrides when a member is removed', async () => {
      const channel = await Channel.findById(channelId);
      channel!.permissionOverrides = [{
        targetType: 'member',
        targetId: memberToKickId as any,
        allow: ['SEND_MESSAGES'],
        deny: []
      }];
      await channel!.save();

      const kickRes = await request(app)
        .delete(`/api/servers/${serverId}/members/${memberToKickId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(kickRes.statusCode).toBe(204);

      const memberInDb = await ServerMember.findOne({ serverId, userId: memberToKickId });
      expect(memberInDb).toBeNull();

      const updatedChannel = await Channel.findById(channelId);
      const overrideExists = updatedChannel!.permissionOverrides!.some(
        ov => ov.targetId.toString() === memberToKickId
      );
      expect(overrideExists).toBe(false);
    });
  });
});

describe('PUT /api/servers/:serverId/members/:userId/roles', () => {
    let serverId: string;
    let ownerToken: string;
    let memberId: string;
    let role1Id: string, role2Id: string;

    beforeEach(async () => {
      // Setup: Create owner, another member, and some roles
      const ownerRes = await request(app).post('/api/auth/register').send({ email: 'roles-owner@test.com', username: 'rolesowner', password: 'password123' });
      ownerToken = (await request(app).post('/api/auth/login').send({ email: 'roles-owner@test.com', password: 'password123' })).body.token;
      const serverRes = await request(app).post('/api/servers').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Role Assign Test' });
      serverId = serverRes.body._id;

      const memberRes = await request(app).post('/api/auth/register').send({ email: 'roles-member@test.com', username: 'rolesmember', password: 'password123' });
      const memberToken = (await request(app).post('/api/auth/login').send({ email: 'roles-member@test.com', password: 'password123' })).body.token;
      memberId = memberRes.body.user._id;
      const inviteRes = await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${ownerToken}`).send({});
      await request(app).post(`/api/invites/${inviteRes.body.code}`).set('Authorization', `Bearer ${memberToken}`);

      const role1 = await new Role({ serverId, name: 'Role 1', position: 1 }).save();
      const role2 = await new Role({ serverId, name: 'Role 2', position: 2 }).save();
      role1Id = role1._id.toString();
      role2Id = role2._id.toString();
    });

    it('should allow server owner to assign roles to a member', async () => {
      const res = await request(app)
        .put(`/api/servers/${serverId}/members/${memberId}/roles`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ roleIds: [role1Id, role2Id] });

      expect(res.statusCode).toBe(200);
      expect(res.body.roleIds).toEqual(expect.arrayContaining([role1Id, role2Id]));

      const member = await ServerMember.findById(res.body._id);
      expect(member?.roleIds.map(id=>id.toString())).toContain(role1Id);
    });

    it('should allow a member with MANAGE_ROLES to assign roles and deny without it', async () => {
      const managerData = { email: 'roles-manager@test.com', username: 'rolesmanager', password: 'password123' };
      await request(app).post('/api/auth/register').send(managerData);
      const managerToken = (await request(app).post('/api/auth/login').send({ email: managerData.email, password: 'password123' })).body.token;
      const inviteRes = await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${ownerToken}`).send({});
      await request(app).post(`/api/invites/${inviteRes.body.code}`).set('Authorization', `Bearer ${managerToken}`);

      // Deny without permission
      const resFail = await request(app)
        .put(`/api/servers/${serverId}/members/${memberId}/roles`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ roleIds: [role1Id] });
      expect(resFail.statusCode).toBe(403);

      // Grant permission
      const serverDetailsRes = await request(app).get(`/api/servers/${serverId}`).set('Authorization', `Bearer ${ownerToken}`);
      const everyoneRoleId = serverDetailsRes.body.everyoneRoleId;
      const rolesRes = await request(app).get(`/api/servers/${serverId}/roles`).set('Authorization', `Bearer ${ownerToken}`);
      const everyoneRole = rolesRes.body.find((r: any) => r._id === everyoneRoleId);
      await request(app)
        .patch(`/api/servers/${serverId}/roles/${everyoneRoleId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ permissions: [...everyoneRole.permissions, 'MANAGE_ROLES'] });

      // Grant a higher role to the manager to pass hierarchy check
      const managerMember = await ServerMember.findOne({ userId: (await request(app).post('/api/auth/login').send({ email: managerData.email, password: 'password123' })).body.user._id, serverId });
      const highRole = await new Role({ serverId, name: 'Manager Role', position: 10 }).save();
      managerMember.roleIds.push(highRole._id);
      await managerMember.save();

      // Allow with permission and hierarchy
      const resSuccess = await request(app)
        .put(`/api/servers/${serverId}/members/${memberId}/roles`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ roleIds: [role1Id] });
      expect(resSuccess.statusCode).toBe(200);
      expect(resSuccess.body.roleIds).toContain(role1Id);
    });
  });

  describe('Hierarchy Checks', () => {
  let serverId: string;
  let ownerToken: string;
  let highRoleId: string, lowRoleId: string;
  let highRoleMemberId: string, lowRoleMemberId: string;
  let lowRoleMemberToken: string;
  let regularMemberId: string;

  beforeEach(async () => {
    // Setup Owner
    await request(app).post('/api/auth/register').send({ email: 'h-owner@test.com', username: 'howner', password: 'password123' });
    ownerToken = (await request(app).post('/api/auth/login').send({ email: 'h-owner@test.com', password: 'password123' })).body.token;

    // Setup Server and Roles
    const serverRes = await request(app).post('/api/servers').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Hierarchy Test' });
    serverId = serverRes.body._id;
    const server = await Server.findById(serverId).lean();

    const highRole = await new Role({ serverId, name: 'Admin', position: 10 }).save();
    highRoleId = highRole._id.toString();
    const lowRole = await new Role({ serverId, name: 'Moderator', position: 5 }).save();
    lowRoleId = lowRole._id.toString();

    // Setup Members
    const highRoleMemberRes = await request(app).post('/api/auth/register').send({ email: 'h-high@test.com', username: 'hhigh', password: 'password123' });
    highRoleMemberId = highRoleMemberRes.body.user._id;
    await ServerMember.create({ serverId, userId: highRoleMemberId, roleIds: [server!.everyoneRoleId, new mongoose.Types.ObjectId(highRoleId)] });

    const lowRoleMemberRes = await request(app).post('/api/auth/register').send({ email: 'h-low@test.com', username: 'hlow', password: 'password123' });
    lowRoleMemberId = lowRoleMemberRes.body.user._id;
    lowRoleMemberToken = (await request(app).post('/api/auth/login').send({ email: 'h-low@test.com', password: 'password123' })).body.token;
    await ServerMember.create({ serverId, userId: lowRoleMemberId, roleIds: [server!.everyoneRoleId, new mongoose.Types.ObjectId(lowRoleId)] });

    const regularMemberRes = await request(app).post('/api/auth/register').send({ email: 'h-reg@test.com', username: 'hreg', password: 'password123' });
    regularMemberId = regularMemberRes.body.user._id;
    await ServerMember.create({ serverId, userId: regularMemberId, roleIds: [server!.everyoneRoleId] });
  });

    it('should prevent a member from kicking a member with a higher role', async () => {
    // Give the low-role member KICK_MEMBERS permission so the request can pass the middleware
    // and actually test the hierarchy check in the service layer.
    const server = await Server.findById(serverId).lean();
    const lowRole = await Role.findById(lowRoleId);
    lowRole.permissions.push('KICK_MEMBERS');
    await lowRole.save();

    const res = await request(app)
      .delete(`/api/servers/${serverId}/members/${highRoleMemberId}`)
      .set('Authorization', `Bearer ${lowRoleMemberToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain('equal or higher role position');
  });

    it('should prevent a member from assigning roles to a member with a higher role', async () => {
    // Grant MANAGE_ROLES to the low-role member to test hierarchy check
    const lowRole = await Role.findById(lowRoleId);
    lowRole!.permissions.push('MANAGE_ROLES');
    await lowRole!.save();

    const res = await request(app)
      .put(`/api/servers/${serverId}/members/${highRoleMemberId}/roles`)
      .set('Authorization', `Bearer ${lowRoleMemberToken}`)
      .send({ roleIds: [] });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain('equal or higher role position');
  });

  it('should allow a member to manage a member with a lower role', async () => {
    // Grant KICK_MEMBERS to the low-role member to test hierarchy
    const lowRole = await Role.findById(lowRoleId);
    lowRole!.permissions.push('KICK_MEMBERS');
    await lowRole!.save();

    // Low role member kicks regular member
    const kickRes = await request(app)
      .delete(`/api/servers/${serverId}/members/${regularMemberId}`)
      .set('Authorization', `Bearer ${lowRoleMemberToken}`);
    expect(kickRes.statusCode).toBe(204);

    // High role member assigns role to low role member
    const assignRes = await request(app)
      .put(`/api/servers/${serverId}/members/${lowRoleMemberId}/roles`)
      .set('Authorization', `Bearer ${ownerToken}`) // Use owner for simplicity
      .send({ roleIds: [lowRoleId] });
    expect(assignRes.statusCode).toBe(200);
  });
});
