import { describe, it, expect, vi, afterEach } from 'vitest';
import Message from '../message/message.model';
import Server from '../server/server.model';
import ServerMember from '../member/member.model';
import { ChannelReadState } from './readState.model';
import channelService from './channel.service';
import { socketManager } from '../../gateway/events';
import Channel from './channel.model';
import User from '../user/user.model';
import Role from '../role/role.model';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcastToUser: vi.fn(),
    broadcast: vi.fn(),
  },
}));

describe('Channel Service', () => {
  afterEach(async () => {
    await Message.deleteMany({});
    await ChannelReadState.deleteMany({});
    await Channel.deleteMany({});
    await Server.deleteMany({});
    await Role.deleteMany({});
    await User.deleteMany({});
    await ServerMember.deleteMany({});
    vi.clearAllMocks();
  });

  describe('createDmChannel', () => {
    it('should broadcast DM_CHANNEL_CREATE event to the recipient when a new DM channel is created', async () => {
      const user1 = await User.create({ email: 'user1@test.com', username: 'user1', password: 'password' });
      const user2 = await User.create({ email: 'user2@test.com', username: 'user2', password: 'password' });

      const newChannel = await channelService.createDmChannel(user1._id.toString(), user2._id.toString());

      expect(socketManager.broadcastToUser).toHaveBeenCalledOnce();
      expect(socketManager.broadcastToUser).toHaveBeenCalledWith(
        user2._id.toString(),
        'DM_CHANNEL_CREATE',
        expect.objectContaining({
          _id: newChannel._id,
          type: 'DM',
          recipients: expect.arrayContaining([
            expect.objectContaining({ username: 'user1' }),
            expect.objectContaining({ username: 'user2' }),
          ]),
        })
      );
    });

    it('should not broadcast an event if the DM channel already exists', async () => {
        const user1 = await User.create({ email: 'user1@test.com', username: 'user1', password: 'password' });
        const user2 = await User.create({ email: 'user2@test.com', username: 'user2', password: 'password' });

        await channelService.createDmChannel(user1._id.toString(), user2._id.toString());
        vi.clearAllMocks();

        await channelService.createDmChannel(user1._id.toString(), user2._id.toString());

        expect(socketManager.broadcastToUser).not.toHaveBeenCalled();
    });
  });

  describe('getDmChannelsByUser', () => {
    it('should correctly attach lastMessage and lastReadMessageId', async () => {
      const user1 = await User.create({ email: 'user1@test.com', username: 'user1', password: 'password' });
      const user2 = await User.create({ email: 'user2@test.com', username: 'user2', password: 'password' });

      const dmChannel1 = await channelService.createDmChannel(user1._id.toString(), user2._id.toString());
      const msg1 = await Message.create({ channelId: dmChannel1._id, authorId: user2._id, content: 'Hello' });
      await new Promise(r => setTimeout(r, 10));
      const msg2 = await Message.create({ channelId: dmChannel1._id, authorId: user2._id, content: 'World' });
      await ChannelReadState.create({ userId: user1._id, channelId: dmChannel1._id, lastReadMessageId: msg1._id });

      const user3 = await User.create({ email: 'user3@test.com', username: 'user3', password: 'password' });
      const dmChannel2 = await channelService.createDmChannel(user1._id.toString(), user3._id.toString());
      await Message.create({ channelId: dmChannel2._id, authorId: user3._id, content: 'Greetings' });

      await channelService.createDmChannel(user1._id.toString(), (await User.create({ email: 'user4@test.com', username: 'user4', password: 'password' }))._id.toString());

      const channels = await channelService.getDmChannelsByUser(user1._id.toString());

      const ch1Result = channels.find(c => c._id.equals(dmChannel1._id));
      const ch2Result = channels.find(c => c._id.equals(dmChannel2._id));

      expect(ch1Result).toBeDefined();
      expect(ch1Result.lastMessage).toBeDefined();
      expect(ch1Result.lastMessage._id.toString()).toBe(msg2._id.toString());
      expect(ch1Result.lastReadMessageId.toString()).toBe(msg1._id.toString());

      expect(ch2Result).toBeDefined();
      expect(ch2Result.lastMessage).toBeDefined();
      expect(ch2Result.lastReadMessageId).toBeNull();
    });
  });

  describe('getChannelsByServer', () => {
    it('should correctly attach lastMessage for server channels', async () => {
      const user = await User.create({ email: 'user@test.com', username: 'user', password: 'password' });
      const server = await Server.create({ name: 'Test Server' });
      const everyoneRole = await Role.create({ name: '@everyone', permissions: ['VIEW_CHANNEL'], serverId: server._id, position: 0 });
      server.everyoneRoleId = everyoneRole._id;
      await server.save();

      await ServerMember.create({ serverId: server._id, userId: user._id, roleIds: [everyoneRole._id] });

      const channel = await Channel.create({ serverId: server._id, name: 'general', type: 'GUILD_TEXT' });

      await Message.create({ channelId: channel._id, authorId: user._id, content: 'First' });
      await new Promise(r => setTimeout(r, 10));
      const msg2 = await Message.create({ channelId: channel._id, authorId: user._id, content: 'Second' });

      const channels = await channelService.getChannelsByServer(server._id.toString(), user._id.toString());

      expect(channels).toHaveLength(1);
      expect(channels[0].lastMessage).toBeDefined();
      expect(channels[0].lastMessage._id.toString()).toBe(msg2._id.toString());
    });

    it('should only return channels the user has VIEW_CHANNEL permission for and attach permissions', async () => {
      const owner = await User.create({ email: 'owner@test.com', username: 'owner', password: 'password' });
      const member = await User.create({ email: 'member@test.com', username: 'member', password: 'password' });
      const server = await Server.create({ name: 'Test Server' });
      const everyoneRole = await Role.create({ name: '@everyone', serverId: server._id, permissions: [], position: 0 });
      server.everyoneRoleId = everyoneRole._id;
      await server.save();

      await ServerMember.create({ serverId: server._id, userId: owner._id, isOwner: true, roleIds: [everyoneRole._id] });
      await ServerMember.create({ serverId: server._id, userId: member._id, roleIds: [everyoneRole._id] });

      const publicChannel = await Channel.create({ serverId: server._id, name: 'public', type: 'GUILD_TEXT', permissionOverrides: [
        { targetType: 'role', targetId: everyoneRole._id, allow: ['VIEW_CHANNEL', 'SEND_MESSAGES'], deny: [] }
      ]});
      const privateChannel = await Channel.create({ serverId: server._id, name: 'private', type: 'GUILD_TEXT', permissionOverrides: [
        { targetType: 'role', targetId: everyoneRole._id, allow: [], deny: ['VIEW_CHANNEL'] }
      ]});

      const memberChannels = await channelService.getChannelsByServer(server._id.toString(), member._id.toString());

      expect(memberChannels).toHaveLength(1);
      expect(memberChannels[0].name).toBe('public');
      expect(memberChannels[0].permissions).toBeDefined();
      expect(memberChannels[0].permissions).toEqual(expect.arrayContaining(['VIEW_CHANNEL', 'SEND_MESSAGES']));

      const ownerChannels = await channelService.getChannelsByServer(server._id.toString(), owner._id.toString());

      expect(ownerChannels).toHaveLength(2);
    });
  });
});