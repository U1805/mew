import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, UnauthorizedError } from '../../utils/errors';

vi.mock('./webhook.repository', () => ({
  webhookRepository: {
    findByIdAndToken: vi.fn(),
    countOtherWebhooksByBotUserId: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('../user/user.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../message/message.service', () => ({
  createMessage: vi.fn(),
}));

import { webhookRepository } from './webhook.repository';
import UserModel from '../user/user.model';
import * as MessageService from '../message/message.service';
import { executeWebhook } from './webhook.service';

describe('webhook.service executeWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UnauthorizedError when webhook token is invalid', async () => {
    vi.mocked(webhookRepository.findByIdAndToken).mockResolvedValue(null);

    await expect(executeWebhook('w1', 'bad', { content: 'hi' })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws NotFoundError when associated bot user is missing', async () => {
    vi.mocked(webhookRepository.findByIdAndToken).mockResolvedValue({
      _id: 'w1',
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: 'u-bot',
      serverId: 's1',
    } as any);
    vi.mocked(webhookRepository.countOtherWebhooksByBotUserId).mockResolvedValue(0 as any);
    vi.mocked((UserModel as any).findById).mockResolvedValue(null);

    await expect(executeWebhook('w1', 't1', { content: 'hi' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates a message with webhook overrides', async () => {
    vi.mocked(webhookRepository.findByIdAndToken).mockResolvedValue({
      _id: 'w1',
      name: 'Hook',
      avatarUrl: 'hook.png',
      channelId: 'c1',
      botUserId: 'u-bot',
      serverId: 's1',
    } as any);
    vi.mocked(webhookRepository.countOtherWebhooksByBotUserId).mockResolvedValue(0 as any);
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

