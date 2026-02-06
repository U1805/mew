import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../utils/errors';

vi.mock('./webhook.repository', () => ({
  webhookRepository: {
    create: vi.fn(),
    findByChannel: vi.fn(),
    findByIdAndChannelWithToken: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    findByIdAndToken: vi.fn(),
    countOtherWebhooksByBotUserId: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../server/server.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../user/user.model', () => {
  function UserCtor(this: any, data: any) {
    Object.assign(this, data);
    this._id = 'u-new';
    this.save = vi.fn().mockResolvedValue(undefined);
  }
  const Ctor: any = UserCtor as any;
  Ctor.prototype = UserCtor.prototype;
  Ctor.mockClear = vi.fn();
  Ctor.mockImplementation = vi.fn();
  Ctor.findById = vi.fn();
  return { default: Ctor };
});

vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn(),
  getS3PublicUrl: vi.fn((key: string) => (key.startsWith('http') ? key : `http://cdn.local/${key}`)),
}));

vi.mock('../message/message.service', () => ({
  createMessage: vi.fn(),
}));

import { webhookRepository } from './webhook.repository';
import ServerModel from '../server/server.model';
import UserModel from '../user/user.model';
import * as MessageService from '../message/message.service';
import { uploadFile } from '../../utils/s3';
import {
  assertValidWebhookToken,
  createWebhook,
  deleteWebhook,
  executeWebhook,
  getWebhookTokenByChannel,
  getWebhooksByChannel,
  resetWebhookToken,
  updateWebhook,
} from './webhook.service';

describe('webhook.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createWebhook validates required name', async () => {
    await expect(createWebhook('c1', 's1', { name: '' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('createWebhook throws when server is missing', async () => {
    vi.mocked((ServerModel as any).findById).mockResolvedValue(null);
    await expect(createWebhook('c1', 's1', { name: 'hook' } as any)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('createWebhook uses existing upload key when present', async () => {
    vi.mocked((ServerModel as any).findById).mockResolvedValue({ _id: 's1' });
    vi.mocked((webhookRepository as any).create).mockResolvedValue({ _id: 'w1', name: 'hook' });

    const result: any = await createWebhook('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', { name: 'hook' }, {
      key: 'avatar.png',
      originalname: 'a.png',
      mimetype: 'image/png',
      size: 1,
    } as any);

    expect(uploadFile).not.toHaveBeenCalled();
    expect((webhookRepository as any).create).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'http://cdn.local/avatar.png' }));
    expect(result.token).toBeTruthy();
  });

  it('createWebhook uploads avatar when key is missing', async () => {
    vi.mocked((ServerModel as any).findById).mockResolvedValue({ _id: 's1' });
    vi.mocked(uploadFile as any).mockResolvedValue({ key: 'from-upload.png' });
    vi.mocked((webhookRepository as any).create).mockResolvedValue({ _id: 'w1' });

    await createWebhook('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', { name: 'hook' }, {
      originalname: 'a.png',
      mimetype: 'image/png',
      size: 1,
    } as any);

    expect(uploadFile).toHaveBeenCalled();
    expect((webhookRepository as any).create).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'http://cdn.local/from-upload.png' }));
  });

  it('getWebhooksByChannel delegates to repository', async () => {
    vi.mocked((webhookRepository as any).findByChannel).mockResolvedValue([{ _id: 'w1' }]);
    const result = await getWebhooksByChannel('c1');
    expect(result).toEqual([{ _id: 'w1' }]);
  });

  it('getWebhookTokenByChannel throws when webhook is missing', async () => {
    vi.mocked((webhookRepository as any).findByIdAndChannelWithToken).mockResolvedValue(null);
    await expect(getWebhookTokenByChannel('c1', 'w1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getWebhookTokenByChannel returns token when found', async () => {
    vi.mocked((webhookRepository as any).findByIdAndChannelWithToken).mockResolvedValue({ _id: 'w1', token: 't1' });
    await expect(getWebhookTokenByChannel('c1', 'w1')).resolves.toEqual({ webhookId: 'w1', token: 't1' });
  });

  it('updateWebhook throws when webhook is missing', async () => {
    vi.mocked((webhookRepository as any).findByIdAndUpdate).mockResolvedValue(null);
    await expect(updateWebhook('w1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('updateWebhook merges uploaded avatarUrl', async () => {
    vi.mocked(uploadFile as any).mockResolvedValue({ key: 'u.png' });
    vi.mocked((webhookRepository as any).findByIdAndUpdate).mockResolvedValue({ _id: 'w1', avatarUrl: 'http://cdn.local/u.png' });

    const result: any = await updateWebhook('w1', { name: 'n' }, { originalname: 'a', mimetype: 'image/png', size: 1 } as any);
    expect((webhookRepository as any).findByIdAndUpdate).toHaveBeenCalledWith('w1', expect.objectContaining({ avatarUrl: 'http://cdn.local/u.png' }));
    expect(result._id).toBe('w1');
  });

  it('deleteWebhook throws when webhook is missing', async () => {
    vi.mocked((webhookRepository as any).deleteOne).mockResolvedValue({ deletedCount: 0 });
    await expect(deleteWebhook('w1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deleteWebhook succeeds when deletedCount > 0', async () => {
    vi.mocked((webhookRepository as any).deleteOne).mockResolvedValue({ deletedCount: 1 });
    await expect(deleteWebhook('w1')).resolves.toBeUndefined();
  });

  it('assertValidWebhookToken throws UnauthorizedError for invalid token', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue(null);
    await expect(assertValidWebhookToken('w1', 'bad')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('assertValidWebhookToken returns webhook for valid token', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue({ _id: 'w1' });
    await expect(assertValidWebhookToken('w1', 'ok')).resolves.toEqual({ _id: 'w1' });
  });

  it('resetWebhookToken throws when webhook is missing', async () => {
    vi.mocked((webhookRepository as any).findByIdAndUpdate).mockResolvedValue(null);
    await expect(resetWebhookToken('w1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resetWebhookToken returns webhookId and new token', async () => {
    vi.mocked((webhookRepository as any).findByIdAndUpdate).mockResolvedValue({ _id: 'w1' });
    const result = await resetWebhookToken('w1');
    expect(result.webhookId).toBe('w1');
    expect(result.token).toBeTruthy();
  });

  it('executeWebhook throws when bot user is missing', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue({
      _id: 'w1',
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: 'u-bot',
      serverId: 's1',
    });
    vi.mocked((webhookRepository as any).countOtherWebhooksByBotUserId).mockResolvedValue(0);
    vi.mocked((UserModel as any).findById).mockResolvedValue(null);

    await expect(executeWebhook('w1', 't1', { content: 'hi' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('executeWebhook rejects unsupported message types', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue({
      _id: 'w1',
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: 'u-bot',
      serverId: 's1',
    });
    vi.mocked((webhookRepository as any).countOtherWebhooksByBotUserId).mockResolvedValue(0);
    vi.mocked((UserModel as any).findById).mockResolvedValue({ _id: 'u-bot' });

    await expect(executeWebhook('w1', 't1', { type: 'app/x-unknown', content: 'x' } as any)).rejects.toBeInstanceOf(BadRequestError);
  });

  it('executeWebhook rejects empty content for message/default', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue({
      _id: 'w1',
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: 'u-bot',
      serverId: 's1',
    });
    vi.mocked((webhookRepository as any).countOtherWebhooksByBotUserId).mockResolvedValue(0);
    vi.mocked((UserModel as any).findById).mockResolvedValue({ _id: 'u-bot' });

    await expect(executeWebhook('w1', 't1', { content: '   ' })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('executeWebhook migrates shared bot user and falls back to new id when update returns null', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue({
      _id: { toString: () => 'w1' },
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: { toString: () => 'u-bot' },
      serverId: { toString: () => 's1' },
    });
    vi.mocked((webhookRepository as any).countOtherWebhooksByBotUserId).mockResolvedValue(1);
    vi.mocked((ServerModel as any).findById).mockResolvedValue({ _id: 's1' });
    vi.mocked((webhookRepository as any).findByIdAndUpdate).mockResolvedValue(null);
    vi.mocked((UserModel as any).findById).mockResolvedValue({ _id: 'u-new' });
    vi.mocked(MessageService.createMessage).mockResolvedValue({ _id: 'm1' } as any);

    await executeWebhook('w1', 't1', { content: 'hello' });

    expect(MessageService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: 'u-new' }),
      { bypassPermissions: true }
    );
  });

  it('executeWebhook hydrates and sanitizes payload for twitter/bilibili cards', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue({
      _id: 'w1',
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: 'u-bot',
      serverId: 's1',
    });
    vi.mocked((webhookRepository as any).countOtherWebhooksByBotUserId).mockResolvedValue(0);
    vi.mocked((UserModel as any).findById).mockResolvedValue({ _id: 'u-bot' });
    vi.mocked(MessageService.createMessage).mockResolvedValue({ _id: 'm1' } as any);

    await executeWebhook('w1', 't1', {
      type: 'app/x-twitter-card',
      payload: {
        s3_image: 'img.png',
        s3_http: 'https://example.com/already.png',
        quoted_tweet: {
          text: 'quoted',
          quoted_tweet: { nested: true },
        },
        webhookName: 'should-drop',
      },
    } as any);

    expect(MessageService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'app/x-twitter-card',
        payload: expect.objectContaining({
          s3_image: 'http://cdn.local/img.png',
          s3_http: 'https://example.com/already.png',
          quoted_tweet: { text: 'quoted' },
          webhookName: 'Hook',
        }),
      }),
      { bypassPermissions: true }
    );

    await executeWebhook('w1', 't1', {
      type: 'app/x-bilibili-card',
      payload: {
        original_post: {
          text: 'a',
          original_post: {
            text: 'b',
            original_post: {
              text: 'c',
            },
          },
        },
      },
    } as any);

    expect(MessageService.createMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'app/x-bilibili-card',
        payload: expect.objectContaining({
          original_post: expect.objectContaining({
            original_post: expect.objectContaining({
              original_post: expect.objectContaining({ text: 'c' }),
            }),
          }),
        }),
      }),
      { bypassPermissions: true }
    );
  });

  it('executeWebhook creates a message with webhook overrides', async () => {
    vi.mocked((webhookRepository as any).findByIdAndToken).mockResolvedValue({
      _id: 'w1',
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: 'u-bot',
      serverId: 's1',
    });
    vi.mocked((webhookRepository as any).countOtherWebhooksByBotUserId).mockResolvedValue(0);
    vi.mocked((UserModel as any).findById).mockResolvedValue({ _id: 'u-bot' } as any);
    vi.mocked(MessageService.createMessage).mockResolvedValue({ _id: 'm1' } as any);

    const result = await executeWebhook('w1', 't1', {
      content: 'hello',
      username: 'OverrideName',
      avatar_url: 'override.png',
    });

    expect(MessageService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'c1',
        authorId: 'u-bot',
        type: 'message/default',
        content: 'hello',
        payload: expect.objectContaining({
          webhookName: 'Hook',
          overrides: expect.objectContaining({
            username: 'OverrideName',
            avatarUrl: 'override.png',
          }),
        }),
      }),
      { bypassPermissions: true }
    );
    expect(result).toEqual({ _id: 'm1' });
  });
});
