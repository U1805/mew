import Server from '../../models/Server';
import { NotFoundError } from '../../utils/errors';

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
