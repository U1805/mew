import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./botInvite.service', () => ({
  default: {
    searchServerBots: vi.fn(),
    inviteBotToServer: vi.fn(),
  },
}));

import botInviteController from './botInvite.controller';
import botInviteService from './botInvite.service';

describe('api/botInvite/botInvite.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searchBots returns 200 with results', async () => {
    vi.mocked((botInviteService as any).searchServerBots).mockResolvedValue([{ _id: 'b1' }]);

    const req: any = { params: { serverId: 's1' }, query: { q: 'bot' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    await botInviteController.searchBots(req, res, next);

    expect((botInviteService as any).searchServerBots).toHaveBeenCalledWith('s1', 'bot');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 'b1' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('inviteBot returns 204', async () => {
    vi.mocked((botInviteService as any).inviteBotToServer).mockResolvedValue(undefined);

    const req: any = { params: { serverId: 's1', botUserId: 'b1' } };
    const res: any = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    const next = vi.fn();

    await botInviteController.inviteBot(req, res, next);

    expect((botInviteService as any).inviteBotToServer).toHaveBeenCalledWith('s1', 'b1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalled();
  });
});

