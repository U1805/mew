import Channel from './channel.model';
import ServerMember from '../member/member.model';
import { ChannelReadState } from './readState.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

const readStateService = {
  async ackChannel(userId: string, channelId: string, lastMessageId: string): Promise<void> {
    const channel = await Channel.findById(channelId);
    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    if (channel.type === 'DM') {
      if (!channel.recipients || !channel.recipients.map(id => id.toString()).includes(userId)) {
        throw new ForbiddenError('You do not have access to this DM channel.');
      }
    } else if (channel.type === 'GUILD_TEXT') {
      const member = await ServerMember.findOne({ serverId: channel.serverId, userId });
      if (!member) {
        throw new ForbiddenError('You are not a member of this server.');
      }
    }

    await ChannelReadState.updateOne(
      { userId, channelId },
      { $set: { lastReadMessageId: lastMessageId } },
      { upsert: true }
    );
  },
};

export default readStateService;
