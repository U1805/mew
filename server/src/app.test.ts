import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './app';

describe('app', () => {
  it('GET / returns health message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('API is running');
  });
});

