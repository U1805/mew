import { describe, it, expect, vi } from 'vitest';
import asyncHandler from './asyncHandler';

describe('utils/asyncHandler', () => {
  it('passes thrown errors to next', async () => {
    const handler = asyncHandler(async () => {
      throw new Error('boom');
    });

    const next = vi.fn();
    await handler({} as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as Error).message).toBe('boom');
  });

  it('passes rejected promises to next', async () => {
    const handler = asyncHandler(async () => {
      return Promise.reject(new Error('nope'));
    });

    const next = vi.fn();
    await handler({} as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as Error).message).toBe('nope');
  });
});

