import mongoose from 'mongoose';
import Server from './server.model';
import Channel from '../channel/channel.model';
import Message from '../message/message.model';
import { NotFoundError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';
import ServerMember from '../member/member.model';
import Role from '../role/role.model';

interface CreateServerData {
  name: string;
  avatarUrl?: string;
  ownerId: string;
}

const serverService = {
  async createServer(data: CreateServerData) {
    const a = 1;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { ownerId, ...serverData } = data;
      const server = new Server(serverData);

      const everyoneRole = new Role({
        name: '@everyone',
        serverId: server._id,
        position: 0,
        isDefault: true,
        permissions: [
          'CREATE_INVITE',
          'VIEW_CHANNEL',
          'SEND_MESSAGES',
          'ADD_REACTIONS',
          'ATTACH_FILES',
        ],
      });

      server.everyoneRoleId = everyoneRole._id;

      const ownerMember = new ServerMember({
        serverId: server._id,
        userId: ownerId,
        isOwner: true,
        roleIds: [everyoneRole._id],
      });

      await server.save({ session });
      await everyoneRole.save({ session });
      await ownerMember.save({ session });

      await session.commitTransaction();
      return server;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },

  async getServerById(serverId: string) {
    const server = await Server.findById(serverId);
    if (!server) {
      throw new NotFoundError('Server not found');
    }
    return server;
  },

  async getServersForUser(userId: string) {
    const memberships = await ServerMember.find({ userId }).populate('serverId');
    const servers = memberships.map((m: any) => m.serverId);
    return servers;
  },

  async updateServer(serverId: string, data: Partial<CreateServerData>) {
    const server = await this.getServerById(serverId);
    Object.assign(server, data);
    await server.save();
    socketManager.broadcast('SERVER_UPDATE', serverId, server);
    return server;
  },

  async deleteServer(serverId: string) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const server = await this.getServerById(serverId);
      if (!server) throw new NotFoundError('Server not found');

      const channels = await Channel.find({ serverId: serverId as any }).session(session);
      const channelIds = channels.map((c) => c._id);

      if (channelIds.length > 0) {
        await Message.deleteMany({ channelId: { $in: channelIds } }).session(session);
      }

      await Channel.deleteMany({ serverId: serverId as any }).session(session);
      await ServerMember.deleteMany({ serverId: serverId as any }).session(session);
      await Role.deleteMany({ serverId: serverId as any }).session(session);
      await Server.deleteOne({ _id: serverId as any }).session(session);

      await session.commitTransaction();

      socketManager.broadcast('SERVER_DELETE', serverId, { serverId });
      return { message: 'Server deleted successfully' };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },
};

export default serverService;
