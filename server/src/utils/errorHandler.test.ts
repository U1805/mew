import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorHandler } from './errorHandler';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from './errors';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('utils/errorHandler', () => {
  const req: any = {};
  const next = vi.fn();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    next.mockClear();
    consoleError.mockClear();
  });

  afterEach(() => {
    // keep console mocked
  });

  it('maps NotFoundError to 404', () => {
    const res = makeRes();
    errorHandler(new NotFoundError('nope'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'nope' });
  });

  it('maps ForbiddenError to 403', () => {
    const res = makeRes();
    errorHandler(new ForbiddenError('no'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps BadRequestError to 400', () => {
    const res = makeRes();
    errorHandler(new BadRequestError('bad'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps ConflictError to 409', () => {
    const res = makeRes();
    errorHandler(new ConflictError('conflict'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('maps UnauthorizedError to 401', () => {
    const res = makeRes();
    errorHandler(new UnauthorizedError('unauth'), req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('maps mongoose ValidationError to 400', () => {
    const res = makeRes();
    const err: any = new Error('invalid');
    err.name = 'ValidationError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid data format provided.',
      error: 'invalid',
    });
  });

  it('returns 500 for unknown errors and logs them', () => {
    const res = makeRes();
    errorHandler(new Error('unexpected'), req, res, next);
    expect(consoleError).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
  });
});

