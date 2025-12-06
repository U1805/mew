import { describe, it, expect, beforeEach, vi } from 'vitest';
import roleService from './role.service';
import Role from './role.model';
import ServerMember from '../member/member.model';
import Channel from '../channel/channel.model';
import User from '../user/user.model';
import Server from '../server/server.model';

describe('Role Service', () => {

  // Mock data
  let user: any;
  let server: any;
  let roleToDelete: any;
  let channel: any;

  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await Server.deleteMany({});
    await Role.deleteMany({});
    await ServerMember.deleteMany({});
    await Channel.deleteMany({});

    // Create a user
    user = await User.create({ email: 'role-user@test.com', username: 'role-user', password: 'password' });

    // Create a server and its @everyone role
    const serverData = await new Server({ name: 'Test Server' }).save();
    const everyoneRole = await new Role({ name: '@everyone', serverId: serverData._id, position: 0, isDefault: true }).save();
    serverData.everyoneRoleId = everyoneRole._id;
    server = await serverData.save();

    // Create a role to be deleted
    roleToDelete = await Role.create({ name: 'Deletable Role', serverId: server._id, position: 1 });

    // Create a member with the deletable role (and make them the owner for test purposes)
    await ServerMember.create({ serverId: server._id, userId: user._id, roleIds: [everyoneRole._id, roleToDelete._id], isOwner: true });

    // Create a channel with a permission override for the deletable role
    channel = await Channel.create({
      serverId: server._id,
      name: 'test-channel',
      type: 'GUILD_TEXT',
      permissionOverrides: [{
        targetType: 'role',
        targetId: roleToDelete._id,
        allow: ['MANAGE_MESSAGES'],
        deny: []
      }]
    });
  });

  describe('deleteRole', () => {
    it('should cascade delete role references from members and channel overrides', async () => {
      // 1. Call the service to delete the role
      await roleService.deleteRole(roleToDelete._id.toString(), server._id.toString(), user._id.toString());

      // 2. Verify the role is deleted
      const deletedRoleInDb = await Role.findById(roleToDelete._id);
      expect(deletedRoleInDb).toBeNull();

      // 3. Verify the roleId is removed from ServerMember
      const member = await ServerMember.findOne({ userId: user._id });
      expect(member).not.toBeNull();
      expect(member!.roleIds.map(String)).not.toContain(roleToDelete._id.toString());
      expect(member!.roleIds.map(String)).toContain(server.everyoneRoleId.toString());

      // 4. Verify the permission override is removed from the Channel
      const updatedChannel = await Channel.findById(channel._id);
      const overrideExists = updatedChannel!.permissionOverrides!.some(
        ov => ov.targetId.toString() === roleToDelete._id.toString()
      );
      expect(overrideExists).toBe(false);
    });

    it('should throw an error when trying to delete the default @everyone role', async () => {
      const everyoneRole = await Role.findOne({ serverId: server._id, isDefault: true });
      await expect(roleService.deleteRole(everyoneRole!._id.toString(), server._id.toString(), user._id.toString()))
        .rejects.toThrow('Cannot delete the default @everyone role.');
    });
  });
});
