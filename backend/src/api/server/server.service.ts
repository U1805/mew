import Server from './server.model';
import Channel from '../channel/channel.model';
import Message from '../message/message.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';

import ServerMember from '../member/member.model';

interface CreateServerData {
  name: string;
  avatarUrl?: string;
  ownerId: string;
}

export const createServer = async (data: CreateServerData) => {
  const { ownerId, ...serverData } = data;
  const server = new Server(serverData);
  await server.save();

  // Create the owner as the first member
  await ServerMember.create({
    serverId: server._id,
    userId: ownerId,
    role: 'OWNER',
  });

  return server;
};

export const getServerById = async (serverId: string) => {
  const server = await Server.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }
  return server;
};

export const getServersForUser = async (userId: string) => {
  const memberships = await ServerMember.find({ userId }).populate('serverId');
  const servers = memberships.map((m) => m.serverId);
  return servers;
};

interface UpdateServerData {
  name?: string;
  avatarUrl?: string;
}

export const updateServer = async (
  serverId: string,
  data: UpdateServerData
) => {
  const server = await getServerById(serverId);

  // Permission is handled by middleware

  Object.assign(server, data);
  await server.save();

  socketManager.broadcast('SERVER_UPDATE', serverId, server);

  return server;
};

export const deleteServer = async (serverId: string) => {
  // Permission is handled by middleware

  // First, ensure server exists before we attempt to delete related data
  await getServerById(serverId);

  // Cascade delete channels and messages
  const channels = await Channel.find({ serverId });
  const channelIds = channels.map((c) => c._id);

  await Message.deleteMany({ channelId: { $in: channelIds } });
  await Channel.deleteMany({ serverId });
  // Cascade delete server members
  await ServerMember.deleteMany({ serverId });

  // Finally, delete the server itself
  await Server.deleteOne({ _id: serverId });

  socketManager.broadcast('SERVER_DELETE', serverId, { serverId });

  return { message: 'Server deleted successfully' };
};
