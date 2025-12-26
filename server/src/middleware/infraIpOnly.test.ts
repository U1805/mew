import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const createReq = (ip: string | undefined): Request =>
  ({
    ip,
    socket: { remoteAddress: ip },
  }) as unknown as Request;

describe('infraIpOnly', () => {
  it('rejects when ip is missing', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');
    const next = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq(undefined), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ForbiddenError', message: 'Forbidden' }));
  });

  it('rejects public IPv4 when allowlist is empty', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');
    const next = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('8.8.8.8'), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ForbiddenError', message: 'Forbidden' }));
  });

  it('rejects invalid ip when allowlist is empty', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');
    const next = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('not-an-ip'), {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ForbiddenError', message: 'Forbidden' }));
  });

  it('allows private IPv4 when allowlist is empty', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');
    const next = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('192.168.1.10'), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('normalizes ::ffff: IPv4-mapped addresses', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');
    const next = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('::ffff:192.168.1.10'), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows loopback IPv6 when allowlist is empty', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');
    const next = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('::1'), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows private-ish IPv6 ranges when allowlist is empty', async () => {
    const { infraIpOnly } = await import('./infraIpOnly');

    const next1 = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('fc00::1'), {} as Response, next1);
    expect(next1).toHaveBeenCalledWith();

    const next2 = vi.fn() as unknown as NextFunction;
    infraIpOnly(createReq('fe80::1'), {} as Response, next2);
    expect(next2).toHaveBeenCalledWith();
  });
});
