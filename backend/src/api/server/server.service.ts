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
    const { ownerId, ...serverData } = data;
    const server = new Server(serverData);

    // 1. 创建默认的 @everyone 角色 (位置 0)
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

    // 2. [新增] 创建 Owner 角色 (位置 1，拥有管理员权限)
    const ownerRole = new Role({
      name: 'Owner',
      serverId: server._id,
      position: 1, // 必须比 everyone 高
      isDefault: false,
      color: '#E74C3C', // 红色，使其显眼
      permissions: ['ADMINISTRATOR'],
    });

    // 3. 创建成员记录，同时分配 everyone 和 owner 角色
    const ownerMember = new ServerMember({
      serverId: server._id,
      userId: ownerId,
      isOwner: true,
      roleIds: [everyoneRole._id, ownerRole._id], // 这里加入 ownerRole._id
    });

    // 4. 保存所有文档
    await server.save();
    await everyoneRole.save();
    await ownerRole.save(); // 别忘了保存 ownerRole
    await ownerMember.save();

    return server;
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
    const servers = memberships
      .map((m: any) => m.serverId)
      .filter((s) => s !== null);
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
    const server = await this.getServerById(serverId);
    if (!server) throw new NotFoundError('Server not found');

    const channels = await Channel.find({ serverId: serverId as any });
    const channelIds = channels.map((c) => c._id);

    if (channelIds.length > 0) {
      await Message.deleteMany({ channelId: { $in: channelIds } });
    }

    await Channel.deleteMany({ serverId: serverId as any });
    await ServerMember.deleteMany({ serverId: serverId as any });
    await Role.deleteMany({ serverId: serverId as any });
    await Server.deleteOne({ _id: serverId as any });

    socketManager.broadcast('SERVER_DELETE', serverId, { serverId });
    return { message: 'Server deleted successfully' };
  },
};

export default serverService;
