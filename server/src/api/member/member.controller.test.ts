import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./member.service', () => ({
  default: {
    getMembersByServer: vi.fn(),
    removeMember: vi.fn(),
    leaveServer: vi.fn(),
    updateMemberRoles: vi.fn(),
  },
}));

import memberController from './member.controller';
import memberService from './member.service';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('member.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMembers returns members list', async () => {
    vi.mocked(memberService.getMembersByServer).mockResolvedValue([{ userId: 'u1' }] as any);
    const req: any = { params: { serverId: 's1' }, user: { id: 'u0' } };
    const res = makeRes();
    const next = vi.fn();

    await memberController.getMembers(req, res, next);

    expect(memberService.getMembersByServer).toHaveBeenCalledWith('s1', 'u0');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ userId: 'u1' }]);
  });

  it('removeMember returns 204', async () => {
    vi.mocked(memberService.removeMember).mockResolvedValue(undefined as any);
    const req: any = { params: { serverId: 's1', userId: 'u2' }, user: { id: 'u0' } };
    const res = makeRes();
    const next = vi.fn();

    await memberController.removeMember(req, res, next);

    expect(memberService.removeMember).toHaveBeenCalledWith('s1', 'u2', 'u0');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('leaveServer returns 204', async () => {
    vi.mocked(memberService.leaveServer).mockResolvedValue(undefined as any);
    const req: any = { params: { serverId: 's1' }, user: { id: 'u0' } };
    const res = makeRes();
    const next = vi.fn();

    await memberController.leaveServer(req, res, next);

    expect(memberService.leaveServer).toHaveBeenCalledWith('s1', 'u0');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('updateMemberRoles returns updated member', async () => {
    vi.mocked(memberService.updateMemberRoles).mockResolvedValue({ userId: 'u2', roleIds: ['r1'] } as any);
    const req: any = {
      params: { serverId: 's1', userId: 'u2' },
      user: { id: 'u0' },
      body: { roleIds: ['r1'] },
    };
    const res = makeRes();
    const next = vi.fn();

    await memberController.updateMemberRoles(req, res, next);

    expect(memberService.updateMemberRoles).toHaveBeenCalledWith('s1', 'u2', 'u0', ['r1']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ userId: 'u2', roleIds: ['r1'] });
  });
});

