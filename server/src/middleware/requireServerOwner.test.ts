import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError } from '../utils/errors';
import { requireServerOwner } from './requireServerOwner';

describe('middleware/requireServerOwner', () => {
  it('calls next with ForbiddenError when no member on request', async () => {
    const req: any = {};
    const next = vi.fn();

    await requireServerOwner(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    expect(next.mock.calls[0][0].message).toBe('You are not a member of this server.');
  });

  it('calls next with ForbiddenError when member is not owner', async () => {
    const req: any = { member: { isOwner: false } };
    const next = vi.fn();

    await requireServerOwner(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    expect(next.mock.calls[0][0].message).toBe('Owner permission required.');
  });

  it('calls next without error when member is owner', async () => {
    const req: any = { member: { isOwner: true } };
    const next = vi.fn();

    await requireServerOwner(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});

