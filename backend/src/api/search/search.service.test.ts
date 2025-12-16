import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError } from '../../utils/errors';

vi.mock('../channel/channel.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../message/message.model', () => ({
  default: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  getS3PublicUrl: vi.fn((key: string) => (key.startsWith('http') ? key : `http://cdn.local/${key}`)),
}));

import Channel from '../channel/channel.model';
import Message from '../message/message.model';
import { searchMessagesInServer } from './search.service';

describe('search.service searchMessagesInServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundError when server has no channels', async () => {
    vi.mocked((Channel as any).find).mockReturnValue({
      select: vi.fn().mockResolvedValue([]),
    } as any);
    await expect(searchMessagesInServer({ serverId: 's1', query: 'q' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('builds query across server channels and paginates', async () => {
    vi.mocked((Channel as any).find).mockReturnValue({
      select: vi.fn().mockResolvedValue([{ _id: 'c1' }, { _id: 'c2' }]),
    } as any);

    vi.mocked((Message as any).countDocuments).mockResolvedValue(12);
    vi.mocked((Message as any).find).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    } as any);

    const result = await searchMessagesInServer({ serverId: 's1', query: 'cats', limit: 5, page: 2 });

    expect((Message as any).countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ $regex: 'cats', $options: 'i' }),
        channelId: expect.objectContaining({ $in: ['c1', 'c2'] }),
      })
    );
    expect(result.pagination).toEqual({ page: 2, limit: 5, total: 12, totalPages: 3 });
  });

  it('restricts query to a specific channel when channelId is provided', async () => {
    vi.mocked((Channel as any).find).mockReturnValue({
      select: vi.fn().mockResolvedValue([{ _id: 'c1' }]),
    } as any);
    vi.mocked((Message as any).countDocuments).mockResolvedValue(1);
    vi.mocked((Message as any).find).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    } as any);

    await searchMessagesInServer({ serverId: 's1', query: 'cats', channelId: 'c99' });

    expect((Message as any).countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'c99',
      })
    );
  });

  it('applies webhook overrides and hydrates author avatar and attachment urls', async () => {
    vi.mocked((Channel as any).find).mockReturnValue({
      select: vi.fn().mockResolvedValue([{ _id: 'c1' }]),
    } as any);

    vi.mocked((Message as any).countDocuments).mockResolvedValue(1);
    vi.mocked((Message as any).find).mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'm1',
          content: 'hello',
          payload: { overrides: { username: 'Hook', avatarUrl: 'hook.png' } },
          authorId: { username: 'orig', avatarUrl: 'avatar.png' },
          attachments: [{ key: 'a.png' }, { key: 'http://already.full/url.png' }],
        },
      ]),
    } as any);

    const result = await searchMessagesInServer({ serverId: 's1', query: 'h' });

    expect(result.messages[0].authorId.username).toBe('Hook');
    expect(result.messages[0].authorId.avatarUrl).toBe('http://cdn.local/hook.png');
    expect(result.messages[0].attachments[0].url).toBe('http://cdn.local/a.png');
    expect(result.messages[0].attachments[1].url).toBe('http://already.full/url.png');
  });
});
