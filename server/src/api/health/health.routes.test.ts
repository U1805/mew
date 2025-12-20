import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('Health routes (/api/health)', () => {
  it('should return 200 OK for health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
