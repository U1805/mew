import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../utils/errors';

vi.mock('./role.repository', () => ({
  roleRepository: {
    findOne: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    updateById: vi.fn(),
    bulkWrite: vi.fn(),
    findById: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

vi.mock('../member/member.model', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../channel/channel.model', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../../utils/hierarchy.utils', () => ({
  checkRoleHierarchy: vi.fn(),
}));

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
  },
}));

vi.mock('../../utils/permission.service', () => ({
  syncUsersPermissionsForServerChannels: vi.fn(),
}));

import roleService from './role.service';
import { roleRepository } from './role.repository';
import ServerMember from '../member/member.model';
import { checkRoleHierarchy } from '../../utils/hierarchy.utils';
import { socketManager } from '../../gateway/events';
import { syncUsersPermissionsForServerChannels } from '../../utils/permission.service';

const mkId = (id: string) => ({
  toString: () => id,
  equals: (other: any) => other === id || other?.toString?.() === id,
});

describe('role.service (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRole', () => {
    it('rejects non-owner', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: false });
      await expect(roleService.createRole('s1', 'u1', { name: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('assigns position=1 when no highestRole and position not provided', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.findOne).mockResolvedValue(null as any);
      vi.mocked(roleRepository.create).mockResolvedValue({ _id: 'r1', position: 1 } as any);

      const role: any = await roleService.createRole('s1', 'u1', { name: 'x' });

      expect(roleRepository.create).toHaveBeenCalledWith(expect.objectContaining({ serverId: 's1', position: 1 }));
      expect(socketManager.broadcast).toHaveBeenCalledWith('PERMISSIONS_UPDATE', 's1', { serverId: 's1' });
      expect(role.position).toBe(1);
    });

    it('assigns position=highest+1 when highestRole exists', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.findOne).mockResolvedValue({ position: 5 } as any);
      vi.mocked(roleRepository.create).mockResolvedValue({ _id: 'r1', position: 6 } as any);

      const role: any = await roleService.createRole('s1', 'u1', { name: 'x' });
      expect(role.position).toBe(6);
    });
  });

  describe('updateRole', () => {
    it('rejects non-member', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue(null);
      await expect(roleService.updateRole('r1', 's1', 'u1', { name: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('checks hierarchy for non-owner', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: false });
      vi.mocked(roleRepository.updateById).mockResolvedValue({ _id: 'r1' } as any);

      await roleService.updateRole('r1', 's1', 'u1', { name: 'x' });

      expect(checkRoleHierarchy).toHaveBeenCalledWith('s1', 'u1', 'r1');
    });

    it('throws NotFoundError when role not found', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.updateById).mockResolvedValue(null as any);
      await expect(roleService.updateRole('r1', 's1', 'u1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('syncs permissions in background when permissions updated', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.updateById).mockResolvedValue({ _id: mkId('r1') } as any);
      vi.mocked((ServerMember as any).find).mockResolvedValue([{ userId: mkId('u2') }] as any);
      vi.mocked(syncUsersPermissionsForServerChannels as any).mockResolvedValue(undefined);

      await roleService.updateRole('r1', 's1', 'u1', { permissions: ['SEND_MESSAGES'] as any });
      await new Promise((r) => setTimeout(r, 0));

      expect(syncUsersPermissionsForServerChannels).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: 's1', userIds: ['u2'] })
      );
    });

    it('swallows background sync errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.updateById).mockResolvedValue({ _id: mkId('r1') } as any);
      vi.mocked((ServerMember as any).find).mockRejectedValue(new Error('boom'));

      await roleService.updateRole('r1', 's1', 'u1', { permissions: ['SEND_MESSAGES'] as any });
      await new Promise((r) => setTimeout(r, 0));

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('updateRolePositions', () => {
    it('skips bulkWrite for empty positions and returns roles', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.find).mockResolvedValue([{ _id: 'r1' }] as any);

      const roles = await roleService.updateRolePositions('s1', 'u1', []);

      expect(roleRepository.bulkWrite).not.toHaveBeenCalled();
      expect(roles).toEqual([{ _id: 'r1' }]);
    });

    it('bulkWrites positions', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.bulkWrite).mockResolvedValue({} as any);
      vi.mocked(roleRepository.find).mockResolvedValue([] as any);

      await roleService.updateRolePositions('s1', 'u1', [{ roleId: 'r1', position: 2 }]);

      expect(roleRepository.bulkWrite).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteRole', () => {
    it('rejects when role not found in server', async () => {
      vi.mocked((ServerMember as any).findOne).mockResolvedValue({ isOwner: true });
      vi.mocked(roleRepository.findById).mockResolvedValue(null as any);

      await expect(roleService.deleteRole('r1', 's1', 'u1')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

