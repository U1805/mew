import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./bot.service', () => ({
  bootstrapBots: vi.fn(),
  bootstrapBotById: vi.fn(),
}));

import { bootstrapBotsHandler } from './bot.bootstrap.controller';
import * as botService from './bot.service';

describe('api/bot/bot.bootstrap.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('bootstrapBotsHandler returns 400 when serviceType is missing', async () => {
    const res = makeRes();
    const next = vi.fn();

    await bootstrapBotsHandler({ body: {}, query: {} } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'serviceType is required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('bootstrapBotsHandler reads serviceType from body and returns bots', async () => {
    (botService as any).bootstrapBots.mockResolvedValue([{ id: 'b1' }]);
    const res = makeRes();
    const next = vi.fn();

    await bootstrapBotsHandler({ body: { serviceType: 'rss-fetcher' }, query: {} } as any, res, next);

    expect((botService as any).bootstrapBots).toHaveBeenCalledWith('rss-fetcher');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ bots: [{ id: 'b1' }] });
    expect(next).not.toHaveBeenCalled();
  });

  it('bootstrapBotsHandler falls back to serviceType from query', async () => {
    (botService as any).bootstrapBots.mockResolvedValue([]);
    const res = makeRes();
    const next = vi.fn();

    await bootstrapBotsHandler({ body: {}, query: { serviceType: 'test-agent' } } as any, res, next);

    expect((botService as any).bootstrapBots).toHaveBeenCalledWith('test-agent');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ bots: [] });
  });
});

