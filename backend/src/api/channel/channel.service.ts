import Channel, { IChannel } from '../../models/Channel';
import Server from '../../models/Server';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

export const createChannel = async (data: Partial<IChannel>, userId: string) => {
  const { serverId } = data;
  if (!serverId) {
    throw new Error('Server ID is required to create a channel');
  }

  const server = await Server.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to create a channel in this server');
  }

  const channel = new Channel(data);
  await channel.save();
  return channel;
};
