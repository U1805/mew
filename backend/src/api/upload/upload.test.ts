import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import path from 'path';
import fs from 'fs';
import Server from '../server/server.model';
import Role from '../role/role.model';

// Mock the S3 utility to prevent actual file uploads during tests
vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn(),
}));

import { uploadFile } from '../../utils/s3';

describe('Upload Routes: POST /api/channels/:channelId/uploads', () => {
  let serverId: string;
  let channelId: string;
  let userWithPermsToken: string;
  let userWithoutPermsToken: string;

  // User data for our two test users
  const userWithPermsData = { email: 'uploader@test.com', username: 'uploader', password: 'password123' };
  const userWithoutPermsData = { email: 'no-upload@test.com', username: 'noupload', password: 'password123' };

  beforeEach(async () => {
    // 1. Clear mocks
    vi.clearAllMocks();

    // 2. Setup a default mock implementation for the uploadFile utility
    vi.mocked(uploadFile).mockResolvedValue({
      key: 'mock-file.png',
      mimetype: 'image/png',
      size: 12345,
    });

    // 3. Register and login the user who will have upload permissions
    await request(app).post('/api/auth/register').send(userWithPermsData);
    const loginResWithPerms = await request(app).post('/api/auth/login').send({ email: userWithPermsData.email, password: userWithPermsData.password });
    userWithPermsToken = loginResWithPerms.body.token;

    // 4. Register and login the user who will NOT have upload permissions
    await request(app).post('/api/auth/register').send(userWithoutPermsData);
    const loginResWithoutPerms = await request(app).post('/api/auth/login').send({ email: userWithoutPermsData.email, password: userWithoutPermsData.password });
    userWithoutPermsToken = loginResWithoutPerms.body.token;

    // 5. Create a server with the first user
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${userWithPermsToken}`)
      .send({ name: 'Upload Test Server' });
    serverId = serverRes.body._id;

    // 6. Create a channel in that server
    const channelRes = await request(app)
      .post(`/api/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${userWithPermsToken}`)
      .send({ name: 'upload-channel', type: 'GUILD_TEXT' });
    channelId = channelRes.body._id;

    // 7. Make the second user join the server to test permissions
    const inviteRes = await request(app).post(`/api/servers/${serverId}/invites`).set('Authorization', `Bearer ${userWithPermsToken}`).send({});
    await request(app).post(`/api/invites/${inviteRes.body.code}`).set('Authorization', `Bearer ${userWithoutPermsToken}`);

    // 8. Grant ATTACH_FILES permission to the @everyone role (so userWithPermsToken gets it)
    const server = await Server.findById(serverId).lean();
    const everyoneRole = await Role.findById(server.everyoneRoleId);
    if (everyoneRole) {
      everyoneRole.permissions.push('ATTACH_FILES');
      await everyoneRole.save();
    }
  });

  it('should return 403 if user does not have ATTACH_FILES permission', async () => {
    // In this test, we ensure the @everyone role specifically does NOT have the permission
    const server = await Server.findById(serverId).lean();
    const everyoneRole = await Role.findById(server.everyoneRoleId);
    const originalPermissions = [...everyoneRole.permissions];

    everyoneRole.permissions = everyoneRole.permissions.filter(p => p !== 'ATTACH_FILES');
    await everyoneRole.save();

    // The userWithoutPermsToken belongs to a user who is a member but not an owner.
    // Since we removed the permission from @everyone, they should be blocked.
    const res = await request(app)
      .post(`/api/channels/${channelId}/uploads`)
      .set('Authorization', `Bearer ${userWithoutPermsToken}`)
      .attach('file', Buffer.from('test'), 'test.txt');

    // Assert
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('You do not have the required permission: ATTACH_FILES');

    // Cleanup: Restore permissions for other tests
    everyoneRole.permissions = originalPermissions;
    await everyoneRole.save();
  });

  it('should return 400 if no file is uploaded', async () => {
    const res = await request(app)
      .post(`/api/channels/${channelId}/uploads`)
      .set('Authorization', `Bearer ${userWithPermsToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No file uploaded.');
  });

  it('should upload a file successfully and return attachment metadata for a user with permission', async () => {
    const filePath = path.join(__dirname, 'test-file-for-upload.txt');
    fs.writeFileSync(filePath, 'this is a test file for uploading');

    const res = await request(app)
      .post(`/api/channels/${channelId}/uploads`)
      .set('Authorization', `Bearer ${userWithPermsToken}`)
      .attach('file', filePath, 'test-upload.txt');

    expect(res.status).toBe(201);
    expect(uploadFile).toHaveBeenCalledOnce();
    expect(res.body).toEqual({
      filename: 'test-upload.txt',
      contentType: 'image/png', // from our mock
      key: 'mock-file.png', // from our mock
      size: 12345, // from our mock
    });

    fs.unlinkSync(filePath); // Clean up the temporary file
  });
});
