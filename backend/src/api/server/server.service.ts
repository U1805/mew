import Server from '../../models/Server';

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
