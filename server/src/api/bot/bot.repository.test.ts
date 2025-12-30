import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./bot.model', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
    findById: vi.fn(),
  },
}));

import Bot from './bot.model';
import { findByServiceTypeWithToken } from './bot.repository';

describe('api/bot/bot.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findByServiceTypeWithToken uses $or for rss-fetcher (back-compat)', async () => {
    (Bot as any).find.mockReturnValue({
      select: vi.fn().mockResolvedValue(['ok']),
    });

    await expect(findByServiceTypeWithToken('rss-fetcher')).resolves.toEqual(['ok']);
    expect((Bot as any).find).toHaveBeenCalledWith({
      $or: [{ serviceType: 'rss-fetcher' }, { serviceType: { $exists: false } }],
    });
  });

  it('findByServiceTypeWithToken filters by serviceType for other types', async () => {
    (Bot as any).find.mockReturnValue({
      select: vi.fn().mockResolvedValue(['ok']),
    });

    await expect(findByServiceTypeWithToken('test-agent')).resolves.toEqual(['ok']);
    expect((Bot as any).find).toHaveBeenCalledWith({ serviceType: 'test-agent' });
  });
});

