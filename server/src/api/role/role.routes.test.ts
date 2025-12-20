import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import Role from './role.model';
import Server from '../server/server.model';

describe('Role Hierarchy Checks', () => {
  let ownerToken: string;
  let serverId: string;
  let highRoleId: string;
  let lowRoleId: string;
  let lowRoleUserToken: string;

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ email: 'rh-owner@test.com', username: 'rh-owner', password: 'password123' });
    const ownerLoginRes = await request(app).post('/api/auth/login').send({ email: 'rh-owner@test.com', password: 'password123' });
    ownerToken = ownerLoginRes.body.token;
    const serverRes = await request(app).post('/api/servers').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Role Hierarchy Server' });
    serverId = serverRes.body._id;
    const server = await Server.findById(serverId);

    const highRoleRes = await request(app).post(`/api/servers/${serverId}/roles`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Admin', position: 10 });
    highRoleId = highRoleRes.body._id;
    const lowRoleRes = await request(app).post(`/api/servers/${serverId}/roles`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Moderator', position: 5 });
    lowRoleId = lowRoleRes.body._id;

    await request(app).post('/api/auth/register').send({ email: 'rh-low@test.com', username: 'rh-low', password: 'password123' });
    const lowRoleUserLoginRes = await request(app).post('/api/auth/login').send({ email: 'rh-low@test.com', password: 'password123' });
    lowRoleUserToken = lowRoleUserLoginRes.body.token;
    const lowRoleUserId = lowRoleUserLoginRes.body.user._id;
    await request(app).post(`/api/invites/${(await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${ownerToken}`).send({})).body.code}`).set('Authorization', `Bearer ${lowRoleUserToken}`);
    await request(app).put(`/api/servers/${serverId}/members/${lowRoleUserId}/roles`).set('Authorization', `Bearer ${ownerToken}`).send({ roleIds: [lowRoleId] });

    // 让低角色具备 MANAGE_ROLES，以验证层级拦截。
    const lowRole = await Role.findById(lowRoleId);
    lowRole!.permissions.push('MANAGE_ROLES');
    await lowRole!.save();
  });

  it('should prevent a user from updating a role with a higher position', async () => {
    const res = await request(app)
      .patch(`/api/servers/${serverId}/roles/${highRoleId}`)
      .set('Authorization', `Bearer ${lowRoleUserToken}`)
      .send({ name: 'New Admin Name' });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain('equal or higher position');
  });

  it('should prevent a user from deleting a role with a higher position', async () => {
    const res = await request(app)
      .delete(`/api/servers/${serverId}/roles/${highRoleId}`)
      .set('Authorization', `Bearer ${lowRoleUserToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain('equal or higher position');
  });

  it('should prevent a user from moving a role to a position above their own highest role', async () => {
    const res = await request(app)
      .patch(`/api/servers/${serverId}/roles/positions`)
      .set('Authorization', `Bearer ${lowRoleUserToken}`)
      .send([{ roleId: highRoleId, position: 11 }]);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain('equal or higher position');
  });

  it('should allow a user to update a role with a lower position', async () => {
    const ownerId = (await request(app).post('/api/auth/login').send({ email: 'rh-owner@test.com', password: 'password123' })).body.user._id;
    await request(app).put(`/api/servers/${serverId}/members/${ownerId}/roles`).set('Authorization', `Bearer ${ownerToken}`).send({ roleIds: [highRoleId] });

    const res = await request(app)
      .patch(`/api/servers/${serverId}/roles/${lowRoleId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'New Moderator Name' });

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('New Moderator Name');
  });
});

describe('Role Routes', () => {
  let token: string;
  let serverId: string;
  let ownerId: string;
  let nonOwnerToken: string;

  beforeEach(async () => {
    const ownerData = { email: 'role-owner@test.com', username: 'roleowner', password: 'password123' };
    await request(app).post('/api/auth/register').send(ownerData);
    const ownerLoginRes = await request(app).post('/api/auth/login').send({ email: ownerData.email, password: ownerData.password });
    token = ownerLoginRes.body.token;
    ownerId = ownerLoginRes.body.user._id;

    const serverRes = await request(app).post('/api/servers').set('Authorization', `Bearer ${token}`).send({ name: 'Role Test Server' });
    serverId = serverRes.body._id;

    const nonOwnerData = { email: 'non-owner@test.com', username: 'nonowner', password: 'password123' };
    await request(app).post('/api/auth/register').send(nonOwnerData);
    const nonOwnerLoginRes = await request(app).post('/api/auth/login').send({ email: nonOwnerData.email, password: nonOwnerData.password });
    nonOwnerToken = nonOwnerLoginRes.body.token;
  });

  describe('POST /api/servers/:serverId/roles', () => {
    it('should allow server owner to create a role', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Moderator', permissions: ['KICK_MEMBERS'], color: '#0000FF' });

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Moderator');
    });

    it('should prevent non-owner from creating a role', async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${nonOwnerToken}`)
        .send({ name: 'Malicious Role' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/servers/:serverId/roles', () => {
    it('should return all roles for a server', async () => {
      await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tester', position: 2 });

      const res = await request(app)
        .get(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2); // @everyone + Tester
      expect(res.body.some((r: any) => r.name === '@everyone')).toBe(true);
      expect(res.body.some((r: any) => r.name === 'Tester')).toBe(true);
    });
  });

  describe('PATCH /api/servers/:serverId/roles/:roleId', () => {
    let roleId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updatable' });
      roleId = res.body._id;
    });

    it('should allow owner to update a role', async () => {
      const res = await request(app)
        .patch(`/api/servers/${serverId}/roles/${roleId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Role', color: '#FFFFFF' });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated Role');
      expect(res.body.color).toBe('#FFFFFF');
    });

    it('should prevent non-owner from updating a role', async () => {
      const res = await request(app)
        .patch(`/api/servers/${serverId}/roles/${roleId}`)
        .set('Authorization', `Bearer ${nonOwnerToken}`)
        .send({ name: 'Failed Update' });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/servers/:serverId/roles/:roleId', () => {
    let roleId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/servers/${serverId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Deletable Role' });
      roleId = res.body._id;
    });

    it('should allow owner to delete a role', async () => {
      const res = await request(app)
        .delete(`/api/servers/${serverId}/roles/${roleId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Role deleted successfully.');
    });

    it('should prevent deleting the default @everyone role', async () => {
      const server = await Server.findById(serverId);
      const everyoneRoleId = server!.everyoneRoleId;

      const res = await request(app)
        .delete(`/api/servers/${serverId}/roles/${everyoneRoleId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe('Cannot delete the default @everyone role.');
    });

    it('should prevent non-owner from deleting a role', async () => {
      const res = await request(app)
        .delete(`/api/servers/${serverId}/roles/${roleId}`)
        .set('Authorization', `Bearer ${nonOwnerToken}`);

      expect(res.statusCode).toBe(403);
    });
  });
});
