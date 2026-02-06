import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '../../utils/errors';

vi.mock('./server.service', () => ({
  default: {
    createServer: vi.fn(),
    getServerById: vi.fn(),
    getServersForUser: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    updateServerIcon: vi.fn(),
  },
}));

vi.mock('../../utils/s3', () => ({
  uploadFile: vi.fn().mockResolvedValue({ key: 'uploaded/icon.png' }),
}));

import serverService from './server.service';
import { uploadFile } from '../../utils/s3';
import {
  createServerHandler,
  getUserServersHandler,
  updateServerIconHandler,
} from './server.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('api/server/server.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createServerHandler merges ownerId from req.user', async () => {
    vi.mocked(serverService.createServer).mockResolvedValue({ _id: 's1' } as any);
    const req: any = { user: { id: 'u1' }, body: { name: 'My Server' } };
    const res = makeRes();
    const next = vi.fn();

    await createServerHandler(req, res, next);

    expect(serverService.createServer).toHaveBeenCalledWith({ name: 'My Server', ownerId: 'u1' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ _id: 's1' });
    expect(next).not.toHaveBeenCalled();
  });

  it('getUserServersHandler loads current user servers', async () => {
    vi.mocked(serverService.getServersForUser).mockResolvedValue([{ _id: 's1' }] as any);
    const req: any = { user: { id: 'u1' } };
    const res = makeRes();
    const next = vi.fn();

    await getUserServersHandler(req, res, next);

    expect(serverService.getServersForUser).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 's1' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('updateServerIconHandler returns BadRequestError when file is missing', async () => {
    const req: any = { params: { serverId: 's1' } };
    const res = makeRes();
    const next = vi.fn();

    await updateServerIconHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
    expect(serverService.updateServerIcon).not.toHaveBeenCalled();
  });

  it('updateServerIconHandler updates icon directly when multer already set key', async () => {
    vi.mocked(serverService.updateServerIcon).mockResolvedValue({ _id: 's1', icon: 'existing/icon.png' } as any);
    const req: any = {
      params: { serverId: 's1' },
      file: { key: 'existing/icon.png', originalname: 'icon.png', mimetype: 'image/png', size: 10 },
    };
    const res = makeRes();
    const next = vi.fn();

    await updateServerIconHandler(req, res, next);

    expect(uploadFile).not.toHaveBeenCalled();
    expect(serverService.updateServerIcon).toHaveBeenCalledWith('s1', 'existing/icon.png');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('updateServerIconHandler falls back to uploadFile when key is missing', async () => {
    vi.mocked(serverService.updateServerIcon).mockResolvedValue({ _id: 's1', icon: 'uploaded/icon.png' } as any);
    const req: any = {
      params: { serverId: 's1' },
      file: { originalname: 'icon.png', mimetype: 'image/png', size: 10 },
    };
    const res = makeRes();
    const next = vi.fn();

    await updateServerIconHandler(req, res, next);

    expect(uploadFile).toHaveBeenCalledWith(req.file);
    expect(serverService.updateServerIcon).toHaveBeenCalledWith('s1', 'uploaded/icon.png');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});
