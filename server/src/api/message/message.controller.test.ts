import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

vi.mock('./message.service', () => ({
  createMessage: vi.fn(),
  getMessagesByChannel: vi.fn(),
  updateMessage: vi.fn(),
  deleteMessage: vi.fn(),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  transcribeVoiceMessage: vi.fn(),
}));

import * as messageService from './message.service';
import {
  addReactionHandler,
  createMessageHandler,
  deleteMessageHandler,
  getMessagesHandler,
  removeReactionHandler,
  transcribeVoiceMessageHandler,
  updateMessageHandler,
} from './message.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.type = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('message.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createMessageHandler requires authentication', async () => {
    const req: any = { params: { channelId: '507f1f77bcf86cd799439011' }, body: { content: 'hi' } };
    const res = makeRes();
    const next = vi.fn();

    await createMessageHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('createMessageHandler maps plain-text alias and optional fields', async () => {
    vi.mocked(messageService.createMessage).mockResolvedValue({ _id: 'm1' } as any);
    const req: any = {
      params: { channelId: '507f1f77bcf86cd799439011' },
      user: { id: '507f1f77bcf86cd799439012' },
      body: {
        content: 'hello',
        type: 'app/x-rss-card',
        payload: { title: 'x' },
        referencedMessageId: '507f1f77bcf86cd799439013',
        'plain-text': 'pt',
      },
    };
    const res = makeRes();
    const next = vi.fn();

    await createMessageHandler(req, res, next);

    expect(messageService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'hello',
        type: 'app/x-rss-card',
        payload: { title: 'x' },
        plainText: 'pt',
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ _id: 'm1' });
  });

  it('getMessagesHandler parses query and returns list', async () => {
    vi.mocked(messageService.getMessagesByChannel).mockResolvedValue([{ _id: 'm1' }] as any);
    const req: any = { params: { channelId: 'c1' }, query: { limit: '20', before: 'm0' } };
    const res = makeRes();
    const next = vi.fn();

    await getMessagesHandler(req, res, next);

    expect(messageService.getMessagesByChannel).toHaveBeenCalledWith({ channelId: 'c1', limit: 20, before: 'm0' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateMessageHandler requires authentication', async () => {
    const req: any = { params: { messageId: 'm1' }, body: { content: 'x' } };
    const res = makeRes();
    const next = vi.fn();

    await updateMessageHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('updateMessageHandler updates and returns message', async () => {
    vi.mocked(messageService.updateMessage).mockResolvedValue({ _id: 'm1', content: 'x' } as any);
    const req: any = { user: { id: 'u1' }, params: { messageId: 'm1' }, body: { content: 'x' } };
    const res = makeRes();
    const next = vi.fn();

    await updateMessageHandler(req, res, next);

    expect(messageService.updateMessage).toHaveBeenCalledWith('m1', 'u1', 'x');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteMessageHandler requires authentication', async () => {
    const req: any = { params: { messageId: 'm1' } };
    const res = makeRes();
    const next = vi.fn();

    await deleteMessageHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('deleteMessageHandler deletes and returns payload', async () => {
    vi.mocked(messageService.deleteMessage).mockResolvedValue({ _id: 'm1' } as any);
    const req: any = { user: { id: 'u1' }, params: { messageId: 'm1' } };
    const res = makeRes();
    const next = vi.fn();

    await deleteMessageHandler(req, res, next);
    expect(messageService.deleteMessage).toHaveBeenCalledWith('m1', 'u1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('addReactionHandler and removeReactionHandler require authentication', async () => {
    const res = makeRes();
    const next1 = vi.fn();
    const next2 = vi.fn();

    await addReactionHandler({ params: { messageId: 'm1', emoji: ':+1:' } } as any, res, next1);
    await removeReactionHandler({ params: { messageId: 'm1', emoji: ':+1:' } } as any, res, next2);

    expect(next1.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(next2.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('addReactionHandler and removeReactionHandler return updated message', async () => {
    vi.mocked(messageService.addReaction).mockResolvedValue({ _id: 'm1' } as any);
    vi.mocked(messageService.removeReaction).mockResolvedValue({ _id: 'm1' } as any);
    const req: any = { user: { id: 'u1' }, params: { messageId: 'm1', emoji: ':+1:' } };
    const res = makeRes();
    const next = vi.fn();

    await addReactionHandler(req, res, next);
    await removeReactionHandler(req, res, next);

    expect(messageService.addReaction).toHaveBeenCalledWith('m1', 'u1', ':+1:');
    expect(messageService.removeReaction).toHaveBeenCalledWith('m1', 'u1', ':+1:');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('transcribeVoiceMessageHandler validates auth and file', async () => {
    const res = makeRes();
    const next1 = vi.fn();
    const next2 = vi.fn();

    await transcribeVoiceMessageHandler({ params: { channelId: 'c1', messageId: 'm1' } } as any, res, next1);
    expect(next1.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);

    await transcribeVoiceMessageHandler({ user: { id: 'u1' }, params: { channelId: 'c1', messageId: 'm1' } } as any, res, next2);
    expect(next2.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
  });

  it('transcribeVoiceMessageHandler returns plain text', async () => {
    vi.mocked(messageService.transcribeVoiceMessage).mockResolvedValue('ok');
    const req: any = {
      user: { id: 'u1' },
      params: { channelId: 'c1', messageId: 'm1' },
      file: { originalname: 'v.webm' },
    };
    const res = makeRes();
    const next = vi.fn();

    await transcribeVoiceMessageHandler(req, res, next);

    expect(messageService.transcribeVoiceMessage).toHaveBeenCalledWith('c1', 'm1', 'u1', req.file);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('text/plain');
    expect(res.send).toHaveBeenCalledWith('ok');
  });
});
