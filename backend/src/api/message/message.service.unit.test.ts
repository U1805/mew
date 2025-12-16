import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

vi.mock('./message.repository', () => ({
  messageRepository: {
    findByChannel: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    findById: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  },
}));

vi.mock('../channel/channel.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../member/member.model', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('../role/role.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../server/server.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('./mention.service', () => ({
  default: {
    processMentions: vi.fn(),
  },
}));

vi.mock('../metadata/metadata.service', () => ({
  extractFirstUrl: vi.fn(),
  getLinkPreviewWithSafety: vi.fn(),
}));

vi.mock('../../utils/permission.service', () => ({
  calculateEffectivePermissions: vi.fn(),
}));

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
    broadcastToUser: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  getS3PublicUrl: vi.fn((key: string) => (key.startsWith('http') ? key : `http://cdn.local/${key}`)),
}));

import { messageRepository } from './message.repository';
import Channel from '../channel/channel.model';
import Member from '../member/member.model';
import Role from '../role/role.model';
import Server from '../server/server.model';
import mentionService from './mention.service';
import { extractFirstUrl, getLinkPreviewWithSafety } from '../metadata/metadata.service';
import { calculateEffectivePermissions } from '../../utils/permission.service';
import { socketManager } from '../../gateway/events';

import { createMessage, getMessagesByChannel, updateMessage } from './message.service';

const mkId = (id: string) => ({
  toString: () => id,
  equals: (other: any) => other === id || other?.toString?.() === id,
});

const makeMessageDoc = (overrides: Partial<any> = {}) => {
  const doc: any = {
    _id: mkId('m1'),
    channelId: mkId('c1'),
    authorId: mkId('u1'),
    content: 'hi',
    attachments: [],
    payload: undefined,
    mentions: [],
    reactions: [],
    toObject() {
      const author =
        typeof this.authorId === 'object' && this.authorId.username
          ? { ...this.authorId }
          : this.authorId;
      return {
        _id: this._id,
        channelId: this.channelId,
        authorId: author,
        content: this.content,
        attachments: Array.isArray(this.attachments) ? this.attachments.map((a: any) => ({ ...a })) : this.attachments,
        payload: this.payload ? JSON.parse(JSON.stringify(this.payload)) : this.payload,
      };
    },
    populate: vi.fn().mockResolvedValue(undefined),
  };
  Object.assign(doc, overrides);
  doc.populate = vi.fn().mockResolvedValue(doc);
  return doc;
};

describe('message.service (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMessagesByChannel applies webhook overrides and hydrates URLs', async () => {
    const doc = makeMessageDoc({
      authorId: { username: 'orig', avatarUrl: 'orig.png' },
      payload: { overrides: { username: 'Hook', avatarUrl: 'hook.png' } },
      attachments: [{ key: 'a.png' }],
    });
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([doc] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });

    expect(result[0].authorId.username).toBe('Hook');
    expect(result[0].authorId.avatarUrl).toBe('http://cdn.local/hook.png');
    expect(result[0].attachments[0].url).toBe('http://cdn.local/a.png');
  });

  it('createMessage throws NotFoundError when channel does not exist', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    await expect(createMessage({ channelId: 'c1', authorId: 'u1' } as any)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('createMessage throws BadRequestError when missing channel/author', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ type: 'DM' }) });
    await expect(createMessage({ channelId: 'c1' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage broadcasts MESSAGE_CREATE and to DM recipients', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ type: 'DM', recipients: [mkId('u1'), mkId('u2')] }),
    });
    vi.mocked(mentionService.processMentions).mockResolvedValue([mkId('u2')] as any);
    vi.mocked(extractFirstUrl).mockReturnValue(null);

    const doc = makeMessageDoc({
      channelId: mkId('c1'),
      authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
      attachments: [{ key: 'k.png' }],
    });
    vi.mocked(messageRepository.create).mockReturnValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    const result: any = await createMessage({ channelId: 'c1', authorId: 'u1', content: 'hi', attachments: [{ key: 'k.png' }] } as any);

    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_CREATE', 'c1', expect.any(Object));
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u1', 'MESSAGE_CREATE', expect.any(Object));
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u2', 'MESSAGE_CREATE', expect.any(Object));
    expect(result.attachments[0].url).toBe('http://cdn.local/k.png');
  });

  it('createMessage triggers async metadata embed update and MESSAGE_UPDATE', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ type: 'DM', recipients: [mkId('u2')] }),
    });
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue('https://example.com');
    vi.mocked(getLinkPreviewWithSafety).mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      siteName: 'Example',
      description: 'desc',
      mediaType: 'website',
      contentType: 'text/html',
      images: [],
      videos: [],
      favicons: [],
    } as any);

    const doc = makeMessageDoc({
      channelId: mkId('c1'),
      authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
      attachments: [],
    });
    vi.mocked(messageRepository.create).mockReturnValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await createMessage({ channelId: 'c1', authorId: 'u1', content: 'see https://example.com' } as any);

    // allow the .then(async ...) chain to run
    await new Promise((r) => setTimeout(r, 0));

    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u2', 'MESSAGE_UPDATE', expect.any(Object));
  });

  it('createMessage swallows metadata errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked((Channel as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ type: 'GUILD_TEXT' }) });
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue('https://example.com');
    vi.mocked(getLinkPreviewWithSafety).mockRejectedValue(new Error('fail'));

    const doc = makeMessageDoc({
      channelId: mkId('c1'),
      authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
      attachments: [],
    });
    vi.mocked(messageRepository.create).mockReturnValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await createMessage({ channelId: 'c1', authorId: 'u1', content: 'see https://example.com' } as any);
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleSpy).toHaveBeenCalled();
  });

  it('updateMessage allows author edits and broadcasts', async () => {
    const doc = makeMessageDoc({
      authorId: mkId('u1'),
      channelId: mkId('c1'),
      populate: vi.fn().mockResolvedValue(undefined),
    });
    doc.populate = vi.fn().mockResolvedValue(doc);
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ type: 'GUILD_TEXT' }) });
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await updateMessage('m1', 'u1', 'new content');

    expect(messageRepository.save).toHaveBeenCalled();
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });

  it('updateMessage rejects non-author edits on invalid channel', async () => {
    const doc = makeMessageDoc({ authorId: mkId('u2'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ type: 'DM' }) });

    await expect(updateMessage('m1', 'u1', 'x')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updateMessage allows MANAGE_MESSAGES permission for non-author', async () => {
    const doc = makeMessageDoc({ authorId: mkId('u2'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ type: 'GUILD_TEXT', serverId: mkId('s1') }) });
    vi.mocked((Member as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
    vi.mocked((Role as any).find).mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]) });
    vi.mocked((Server as any).findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }) });
    vi.mocked(calculateEffectivePermissions as any).mockReturnValue(new Set(['MANAGE_MESSAGES']));
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await updateMessage('m1', 'u1', 'x');

    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });
});

