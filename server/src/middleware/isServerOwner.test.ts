import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError } from '../utils/errors';

vi.mock('../api/member/member.model', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import ServerMember from '../api/member/member.model';
import { isServerOwner } from './isServerOwner';

describe('middleware/isServerOwner', () => {
  const findOne = (ServerMember as any).findOne as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next with ForbiddenError when not authenticated', async () => {
    const req: any = { params: { serverId: 's1' } };
    const next = vi.fn();

    await isServerOwner(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('calls next with ForbiddenError when user is not owner', async () => {
    findOne.mockResolvedValue({ isOwner: false });
    const req: any = { params: { serverId: 's1' }, user: { id: 'u1' } };
    const next = vi.fn();

    await isServerOwner(req, {} as any, next);

    expect(findOne).toHaveBeenCalledWith({ serverId: 's1', userId: 'u1' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });

  it('calls next without error when user is owner', async () => {
    findOne.mockResolvedValue({ isOwner: true });
    const req: any = { params: { serverId: 's1' }, user: { id: 'u1' } };
    const next = vi.fn();

    await isServerOwner(req, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});

