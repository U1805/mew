import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import validate from './validate';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('middleware/validate', () => {
  it('calls next when schema validation succeeds', () => {
    const schema = z.object({
      body: z.object({ name: z.string().min(1) }),
      query: z.object({}).passthrough(),
      params: z.object({}).passthrough(),
    });

    const req: any = { body: { name: 'ok' }, query: {}, params: {} };
    const res = makeRes();
    const next = vi.fn();

    validate(schema as any)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 and zod errors when schema validation fails', () => {
    const schema = z.object({
      body: z.object({ name: z.string().min(3) }),
      query: z.object({}).passthrough(),
      params: z.object({}).passthrough(),
    });

    const req: any = { body: { name: 'a' }, query: {}, params: {} };
    const res = makeRes();
    const next = vi.fn();

    validate(schema as any)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

