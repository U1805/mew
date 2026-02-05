import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import config from '../config';
import { authMiddleware } from './middleware';

describe('gateway/authMiddleware', () => {
  it('rejects when token is missing', () => {
    const socket: any = { handshake: { auth: {} } };
    const next = vi.fn();

    authMiddleware(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as Error).message).toContain('No token');
  });

  it('rejects when token is invalid', () => {
    const socket: any = { handshake: { auth: { token: 'bad-token' } } };
    const next = vi.fn();

    authMiddleware(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as Error).message).toContain('Invalid token');
  });

  it('rejects when token uses a disallowed algorithm', () => {
    const token = jwt.sign({ id: 'u1', username: 'alice' }, config.jwtSecret, { algorithm: 'HS512' as any });
    const socket: any = { handshake: { auth: { token } } };
    const next = vi.fn();

    authMiddleware(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as Error).message).toContain('Invalid token');
  });

  it('sets socket.user and calls next when token is valid', () => {
    const token = jwt.sign({ id: 'u1', username: 'alice' }, config.jwtSecret);
    const socket: any = { handshake: { auth: { token } } };
    const next = vi.fn();

    authMiddleware(socket, next);

    expect(socket.user).toEqual(expect.objectContaining({ id: 'u1', username: 'alice' }));
    expect(next).toHaveBeenCalledWith();
  });
});
