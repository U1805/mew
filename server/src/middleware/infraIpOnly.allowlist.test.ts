import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../config', () => ({ default: { infraAllowedIps: ['203.0.113.5'] } }));

const createReq = (ip: string | undefined): Request =>
  ({
    ip,
    socket: { remoteAddress: ip },
  }) as unknown as Request;

describe('infraIpOnly (allowlist)', () => {
  it('allows listed ip and rejects non-listed ip', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');

    const next1 = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('203.0.113.5'), {} as Response, next1);
    expect(next1).toHaveBeenCalledWith();

    const next2 = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('203.0.113.6'), {} as Response, next2);
    expect(next2).toHaveBeenCalledWith(expect.objectContaining({ name: 'ForbiddenError', message: 'Forbidden' }));
  });

  it('normalizes ::ffff: ip before checking allowlist', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');
    const next = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('::ffff:203.0.113.5'), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});
