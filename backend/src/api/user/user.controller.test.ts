import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

vi.mock('./user.service', () => ({
  default: {
    getMe: vi.fn(),
    searchUsers: vi.fn(),
    getUserById: vi.fn(),
    changePassword: vi.fn(),
    updateMe: vi.fn(),
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
  getMeHandler,
  searchUsersHandler,
  updateMeHandler,
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

  it('createDmChannelHandler returns 400 when recipientId missing', async () => {
    const req: any = { user: { id: 'u1' }, body: {} };
    const res = makeRes();
    const next = vi.fn();

    await createDmChannelHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Recipient ID is required' });
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

  it('updateMeHandler passes BadRequestError when no update data provided', async () => {
    const req: any = { user: { id: 'u1' }, body: {}, file: undefined };
    const res = makeRes();
    const next = vi.fn();

    await updateMeHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
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

  it('changePasswordHandler passes UnauthorizedError when unauthenticated', async () => {
    const req: any = { body: { oldPassword: 'o', newPassword: 'n' } };
    const res = makeRes();
    const next = vi.fn();

    await changePasswordHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });
});

