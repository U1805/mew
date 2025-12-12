import mongoose from 'mongoose';
import Channel, { IChannel } from './channel.model';
import { ChannelReadState } from './readState.model';
import { DM_PERMISSIONS } from '../../constants/permissions';

class ChannelRepository {
  async findVisibleChannelsForUser(serverId: string, userId: string): Promise<any[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const serverObjectId = new mongoose.Types.ObjectId(serverId);

    const channels = await Channel.aggregate([
      { $match: { serverId: serverObjectId, type: 'GUILD_TEXT' } },
      {
        $lookup: {
          from: 'messages',
          let: { channelId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$channelId', '$$channelId'] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'lastMessageArr',
        },
      },
      {
        $lookup: {
          from: ChannelReadState.collection.name,
          let: { channelId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$channelId', '$$channelId'] },
                    { $eq: ['$userId', userObjectId] },
                  ],
                },
              },
            },
            { $project: { lastReadMessageId: 1, _id: 0 } },
          ],
          as: 'readState',
        },
      },
      {
        $addFields: {
          lastMessage: { $ifNull: [{ $first: '$lastMessageArr' }, null] },
          lastReadMessageId: { $ifNull: [{ $first: '$readState.lastReadMessageId' }, null] },
        },
      },
      { $project: { readState: 0, lastMessageArr: 0 } },
      { $sort: { position: 1 } },
    ]);

    return channels;
  }

  async create(channelData: Omit<IChannel, 'createdAt' | 'updatedAt'>): Promise<IChannel> {
    return await Channel.create(channelData);
  }

  async findById(channelId: string): Promise<IChannel | null> {
    return await Channel.findById(channelId);
  }

  async findByIdWithOverrides(channelId: string): Promise<IChannel | null> {
    return await Channel.findById(channelId).select('permissionOverrides');
  }

  async findOne(filter: Record<string, any>): Promise<IChannel | null> {
    return await Channel.findOne(filter);
  }

  async save(channel: IChannel): Promise<IChannel> {
    return await channel.save();
  }

  async deleteById(channelId: string): Promise<IChannel | null> {
    return await Channel.findByIdAndDelete(channelId);
  }

  async findDmChannel(userId: string, recipientId: string): Promise<IChannel | null> {
    return await Channel.findOne({ type: 'DM', recipients: { $all: [userId, recipientId], $size: 2 } });
  }

  async createDmChannel(userId: string, recipientId: string): Promise<IChannel> {
    return await Channel.create({ type: 'DM', recipients: [ new mongoose.Types.ObjectId(userId), new mongoose.Types.ObjectId(recipientId) ] });
  }

  async findDmChannelsByUser(userId: string): Promise<any[]> {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const channels = await Channel.aggregate([
      { $match: { type: 'DM', recipients: userObjectId } },
      { $lookup: { from: 'users', localField: 'recipients', foreignField: '_id', as: 'recipientsInfo' } },
      { $addFields: { recipients: '$recipientsInfo' } },
      { $lookup: { from: 'messages', localField: '_id', foreignField: 'channelId', as: 'lastMessageArr' } },
      { $lookup: { from: ChannelReadState.collection.name, let: { channelId: '$_id' }, pipeline: [ { $match: { $expr: { $and: [ { $eq: ['$channelId', '$$channelId'] }, { $eq: ['$userId', userObjectId] } ] } } }, { $project: { lastReadMessageId: 1, _id: 0 } } ], as: 'readState' } },
      { $addFields: { lastReadMessageId: { $ifNull: [{ $first: '$readState.lastReadMessageId' }, null] } } },
      { $project: { recipientsInfo: 0, readState: 0 } }
    ]);

    channels.forEach(channel => {
      if (channel.lastMessageArr && channel.lastMessageArr.length > 0) {
        channel.lastMessageArr.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
        channel.lastMessage = channel.lastMessageArr[0];
      } else {
        channel.lastMessage = null;
      }
      delete channel.lastMessageArr;

      channel.permissions = DM_PERMISSIONS;
    });

    return channels;
  }
}

export const channelRepository = new ChannelRepository();
