import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

vi.mock('./user.service', () => ({
  default: {
    getMe: vi.fn(),
    searchUsers: vi.fn(),
    getUserById: vi.fn(),
    changePassword: vi.fn(),
    updateMe: vi.fn(),
    getMyNotificationSettings: vi.fn(),
    updateMyNotificationSettings: vi.fn(),
    listMyChannelNotificationSettings: vi.fn(),
  },
}));

vi.mock('../channel/channel.service', () => ({
  default: {
    getDmChannelsByUser: vi.fn(),
    createDmChannel: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn(),
}));

import userService from './user.service';
import channelService from '../channel/channel.service';
import { uploadFile } from '../../utils/s3';
import {
  changePasswordHandler,
  createDmChannelHandler,
  getDmChannelsHandler,
  getMeHandler,
  getMyChannelNotificationSettingsHandler,
  getMyNotificationSettingsHandler,
  getUserByIdHandler,
  searchUsersHandler,
  updateMeHandler,
  updateMyNotificationSettingsHandler,
} from './user.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('user.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMeHandler passes UnauthorizedError when unauthenticated', async () => {
    const req: any = {};
    const res = makeRes();
    const next = vi.fn();

    await getMeHandler(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('getMeHandler returns current user', async () => {
    vi.mocked(userService.getMe).mockResolvedValue({ _id: 'u1' } as any);
    const req: any = { user: { id: 'u1' } };
    const res = makeRes();
    const next = vi.fn();

    await getMeHandler(req, res, next);

    expect(userService.getMe).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ _id: 'u1' });
  });

  it('getDmChannelsHandler rejects unauthenticated requests', async () => {
    const req: any = {};
    const res = makeRes();
    const next = vi.fn();

    await getDmChannelsHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('getDmChannelsHandler returns dm channels', async () => {
    vi.mocked(channelService.getDmChannelsByUser).mockResolvedValue([{ _id: 'c1' }] as any);
    const req: any = { user: { id: 'u1' } };
    const res = makeRes();
    const next = vi.fn();

    await getDmChannelsHandler(req, res, next);
    expect(channelService.getDmChannelsByUser).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 'c1' }]);
  });

  it('createDmChannelHandler rejects unauthenticated requests', async () => {
    const req: any = { body: { recipientId: 'u2' } };
    const res = makeRes();
    const next = vi.fn();

    await createDmChannelHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('createDmChannelHandler returns 400 when recipientId missing', async () => {
    const req: any = { user: { id: 'u1' }, body: {} };
    const res = makeRes();
    const next = vi.fn();

    await createDmChannelHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Recipient ID is required' });
  });

  it('createDmChannelHandler creates DM channel', async () => {
    vi.mocked(channelService.createDmChannel).mockResolvedValue({ _id: 'c1' } as any);
    const req: any = { user: { id: 'u1' }, body: { recipientId: 'u2' } };
    const res = makeRes();
    const next = vi.fn();

    await createDmChannelHandler(req, res, next);
    expect(channelService.createDmChannel).toHaveBeenCalledWith('u1', 'u2');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('searchUsersHandler rejects unauthenticated requests', async () => {
    const req: any = { query: { q: 'a' } };
    const res = makeRes();
    const next = vi.fn();

    await searchUsersHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('searchUsersHandler returns empty array when q missing', async () => {
    const req: any = { user: { id: 'u1' }, query: {} };
    const res = makeRes();
    const next = vi.fn();

    await searchUsersHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(userService.searchUsers).not.toHaveBeenCalled();
  });

  it('searchUsersHandler returns matched users', async () => {
    vi.mocked(userService.searchUsers).mockResolvedValue([{ _id: 'u2' }] as any);
    const req: any = { user: { id: 'u1' }, query: { q: 'alice' } };
    const res = makeRes();
    const next = vi.fn();

    await searchUsersHandler(req, res, next);
    expect(userService.searchUsers).toHaveBeenCalledWith('alice', 'u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 'u2' }]);
  });

  it('getUserByIdHandler returns user details', async () => {
    vi.mocked(userService.getUserById).mockResolvedValue({ _id: 'u2' } as any);
    const req: any = { params: { userId: 'u2' } };
    const res = makeRes();
    const next = vi.fn();

    await getUserByIdHandler(req, res, next);
    expect(userService.getUserById).toHaveBeenCalledWith('u2');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ _id: 'u2' });
  });

  it('updateMeHandler passes BadRequestError when no update data provided', async () => {
    const req: any = { user: { id: 'u1' }, body: {}, file: undefined };
    const res = makeRes();
    const next = vi.fn();

    await updateMeHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
  });

  it('updateMeHandler updates username only', async () => {
    vi.mocked(userService.updateMe).mockResolvedValue({ _id: 'u1', username: 'new' } as any);
    const req: any = { user: { id: 'u1' }, body: { username: 'new' } };
    const res = makeRes();
    const next = vi.fn();

    await updateMeHandler(req, res, next);
    expect(userService.updateMe).toHaveBeenCalledWith('u1', { username: 'new' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateMeHandler uploads avatar and calls userService.updateMe', async () => {
    vi.mocked(userService.updateMe).mockResolvedValue({ _id: 'u1', avatarUrl: 'avatar.png' } as any);

    const req: any = { user: { id: 'u1' }, body: {}, file: { originalname: 'a.png', key: 'avatar.png' } };
    const res = makeRes();
    const next = vi.fn();

    await updateMeHandler(req, res, next);

    expect(uploadFile).not.toHaveBeenCalled();
    expect(userService.updateMe).toHaveBeenCalledWith('u1', { avatarUrl: 'avatar.png' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ _id: 'u1', avatarUrl: 'avatar.png' });
  });

  it('updateMeHandler falls back to uploadFile when key is missing', async () => {
    vi.mocked(uploadFile as any).mockResolvedValue({ key: 'uploaded.png' });
    vi.mocked(userService.updateMe).mockResolvedValue({ _id: 'u1', avatarUrl: 'uploaded.png' } as any);

    const req: any = { user: { id: 'u1' }, body: {}, file: { originalname: 'a.png' } };
    const res = makeRes();
    const next = vi.fn();

    await updateMeHandler(req, res, next);

    expect(uploadFile).toHaveBeenCalled();
    expect(userService.updateMe).toHaveBeenCalledWith('u1', { avatarUrl: 'uploaded.png' });
  });

  it('changePasswordHandler passes UnauthorizedError when unauthenticated', async () => {
    const req: any = { body: { oldPassword: 'o', newPassword: 'n' } };
    const res = makeRes();
    const next = vi.fn();

    await changePasswordHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('changePasswordHandler calls userService and returns 204', async () => {
    const req: any = { user: { id: 'u1' }, body: { oldPassword: 'o', newPassword: 'n' } };
    const res = makeRes();
    const next = vi.fn();

    await changePasswordHandler(req, res, next);

    expect(userService.changePassword).toHaveBeenCalledWith('u1', 'o', 'n');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('getMyNotificationSettingsHandler requires authentication', async () => {
    const req: any = {};
    const res = makeRes();
    const next = vi.fn();
    await getMyNotificationSettingsHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('getMyNotificationSettingsHandler returns settings', async () => {
    vi.mocked(userService.getMyNotificationSettings).mockResolvedValue({ desktopNotifications: true } as any);
    const req: any = { user: { id: 'u1' } };
    const res = makeRes();
    const next = vi.fn();
    await getMyNotificationSettingsHandler(req, res, next);
    expect(userService.getMyNotificationSettings).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updateMyNotificationSettingsHandler requires authentication', async () => {
    const req: any = { body: {} };
    const res = makeRes();
    const next = vi.fn();
    await updateMyNotificationSettingsHandler(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it('updateMyNotificationSettingsHandler updates settings', async () => {
    vi.mocked(userService.updateMyNotificationSettings).mockResolvedValue({ desktopNotifications: false } as any);
    const req: any = { user: { id: 'u1' }, body: { desktopNotifications: false } };
    const res = makeRes();
    const next = vi.fn();
    await updateMyNotificationSettingsHandler(req, res, next);
    expect(userService.updateMyNotificationSettings).toHaveBeenCalledWith('u1', { desktopNotifications: false });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getMyChannelNotificationSettingsHandler returns channel settings', async () => {
    vi.mocked(userService.listMyChannelNotificationSettings).mockResolvedValue([{ channelId: 'c1' }] as any);
    const req: any = { user: { id: 'u1' } };
    const res = makeRes();
    const next = vi.fn();
    await getMyChannelNotificationSettingsHandler(req, res, next);
    expect(userService.listMyChannelNotificationSettings).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ channelId: 'c1' }]);
  });
});
