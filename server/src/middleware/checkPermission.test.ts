import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';

vi.mock('../api/channel/channel.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../api/member/member.model', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('../api/role/role.model', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('../api/server/server.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../utils/permission.service', () => ({
  calculateEffectivePermissions: vi.fn(),
}));

import Channel from '../api/channel/channel.model';
import Member from '../api/member/member.model';
import Role from '../api/role/role.model';
import Server from '../api/server/server.model';
import { calculateEffectivePermissions } from '../utils/permission.service';
import { authorizeChannel, authorizeServer } from './checkPermission';

const mkId = (value: string) => ({
  toString: () => value,
  equals: (other: any) => other === value || other?.toString?.() === value,
});

const mockFindByIdLean = (impl: any) => {
  (Channel as any).findById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(impl),
    }),
  });
};

describe('middleware/checkPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authorizeChannel', () => {
    it('calls next with ForbiddenError when req.user is missing', async () => {
      const mw = authorizeChannel('SEND_MESSAGES' as any);
      const next = vi.fn();

      await mw({ params: { channelId: 'c1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    });

    it('calls next with BadRequestError when channelId is missing', async () => {
      const mw = authorizeChannel('SEND_MESSAGES' as any);
      const next = vi.fn();

      await mw({ params: {}, user: { id: 'u1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
    });

    it('calls next with NotFoundError when channel does not exist', async () => {
      mockFindByIdLean(null);
      const mw = authorizeChannel('SEND_MESSAGES' as any);
      const next = vi.fn();

      await mw({ params: { channelId: 'c1' }, user: { id: 'u1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
    });

    it('allows DM permissions for DM recipients', async () => {
      mockFindByIdLean({
        _id: mkId('c1'),
        type: 'DM',
        recipients: [mkId('u1'), mkId('u2')],
      });
      const mw = authorizeChannel('SEND_MESSAGES' as any);
      const next = vi.fn();

      await mw({ params: { channelId: 'c1' }, user: { id: 'u1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects access to DM channel for non-recipients', async () => {
      mockFindByIdLean({
        _id: mkId('c1'),
        type: 'DM',
        recipients: [mkId('u2')],
      });
      const mw = authorizeChannel('SEND_MESSAGES' as any);
      const next = vi.fn();

      await mw({ params: { channelId: 'c1' }, user: { id: 'u1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    });

    it('allows guild channel access when effective permissions include the required permission', async () => {
      mockFindByIdLean({
        _id: mkId('c1'),
        type: 'GUILD_TEXT',
        serverId: mkId('s1'),
      });

      (Member as any).findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
      (Role as any).find.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]) });
      (Server as any).findById.mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }),
      });
      (calculateEffectivePermissions as any).mockReturnValue(new Set(['SEND_MESSAGES']));

      const mw = authorizeChannel('SEND_MESSAGES' as any);
      const next = vi.fn();

      await mw({ params: { channelId: 'c1' }, user: { id: 'u1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects when effective permissions do not include the required permission', async () => {
      mockFindByIdLean({
        _id: mkId('c1'),
        type: 'GUILD_TEXT',
        serverId: mkId('s1'),
      });

      (Member as any).findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
      (Role as any).find.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]) });
      (Server as any).findById.mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }),
      });
      (calculateEffectivePermissions as any).mockReturnValue(new Set());

      const mw = authorizeChannel('SEND_MESSAGES' as any);
      const next = vi.fn();

      await mw({ params: { channelId: 'c1' }, user: { id: 'u1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    });
  });

  describe('authorizeServer', () => {
    it('allows server owner', async () => {
      (Member as any).findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: true, roleIds: [] }) });
      (Role as any).find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      (Server as any).findById.mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }),
      });

      const mw = authorizeServer('MANAGE_CHANNEL' as any);
      const next = vi.fn();

      await mw({ params: { serverId: 's1' }, user: { id: 'u1' } } as any, {} as any, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('rejects when required permission is missing', async () => {
      (Member as any).findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ isOwner: false, roleIds: [mkId('r0')] }) });
      (Role as any).find.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: mkId('r0'), permissions: [] }]) });
      (Server as any).findById.mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ everyoneRoleId: mkId('r0') }) }),
      });

      const mw = authorizeServer('MANAGE_CHANNEL' as any);
      const next = vi.fn();

      await mw({ params: { serverId: 's1' }, user: { id: 'u1' } } as any, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    });
  });
});
