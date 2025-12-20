import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./invite.service', () => ({
  default: {
    createInvite: vi.fn(),
    getInviteDetails: vi.fn(),
    acceptInvite: vi.fn(),
  },
}));

import inviteController from './invite.controller';
import inviteService from './invite.service';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('invite.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createInvite returns 201', async () => {
    vi.mocked(inviteService.createInvite).mockResolvedValue({ code: 'abc' } as any);
    const req: any = { params: { serverId: 's1' }, user: { id: 'u1' }, body: { expiresAt: null, maxUses: 5 } };
    const res = makeRes();
    const next = vi.fn();

    await inviteController.createInvite(req, res, next);

    expect(inviteService.createInvite).toHaveBeenCalledWith('s1', 'u1', { expiresAt: null, maxUses: 5 });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ code: 'abc' });
  });

  it('getInviteDetails returns 200', async () => {
    vi.mocked(inviteService.getInviteDetails).mockResolvedValue({ serverId: 's1' } as any);
    const req: any = { params: { inviteCode: 'abc' } };
    const res = makeRes();
    const next = vi.fn();

    await inviteController.getInviteDetails(req, res, next);

    expect(inviteService.getInviteDetails).toHaveBeenCalledWith('abc');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ serverId: 's1' });
  });

  it('acceptInvite returns 200 with serverId', async () => {
    vi.mocked(inviteService.acceptInvite).mockResolvedValue({ serverId: 's1' } as any);
    const req: any = { params: { inviteCode: 'abc' }, user: { id: 'u1' } };
    const res = makeRes();
    const next = vi.fn();

    await inviteController.acceptInvite(req, res, next);

    expect(inviteService.acceptInvite).toHaveBeenCalledWith('abc', 'u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ serverId: 's1' });
  });
});

