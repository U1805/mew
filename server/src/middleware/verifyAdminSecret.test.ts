import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('middleware/verifyAdminSecret', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const reqWithSecret = (value: string | undefined) =>
    ({
      header: vi.fn().mockImplementation((name: string) => (name === 'x-mew-admin-secret' ? value : undefined)),
    }) as any;

  it('rejects when admin secret is not configured', async () => {
    vi.doMock('../config', () => ({ default: { adminSecret: '' } }));

    const { verifyAdminSecret } = await import('./verifyAdminSecret');
    const next = vi.fn();

    verifyAdminSecret(reqWithSecret('any'), {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.name).toBe('UnauthorizedError');
  });

  it('rejects when header is missing', async () => {
    vi.doMock('../config', () => ({ default: { adminSecret: 'abc' } }));

    const { verifyAdminSecret } = await import('./verifyAdminSecret');
    const next = vi.fn();

    verifyAdminSecret(reqWithSecret(undefined), {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.name).toBe('UnauthorizedError');
  });

  it('rejects when header length differs or secret mismatches', async () => {
    vi.doMock('../config', () => ({ default: { adminSecret: 'abc' } }));

    const { verifyAdminSecret } = await import('./verifyAdminSecret');

    const next1 = vi.fn();
    verifyAdminSecret(reqWithSecret('ab'), {} as any, next1);
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next1.mock.calls[0][0]?.name).toBe('UnauthorizedError');

    const next2 = vi.fn();
    verifyAdminSecret(reqWithSecret('abd'), {} as any, next2);
    expect(next2).toHaveBeenCalledTimes(1);
    expect(next2.mock.calls[0][0]?.name).toBe('UnauthorizedError');
  });

  it('allows when header matches admin secret', async () => {
    vi.doMock('../config', () => ({ default: { adminSecret: 'abc' } }));

    const { verifyAdminSecret } = await import('./verifyAdminSecret');
    const next = vi.fn();

    verifyAdminSecret(reqWithSecret('abc'), {} as any, next);

    expect(next).toHaveBeenCalledWith();
  });
});
