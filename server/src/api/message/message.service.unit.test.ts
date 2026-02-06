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
  ChannelType: {
    GUILD_TEXT: 'GUILD_TEXT',
    GUILD_WEB: 'GUILD_WEB',
    DM: 'DM',
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

vi.mock('../sticker/sticker.model', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('../userSticker/userSticker.model', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('../bot/bot.model', () => ({
  default: {
    exists: vi.fn(),
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

vi.mock('../stt/stt.service', () => ({
  transcribeVoiceFileToText: vi.fn().mockResolvedValue('语音转文字结果为空'),
}));

import { messageRepository } from './message.repository';
import Channel from '../channel/channel.model';
import Member from '../member/member.model';
import Role from '../role/role.model';
import Server from '../server/server.model';
import Sticker from '../sticker/sticker.model';
import UserSticker from '../userSticker/userSticker.model';
import BotModel from '../bot/bot.model';
import mentionService from './mention.service';
import { extractFirstUrl, getLinkPreviewWithSafety } from '../metadata/metadata.service';
import { calculateEffectivePermissions } from '../../utils/permission.service';
import { socketManager } from '../../gateway/events';

import {
  addReaction,
  createMessage,
  deleteMessage,
  getMessagesByChannel,
  removeReaction,
  transcribeVoiceMessage,
  updateMessage,
} from './message.service';

const mkId = (id: string) => ({
  toString: () => id,
  equals: (other: any) => other === id || other?.toString?.() === id,
});

const makeFindByIdQuery = (leanValue: any) => {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(leanValue),
  };
  return query;
};

const makeFindQuery = (leanValue: any) => {
  const query: any = {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(leanValue),
  };
  return query;
};

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
    // Default channel lookup for getMessagesByChannel tests.
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM' }));
  });

  it('getMessagesByChannel includes unified context for normal messages', async () => {
    const msg: any = {
      _id: 'm1',
      channelId: 'c1',
      authorId: { username: 'orig', avatarUrl: 'orig.png', isBot: false },
      type: 'message/default',
      content: 'hello world',
      payload: undefined,
      attachments: [],
    };
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });

    expect(result[0].context).toBe('hello world');
  });

  it('getMessagesByChannel returns empty for GUILD_WEB channels', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_WEB', serverId: mkId('s1') }));
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([
      { _id: 'm1', channelId: 'c1', content: 'x', attachments: [] },
    ] as any);

    const result = await getMessagesByChannel({ channelId: 'c1', limit: 20 });
    expect(result).toEqual([]);
  });

  it('getMessagesByChannel masks retracted messages for clients', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM' }));
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([
      {
        _id: 'm1',
        channelId: 'c1',
        content: 'secret',
        attachments: [{ key: 'a.png' }],
        payload: { title: 'x' },
        mentions: ['u2'],
        retractedAt: new Date().toISOString(),
      },
    ] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });
    expect(result[0].content).toBe('此消息已撤回');
    expect(result[0].attachments).toEqual([]);
    expect(result[0].payload).toEqual({});
    expect(result[0].mentions).toEqual([]);
  });

  it('getMessagesByChannel attaches serverId for guild channels', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([
      { _id: 'm1', channelId: 'c1', content: 'hello', attachments: [] },
    ] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });
    expect(result[0].serverId).toBe('s1');
  });

  it('getMessagesByChannel derives context from card-style payload when content is empty', async () => {
    const msg: any = {
      _id: 'm1',
      channelId: 'c1',
      authorId: { username: 'orig', avatarUrl: 'orig.png', isBot: false },
      type: 'message/default',
      content: '',
      payload: { title: 'T', summary: 'S', url: 'https://example.com', webhookName: 'Hook' },
      attachments: [],
    };
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });

    expect(result[0].context).toContain('source: Hook');
    expect(result[0].context).toContain('title: T');
    expect(result[0].context).toContain('summary: S');
    expect(result[0].context).toContain('url: https://example.com');
  });

  it('getMessagesByChannel prefixes voice plainText in context', async () => {
    const msg: any = {
      _id: 'm1',
      channelId: 'c1',
      authorId: { username: 'orig', avatarUrl: 'orig.png', isBot: false },
      type: 'message/voice',
      content: '',
      plainText: 'hello from bot',
      payload: { voice: { key: 'voice.webm', contentType: 'audio/webm', size: 123, durationMs: 1200 } },
      attachments: [],
    };
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });

    expect(result[0].context).toBe('voice: hello from bot');
  });

  it('getMessagesByChannel uses plainText as fallback context for non-voice types', async () => {
    const msg: any = {
      _id: 'm1',
      channelId: 'c1',
      type: 'message/default',
      content: '',
      plainText: 'fallback text',
      attachments: [],
    };
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });
    expect(result[0].context).toBe('fallback text');
  });

  it('getMessagesByChannel builds context from embeds and attachment filenames', async () => {
    const msg: any = {
      _id: 'm1',
      channelId: 'c1',
      type: 'app/x-rss-card',
      content: '',
      payload: {
        embeds: [{ title: 'T', description: 'D', url: 'https://example.com' }],
      },
      attachments: [{ filename: 'a.png' }, { filename: 'b.jpg' }],
    };
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });
    expect(result[0].context).toContain('embed: T | D | https://example.com');
    expect(result[0].context).toContain('attachments: a.png, b.jpg');
  });

  it('getMessagesByChannel emits generic voice context when duration is missing', async () => {
    const msg: any = {
      _id: 'm1',
      channelId: 'c1',
      type: 'message/voice',
      content: '',
      payload: { voice: { key: 'voice.webm' } },
      attachments: [],
    };
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });
    expect(result[0].context).toBe('voice');
  });

  it('getMessagesByChannel returns processed messages when channel lookup is null', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery(null));
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([{ _id: 'm1', channelId: 'c1', content: 'x', attachments: [] }] as any);
    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });
    expect(result[0].serverId).toBeUndefined();
  });

  it('getMessagesByChannel derives context from forwarded message payload', async () => {
    const msg: any = {
      _id: 'm1',
      channelId: 'c1',
      authorId: { username: 'orig', avatarUrl: 'orig.png', isBot: false },
      type: 'app/x-forward-card',
      content: '',
      payload: {
        forwardedFromLabel: 'somewhere',
        forwardedMessage: {
          content: 'forwarded text',
          author: { username: 'bob' },
          attachments: [{ filename: 'a.png' }],
        },
      },
      attachments: [],
    };
    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });

    expect(result[0].context).toContain('forwarded_from: somewhere');
    expect(result[0].context).toContain('forwarded_author: bob');
    expect(result[0].context).toContain('forwarded text');
    expect(result[0].context).toContain('forwarded_attachments: a.png');
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

  it('getMessagesByChannel does not leak overrides across messages sharing the same author object', async () => {
    const sharedAuthor: any = { username: 'orig', avatarUrl: 'orig.png', isBot: true };

    const msg1: any = {
      _id: 'm1',
      channelId: 'c1',
      authorId: sharedAuthor,
      payload: { overrides: { username: 'A', avatarUrl: 'a.png' } },
      attachments: [],
    };

    const msg2: any = {
      _id: 'm2',
      channelId: 'c1',
      authorId: sharedAuthor,
      payload: { overrides: { username: 'B', avatarUrl: 'b.png' } },
      attachments: [],
    };

    vi.mocked(messageRepository.findByChannel).mockResolvedValue([msg1, msg2] as any);

    const result: any = await getMessagesByChannel({ channelId: 'c1', limit: 20 });

    expect(sharedAuthor.username).toBe('orig');
    expect(sharedAuthor.avatarUrl).toBe('orig.png');

    expect(result[0].authorId.username).toBe('A');
    expect(result[0].authorId.avatarUrl).toBe('http://cdn.local/a.png');

    expect(result[1].authorId.username).toBe('B');
    expect(result[1].authorId.avatarUrl).toBe('http://cdn.local/b.png');

    expect(result[0].authorId).not.toBe(result[1].authorId);
  });

  it('createMessage throws NotFoundError when channel does not exist', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery(null));
    await expect(createMessage({ channelId: 'c1', authorId: 'u1' } as any)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('createMessage throws BadRequestError when missing channel/author', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM' }));
    await expect(createMessage({ channelId: 'c1' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage rejects guild-web channels', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_WEB' }));
    await expect(createMessage({ channelId: 'c1', authorId: 'u1' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage rejects non-recipient in DM when bypassPermissions is false', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(
      makeFindByIdQuery({ type: 'DM', recipients: [mkId('u2')] })
    );
    await expect(createMessage({ channelId: 'c1', authorId: 'u1', content: 'x' } as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createMessage rejects invalid guild channel with missing serverId', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT' }));
    await expect(createMessage({ channelId: 'c1', authorId: 'u1', content: 'x' } as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createMessage rejects non-member in guild channels', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    vi.mocked((Member as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    vi.mocked((Role as any).find).mockReturnValue(makeFindQuery([]));
    vi.mocked((Server as any).findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }) });
    await expect(createMessage({ channelId: 'c1', authorId: 'u1', content: 'x' } as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createMessage rejects guild sender without SEND_MESSAGES', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    vi.mocked((Member as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
    vi.mocked((Role as any).find).mockReturnValue(makeFindQuery([{ _id: mkId('r0'), permissions: [], position: 0 }]));
    vi.mocked((Server as any).findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }) });
    vi.mocked(calculateEffectivePermissions as any).mockReturnValue(new Set(['VIEW_CHANNEL']));
    await expect(createMessage({ channelId: 'c1', authorId: 'u1', content: 'x' } as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createMessage throws on missing @everyone role in server config', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    vi.mocked((Member as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
    vi.mocked((Role as any).find).mockReturnValue(makeFindQuery([{ _id: mkId('r1'), permissions: [], position: 0 }]));
    vi.mocked((Server as any).findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }) });
    await expect(createMessage({ channelId: 'c1', authorId: 'u1', content: 'x' } as any)).rejects.toThrow(
      'Server configuration error: @everyone role not found.'
    );
  });

  it('createMessage broadcasts MESSAGE_CREATE to DM recipients (no channel-room duplicate)', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue({
      ...makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1'), mkId('u2')] }),
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

    expect(socketManager.broadcast).not.toHaveBeenCalled();
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u1', 'MESSAGE_CREATE', expect.any(Object));
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u2', 'MESSAGE_CREATE', expect.any(Object));
    expect(result.attachments[0].url).toBe('http://cdn.local/k.png');
  });

  it('createMessage broadcasts MESSAGE_CREATE to the channel room for non-DM channels', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT' }));
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue(null);

    const doc = makeMessageDoc({
      channelId: mkId('c1'),
      authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
      attachments: [],
    });
    vi.mocked(messageRepository.create).mockReturnValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await createMessage({ channelId: 'c1', authorId: 'u1', content: 'hi' } as any, { bypassPermissions: true });

    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_CREATE', 'c1', expect.any(Object));
    expect(socketManager.broadcastToUser).not.toHaveBeenCalled();
  });

  it('createMessage rejects server-scope sticker messages in DMs', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM' }));
    await expect(
      createMessage(
        {
        channelId: 'c1',
        authorId: 'u1',
        type: 'message/sticker',
        payload: { stickerId: 'st1', stickerScope: 'server' },
      } as any,
        { bypassPermissions: true }
      )
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage rejects sticker message when stickerId is missing', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    await expect(
      createMessage(
        {
          channelId: 'c1',
          authorId: 'u1',
          type: 'message/sticker',
          payload: {},
        } as any,
        { bypassPermissions: true }
      )
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage rejects invalid forward-card payload', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    await expect(
      createMessage(
        {
          channelId: 'c1',
          authorId: 'u1',
          type: 'app/x-forward-card',
          payload: {},
        } as any
      )
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage normalizes valid forward-card payload and uses authorId object first', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue(null);
    const createdDoc = makeMessageDoc({
      channelId: mkId('c1'),
      authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
      payload: undefined,
      attachments: [],
    });
    vi.mocked(messageRepository.create).mockReturnValue(createdDoc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await createMessage(
      {
        channelId: 'c1',
        authorId: 'u1',
        type: 'app/x-forward-card',
        payload: {
          forwardedFromLabel: 'room-a',
          forwardedMessage: {
            _id: 'f1',
            type: 'message/default',
            content: 'hello',
            payload: { foo: 'bar' },
            attachments: [{ filename: 'a.png', contentType: 'image/png', url: 'http://a', size: 1 }, null],
            authorId: { _id: 'u2', username: 'bob', avatarUrl: 'b.png', isBot: false },
            author: { _id: 'u3', username: 'charlie', avatarUrl: 'c.png', isBot: true },
            createdAt: new Date('2024-01-01'),
          },
        },
      } as any
    );

    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '',
        attachments: [],
        payload: expect.objectContaining({
          forwardedFromLabel: 'room-a',
          forwardedMessage: expect.objectContaining({
            _id: 'f1',
            type: 'message/default',
            content: 'hello',
            attachments: [expect.objectContaining({ filename: 'a.png' })],
            author: expect.objectContaining({ username: 'bob' }),
          }),
        }),
      })
    );
  });

  it('createMessage supports forward-card with fallback author field and default type/content', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue(null);
    vi.mocked(messageRepository.create).mockImplementation((data: any) => makeMessageDoc({
      channelId: mkId('c1'),
      authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
      type: data.type,
      payload: data.payload,
      content: data.content,
      attachments: data.attachments,
    }) as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await createMessage(
      {
        channelId: 'c1',
        authorId: 'u1',
        type: 'app/x-forward-card',
        payload: {
          forwardedMessage: {
            attachments: [{ filename: 42 }],
            author: { _id: 'u3', username: 'charlie', avatarUrl: 'c.png', isBot: true },
          },
        },
      } as any
    );

    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/x-forward-card',
        payload: expect.objectContaining({
          forwardedMessage: expect.objectContaining({
            type: 'message/default',
            content: '',
            author: expect.objectContaining({ username: 'charlie' }),
          }),
        }),
      })
    );
  });

  it('createMessage rejects when referenced message does not exist', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(messageRepository.findById).mockResolvedValue(null as any);
    await expect(
      createMessage(
        {
          channelId: 'c1',
          authorId: 'u1',
          content: 'x',
          referencedMessageId: 'm-ref',
        } as any
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('createMessage rejects when referenced message is in another channel', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(messageRepository.findById).mockResolvedValue({ channelId: mkId('c2') } as any);
    await expect(
      createMessage(
        {
          channelId: 'c1',
          authorId: 'u1',
          content: 'x',
          referencedMessageId: 'm-ref',
        } as any
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createMessage allows user stickers in DMs and hydrates payload', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(
      makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1'), mkId('u2')] })
    );

    vi.mocked((UserSticker as any).findOne).mockReturnValue(
      makeFindByIdQuery({
        _id: mkId('ust1'),
        userId: mkId('u1'),
        name: 'Wave',
        description: 'hi',
        format: 'png',
        contentType: 'image/png',
        key: 'user-sticker.png',
        size: 123,
      })
    );

    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue(null);

    vi.mocked(messageRepository.create).mockImplementation((data: any) => {
      const doc = makeMessageDoc({
        channelId: mkId('c1'),
        authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
        content: data.content,
        attachments: data.attachments,
        payload: data.payload,
      });
      return doc as any;
    });
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    const result: any = await createMessage({
      channelId: 'c1',
      authorId: 'u1',
      type: 'message/sticker',
      payload: { stickerId: 'ust1', stickerScope: 'user' },
    } as any);

    expect(result.payload.sticker.url).toBe('http://cdn.local/user-sticker.png');
    expect(result.payload.sticker.scope).toBe('user');
    expect(socketManager.broadcast).not.toHaveBeenCalled();
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u1', 'MESSAGE_CREATE', expect.any(Object));
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u2', 'MESSAGE_CREATE', expect.any(Object));
  });

  it('createMessage hydrates sticker payload and broadcasts', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    vi.mocked((Sticker as any).findOne).mockReturnValue(
      makeFindByIdQuery({
        _id: mkId('st1'),
        serverId: mkId('s1'),
        name: 'Wave',
        description: 'hi',
        format: 'png',
        contentType: 'image/png',
        key: 'sticker.png',
        size: 123,
      })
    );

    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue(null);

    vi.mocked(messageRepository.create).mockImplementation((data: any) => {
      const doc = makeMessageDoc({
        channelId: mkId('c1'),
        authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
        content: data.content,
        attachments: data.attachments,
        payload: data.payload,
      });
      return doc as any;
    });
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    const result: any = await createMessage({
      channelId: 'c1',
      authorId: 'u1',
      type: 'message/sticker',
      payload: { stickerId: 'st1' },
    } as any, { bypassPermissions: true });

    expect(messageRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message/sticker',
        attachments: [],
        payload: expect.objectContaining({
          sticker: expect.objectContaining({
            name: 'Wave',
            key: 'sticker.png',
            scope: 'server',
          }),
        }),
      })
    );

    expect(result.payload.sticker.url).toBe('http://cdn.local/sticker.png');
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_CREATE', 'c1', expect.any(Object));
  });

  it('createMessage triggers async metadata embed update and MESSAGE_UPDATE (DM via recipients)', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue({
      ...makeFindByIdQuery({ type: 'DM', recipients: [mkId('u2')] }),
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

    await createMessage({ channelId: 'c1', authorId: 'u1', content: 'see https://example.com' } as any, { bypassPermissions: true });

    // allow the .then(async ...) chain to run
    await new Promise((r) => setTimeout(r, 0));

    expect(socketManager.broadcast).not.toHaveBeenCalled();
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u2', 'MESSAGE_UPDATE', expect.any(Object));
  });

  it('createMessage does not emit metadata update when preview has no title', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue({
      ...makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }),
    });
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue('https://example.com');
    vi.mocked(getLinkPreviewWithSafety).mockResolvedValue({ url: 'https://example.com' } as any);

    const doc = makeMessageDoc({
      channelId: mkId('c1'),
      authorId: { username: 'alice', avatarUrl: 'a.png', isBot: false },
      attachments: [],
    });
    vi.mocked(messageRepository.create).mockReturnValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await createMessage({ channelId: 'c1', authorId: 'u1', content: 'https://example.com' } as any, { bypassPermissions: true });
    await new Promise((r) => setTimeout(r, 0));

    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_CREATE', 'c1', expect.any(Object));
    expect(socketManager.broadcast).not.toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });

  it('createMessage emits metadata MESSAGE_UPDATE via channel room for guild channels', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
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

    await createMessage({ channelId: 'c1', authorId: 'u1', content: 'https://example.com' } as any, { bypassPermissions: true });
    await new Promise((r) => setTimeout(r, 0));

    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });

  it('createMessage validates voice message key/contentType/size', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));

    await expect(
      createMessage({ channelId: 'c1', authorId: 'u1', type: 'message/voice', payload: { voice: { contentType: 'audio/webm', size: 1 } } } as any)
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      createMessage({ channelId: 'c1', authorId: 'u1', type: 'message/voice', payload: { voice: { key: 'v.webm', size: 1 } } } as any)
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      createMessage({ channelId: 'c1', authorId: 'u1', type: 'message/voice', payload: { voice: { key: 'v.webm', contentType: 'audio/webm', size: 0 } } } as any)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage validates voice duration and accepts valid voice payload', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    await expect(
      createMessage(
        { channelId: 'c1', authorId: 'u1', type: 'message/voice', payload: { voice: { key: 'v.webm', contentType: 'audio/webm', size: 10, durationMs: 0 } } } as any
      )
    ).rejects.toBeInstanceOf(BadRequestError);

    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(extractFirstUrl).mockReturnValue(null);
    vi.mocked(messageRepository.create).mockImplementation((data: any) =>
      makeMessageDoc({ channelId: mkId('c1'), authorId: { username: 'alice', avatarUrl: 'a.png' }, payload: data.payload, content: data.content, attachments: data.attachments }) as any
    );
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    const result: any = await createMessage(
      { channelId: 'c1', authorId: 'u1', type: 'message/voice', payload: { voice: { key: 'v.webm', contentType: 'audio/webm', size: 10, durationMs: 1200 } } } as any
    );
    expect(result.payload.voice.url).toBe('http://cdn.local/v.webm');
  });

  it('createMessage rejects voice duration when it is a non-number', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    await expect(
      createMessage(
        { channelId: 'c1', authorId: 'u1', type: 'message/voice', payload: { voice: { key: 'v.webm', contentType: 'audio/webm', size: 10, durationMs: 'x' } } } as any
      )
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage rejects sticker message when user-scope authorId cannot be resolved', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    await expect(
      createMessage(
        {
          channelId: 'c1',
          authorId: { toString: () => '' },
          type: 'message/sticker',
          payload: { stickerId: 'ust1', stickerScope: 'user' },
        } as any,
        { bypassPermissions: true }
      )
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createMessage rejects user sticker when sticker is missing', async () => {
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked((UserSticker as any).findOne).mockReturnValue(makeFindByIdQuery(null));
    await expect(
      createMessage(
        {
          channelId: 'c1',
          authorId: 'u1',
          type: 'message/sticker',
          payload: { stickerId: 'ust1', stickerScope: 'user' },
        } as any,
        { bypassPermissions: true }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('createMessage swallows metadata errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT' }));
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

    await createMessage({ channelId: 'c1', authorId: 'u1', content: 'see https://example.com' } as any, { bypassPermissions: true });
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
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT' }));
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await updateMessage('m1', 'u1', 'new content');

    expect(messageRepository.save).toHaveBeenCalled();
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });

  it('updateMessage rejects non-author edits on invalid channel', async () => {
    const doc = makeMessageDoc({ authorId: mkId('u2'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM' }));

    await expect(updateMessage('m1', 'u1', 'x')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updateMessage allows MANAGE_MESSAGES permission for non-author', async () => {
    const doc = makeMessageDoc({ authorId: mkId('u2'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    vi.mocked((Member as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
    vi.mocked((Role as any).find).mockReturnValue(makeFindQuery([{ _id: mkId('r0'), permissions: [], position: 0 }]));
    vi.mocked((Server as any).findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }) });
    vi.mocked(calculateEffectivePermissions as any).mockReturnValue(new Set(['MANAGE_MESSAGES']));
    vi.mocked(mentionService.processMentions).mockResolvedValue([] as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await updateMessage('m1', 'u1', 'x');

    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });

  it('updateMessage throws NotFoundError when channel is missing', async () => {
    const doc = makeMessageDoc({ authorId: mkId('u1'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery(null));
    await expect(updateMessage('m1', 'u1', 'new')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deleteMessage allows bot owner to retract a bot-authored message', async () => {
    const doc = makeMessageDoc({ authorId: mkId('botUser1'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((BotModel as any).exists).mockResolvedValue({ _id: 'b1' } as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    await deleteMessage('m1', 'owner1');
    expect(doc.retractedAt).toBeDefined();
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });

  it('deleteMessage rejects non-author in DM channel', async () => {
    const doc = makeMessageDoc({ authorId: mkId('u2'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((BotModel as any).exists).mockResolvedValue(null as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM' }));
    await expect(deleteMessage('m1', 'u1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('deleteMessage handles null channel by returning processed message without serverId', async () => {
    const doc = makeMessageDoc({ authorId: mkId('u1'), channelId: mkId('c1') });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery(null));
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);

    const result: any = await deleteMessage('m1', 'u1');
    expect(result.serverId).toBeUndefined();
  });

  it('addReaction returns unchanged message when same emoji already exists', async () => {
    const doc = makeMessageDoc({
      channelId: mkId('c1'),
      reactions: [{ emoji: ':smile:', userIds: [mkId('u1')] }],
    });
    doc.populate = vi.fn().mockResolvedValue(doc);
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));

    const result: any = await addReaction('m1', 'u1', ':smile:');
    expect(messageRepository.addReaction).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('addReaction throws NotFoundError when message does not exist', async () => {
    vi.mocked(messageRepository.findById).mockResolvedValue(null as any);
    await expect(addReaction('m1', 'u1', ':x:')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('addReaction throws when repository cannot add reaction', async () => {
    const doc = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(messageRepository.addReaction).mockResolvedValue(null as any);

    await expect(addReaction('m1', 'u1', ':x:')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removeReaction throws when repository cannot remove reaction', async () => {
    const doc = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(messageRepository.removeReaction).mockResolvedValue(null as any);

    await expect(removeReaction('m1', 'u1', ':x:')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removeReaction broadcasts MESSAGE_REACTION_REMOVE on success', async () => {
    const source = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    const final = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    vi.mocked(messageRepository.findById).mockResolvedValue(source as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(messageRepository.removeReaction).mockResolvedValue(final as any);

    await removeReaction('m1', 'u1', ':ok:');
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_REACTION_REMOVE', 'c1', expect.any(Object));
  });

  it('addReaction replaces existing emoji for same user when emoji changes', async () => {
    const source = makeMessageDoc({
      channelId: mkId('c1'),
      reactions: [{ emoji: ':old:', userIds: [mkId('u1')] }],
    });
    const final = makeMessageDoc({ channelId: mkId('c1'), reactions: [{ emoji: ':new:', userIds: [mkId('u1')] }] });
    vi.mocked(messageRepository.findById).mockResolvedValue(source as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    vi.mocked(messageRepository.addReaction).mockResolvedValue(final as any);

    await addReaction('m1', 'u1', ':new:');
    expect(messageRepository.addReaction).toHaveBeenCalledWith('m1', 'u1', ':new:', ':old:');
  });

  it('addReaction handles null channel when building response payload', async () => {
    const source = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    const final = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    vi.mocked(messageRepository.findById).mockResolvedValue(source as any);
    vi.mocked((Channel as any).findById)
      .mockReturnValueOnce(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }))
      .mockReturnValueOnce(makeFindByIdQuery(null));
    vi.mocked(messageRepository.addReaction).mockResolvedValue(final as any);
    await addReaction('m1', 'u1', ':ok:');
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_REACTION_ADD', 'c1', expect.any(Object));
  });

  it('removeReaction handles null channel when building response payload', async () => {
    const source = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    const final = makeMessageDoc({ channelId: mkId('c1'), reactions: [] });
    vi.mocked(messageRepository.findById).mockResolvedValue(source as any);
    vi.mocked((Channel as any).findById)
      .mockReturnValueOnce(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }))
      .mockReturnValueOnce(makeFindByIdQuery(null));
    vi.mocked(messageRepository.removeReaction).mockResolvedValue(final as any);
    await removeReaction('m1', 'u1', ':ok:');
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_REACTION_REMOVE', 'c1', expect.any(Object));
  });

  it('transcribeVoiceMessage updates plainText and broadcasts to DM recipients', async () => {
    const doc = makeMessageDoc({
      _id: mkId('m1'),
      channelId: mkId('c1'),
      type: 'message/voice',
      plainText: undefined,
    });

    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1'), mkId('u2')] }));

    const text = await transcribeVoiceMessage('c1', 'm1', 'u1', { originalname: 'voice.webm' } as any);

    expect(text).toBe('语音转文字结果为空');
    expect(doc.plainText).toBe('语音转文字结果为空');
    expect(socketManager.broadcast).not.toHaveBeenCalled();
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u1', 'MESSAGE_UPDATE', expect.any(Object));
    expect(socketManager.broadcastToUser).toHaveBeenCalledWith('u2', 'MESSAGE_UPDATE', expect.any(Object));
  });

  it('transcribeVoiceMessage rejects non-voice messages', async () => {
    const doc = makeMessageDoc({
      _id: mkId('m1'),
      channelId: mkId('c1'),
      type: 'message/default',
    });

    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));
    await expect(transcribeVoiceMessage('c1', 'm1', 'u1', { originalname: 'x.txt' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('transcribeVoiceMessage rejects if message is not in the same channel', async () => {
    const doc = makeMessageDoc({
      _id: mkId('m1'),
      channelId: mkId('c2'),
      type: 'message/voice',
    });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));

    await expect(transcribeVoiceMessage('c1', 'm1', 'u1', { originalname: 'v.webm' } as any)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('transcribeVoiceMessage throws when channel cannot be loaded', async () => {
    const doc = makeMessageDoc({
      _id: mkId('m1'),
      channelId: mkId('c1'),
      type: 'message/voice',
    });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery(null));

    await expect(transcribeVoiceMessage('c1', 'm1', 'u1', { originalname: 'v.webm' } as any)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('transcribeVoiceMessage maps non-string transcription to empty string', async () => {
    const { transcribeVoiceFileToText } = await import('../stt/stt.service');
    vi.mocked(transcribeVoiceFileToText as any).mockResolvedValue(12345 as any);

    const doc = makeMessageDoc({
      _id: mkId('m1'),
      channelId: mkId('c1'),
      type: 'message/voice',
      plainText: 'old',
    });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);
    vi.mocked((Channel as any).findById).mockReturnValue(makeFindByIdQuery({ type: 'DM', recipients: [mkId('u1')] }));

    const text = await transcribeVoiceMessage('c1', 'm1', 'u1', { originalname: 'v.webm' } as any);
    expect(text).toBe('');
    expect(doc.plainText).toBeUndefined();
  });

  it('transcribeVoiceMessage broadcasts MESSAGE_UPDATE to channel room for guild channels', async () => {
    const { transcribeVoiceFileToText } = await import('../stt/stt.service');
    vi.mocked(transcribeVoiceFileToText as any).mockResolvedValue('语音转文字结果为空');

    const doc = makeMessageDoc({
      _id: mkId('m1'),
      channelId: mkId('c1'),
      type: 'message/voice',
    });
    vi.mocked(messageRepository.findById).mockResolvedValue(doc as any);
    vi.mocked(messageRepository.save).mockResolvedValue(undefined as any);
    vi.mocked((Member as any).findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
    vi.mocked((Role as any).find).mockReturnValue(makeFindQuery([{ _id: mkId('r0'), permissions: [], position: 0 }]));
    vi.mocked((Server as any).findById).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }) });
    vi.mocked(calculateEffectivePermissions as any).mockReturnValue(new Set(['VIEW_CHANNEL']));
    vi.mocked((Channel as any).findById)
      .mockReturnValueOnce(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }))
      .mockReturnValueOnce(makeFindByIdQuery({ type: 'GUILD_TEXT', serverId: mkId('s1') }));

    const text = await transcribeVoiceMessage('c1', 'm1', 'u1', { originalname: 'v.webm' } as any);
    expect(text).toBe('语音转文字结果为空');
    expect(socketManager.broadcast).toHaveBeenCalledWith('MESSAGE_UPDATE', 'c1', expect.any(Object));
  });
});

