import mongoose from 'mongoose';
import Channel, { IChannel, IChannelUpdate } from './channel.model';
import Server from '../server/server.model';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';


export const createChannel = async (
  channelData: Omit<IChannel, 'createdAt' | 'updatedAt'>
): Promise<IChannel> => {
  const newChannel = await Channel.create(channelData);
  return newChannel;
};

export const getChannelById = async (
  channelId: string
): Promise<IChannel | null> => {
  const channel = await Channel.findById(channelId);
  return channel;
};

export const updateChannel = async (
  channelId: string,
  channelData: IChannelUpdate
): Promise<IChannel | null> => {
  const updatedChannel = await Channel.findByIdAndUpdate(
    channelId,
    channelData,
    { new: true }
  );
  return updatedChannel;
};

import Message from '../message/message.model';

export const deleteChannel = async (
  channelId: string
): Promise<IChannel | null> => {
  // First, delete all messages in the channel
  await Message.deleteMany({ channelId });

  // Then, delete the channel itself
  const deletedChannel = await Channel.findByIdAndDelete(channelId);
  return deletedChannel;
};

export const getChannelsByServer = async (serverId: string, userId: string): Promise<IChannel[]> => {
  const server = await Server.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to view these channels');
  }

  const channels = await Channel.find({ serverId });
  return channels;
};


export const createDmChannel = async (userId: string, recipientId: string): Promise<IChannel> => {
  if (userId === recipientId) {
    throw new BadRequestError('You cannot create a DM with yourself');
  }
  // Check if a DM channel already exists between the two users
  let channel = await Channel.findOne({
    type: 'DM',
    recipients: { $all: [userId, recipientId], $size: 2 },
  });

  if (channel) {
    return channel;
  }

  // If not, create a new one.
  const newDmChannel = await Channel.create({
    type: 'DM',
    recipients: [
      new mongoose.Types.ObjectId(userId),
      new mongoose.Types.ObjectId(recipientId),
    ],
  });

  return newDmChannel;
};