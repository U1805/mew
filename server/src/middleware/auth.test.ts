import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import config from '../config';
import { protect } from './auth';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('middleware/auth protect', () => {
  const next = vi.fn();

  beforeEach(() => {
    next.mockClear();
  });

  it('returns 401 when Authorization header is missing', () => {
    const req: any = { headers: {} };
    const res = makeRes();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized: No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', () => {
    const req: any = { headers: { authorization: 'Bearer bad-token' } };
    const res = makeRes();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized: Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token uses a disallowed algorithm', () => {
    const token = jwt.sign({ id: 'u1', username: 'alice' }, config.jwtSecret, { algorithm: 'HS512' as any });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized: Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user and calls next when token is valid', () => {
    const token = jwt.sign({ id: 'u1', username: 'alice' }, config.jwtSecret);
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();

    protect(req, res, next);

    expect(req.user).toEqual(expect.objectContaining({ id: 'u1', username: 'alice' }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
