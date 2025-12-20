import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { ICategory } from './category.model';

describe('Category Routes', () => {
  let token: string;
  let serverId: string;
  let categoryId: string;

  beforeEach(async () => {
    // Create a user and log in
    const userData = {
      email: `testuser-${Date.now()}@example.com`,
      username: `testuser-${Date.now()}`,
      password: 'password123',
    };
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send({ email: userData.email, password: userData.password });
    token = loginRes.body.token;

    // Create a server
    const serverRes = await request(app)
      .post('/api/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Server for Categories' });
    serverId = serverRes.body._id;

    // Create a category
    const categoryRes = await request(app)
      .post(`/api/servers/${serverId}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Initial Category' });
    categoryId = categoryRes.body._id;
  });

  describe('PATCH /api/categories/:categoryId', () => {
    it('should update a category successfully', async () => {
      const res = await request(app)
        .patch(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Category Name' });

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated Category Name');
      expect(res.body._id).toBe(categoryId);
    });

    it('should return 403 if a non-owner tries to update', async () => {
      // Create a second user
      const anotherUserData = {
        email: `anotheruser-${Date.now()}@example.com`,
        username: `anotheruser-${Date.now()}`,
        password: 'password123',
      };
      await request(app).post('/api/auth/register').send(anotherUserData);
      const anotherLoginRes = await request(app).post('/api/auth/login').send({ email: anotherUserData.email, password: anotherUserData.password });
      const anotherToken = anotherLoginRes.body.token;

      const res = await request(app)
        .patch(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .send({ name: 'Malicious Update' });

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for a non-existent category', async () => {
      const nonExistentId = '605cde185e49a821e84d516d';
      const res = await request(app)
        .patch(`/api/categories/${nonExistentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Wont work' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/categories/:categoryId', () => {
    it('should delete a category successfully', async () => {
      const res = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(204);

      // Verify it's gone by trying to fetch it via the server list
      const getRes = await request(app)
        .get(`/api/servers/${serverId}/categories`)
        .set('Authorization', `Bearer ${token}`);

      const deletedCategoryExists = getRes.body.some((cat: ICategory) => cat._id === categoryId);
      expect(deletedCategoryExists).toBe(false);
    });

    it('should return 403 if a non-owner tries to delete', async () => {
      const anotherUserData = {
        email: `deleter-${Date.now()}@example.com`,
        username: `deleter-${Date.now()}`,
        password: 'password123',
      };
      await request(app).post('/api/auth/register').send(anotherUserData);
      const anotherLoginRes = await request(app).post('/api/auth/login').send({ email: anotherUserData.email, password: anotherUserData.password });
      const anotherToken = anotherLoginRes.body.token;

      const res = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${anotherToken}`);

      expect(res.statusCode).toBe(403);
    });
  });
});
