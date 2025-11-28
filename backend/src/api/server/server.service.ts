import Server from './server.model';
import Channel from '../channel/channel.model';
import Message from '../message/message.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { broadcastEvent } from '../../gateway/events';

interface CreateServerData {
  name: string;
  avatarUrl?: string;
  ownerId: string;
}

export const createServer = async (data: CreateServerData) => {
  const server = new Server(data);
  await server.save();
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
  const servers = await Server.find({ ownerId: userId });
  return servers;
};

interface UpdateServerData {
  name?: string;
  avatarUrl?: string;
}

export const updateServer = async (
  serverId: string,
  userId: string,
  data: UpdateServerData
) => {
  const server = await getServerById(serverId);

  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You are not the owner of this server');
  }

  Object.assign(server, data);
  await server.save();

  broadcastEvent(serverId, 'SERVER_UPDATE', server);

  return server;
};

export const deleteServer = async (serverId: string, userId: string) => {
  const server = await getServerById(serverId);

  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You are not the owner of this server');
  }

  // Cascade delete channels and messages
  const channels = await Channel.find({ serverId });
  const channelIds = channels.map((c) => c._id);

  await Message.deleteMany({ channelId: { $in: channelIds } });
  await Channel.deleteMany({ serverId });
  await server.deleteOne();

  broadcastEvent(serverId, 'SERVER_DELETE', { serverId });

  return { message: 'Server deleted successfully' };
};
