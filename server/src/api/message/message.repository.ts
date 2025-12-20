import Message, { IMessage } from './message.model';

class MessageRepository {
  async findByChannel(options: { channelId: string; limit: number; before?: string }) {
    const { channelId, limit, before } = options;
    const query: any = { channelId };

    if (before) {
      query._id = { $lt: before };
    }

    return Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('authorId', 'username avatarUrl isBot')
      .lean();
  }

  async findById(id: string): Promise<IMessage | null> {
    return Message.findById(id);
  }

  create(data: Partial<IMessage>): IMessage {
    return new Message(data);
  }

  async save(message: IMessage): Promise<IMessage> {
    return message.save();
  }

  async addReaction(messageId: string, userId: string, emoji: string, existingReactionEmoji?: string): Promise<IMessage | null> {
    if (existingReactionEmoji) {
      await Message.updateOne(
        { _id: messageId, 'reactions.emoji': existingReactionEmoji },
        { $pull: { 'reactions.$.userIds': userId } }
      );
    }

    let updatedMessage = await Message.findOneAndUpdate(
      { _id: messageId, 'reactions.emoji': emoji },
      { $addToSet: { 'reactions.$.userIds': userId } },
      { new: true }
    );

    if (!updatedMessage) {
      updatedMessage = await Message.findOneAndUpdate(
        { _id: messageId },
        { $push: { reactions: { emoji, userIds: [userId] } } },
        { new: true }
      );
    }

    const finalMessage = await Message.findOneAndUpdate(
      { _id: messageId },
      { $pull: { reactions: { userIds: { $size: 0 } } } },
      { new: true }
    ).populate('authorId', 'username avatarUrl isBot');

    return finalMessage;
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<IMessage | null> {
    const updatedMessage = await Message.findOneAndUpdate(
      { _id: messageId, 'reactions.emoji': emoji },
      { $pull: { 'reactions.$.userIds': userId } },
      { new: true }
    );

    if (!updatedMessage) {
      return null;
    }

    return Message.findOneAndUpdate(
      { _id: messageId },
      { $pull: { reactions: { userIds: { $size: 0 } } } },
      { new: true }
    ).populate('authorId', 'username avatarUrl isBot');
  }
}

export const messageRepository = new MessageRepository();
