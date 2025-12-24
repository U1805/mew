import bcrypt from 'bcryptjs';
import { NotFoundError, UnauthorizedError, BadRequestError, ConflictError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';
import { userRepository } from './user.repository';
import BotModel from '../bot/bot.model';

const userService = {
  async getMe(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const userObject = user.toObject();
    if (userObject.avatarUrl) {
        userObject.avatarUrl = getS3PublicUrl(userObject.avatarUrl);
    }
    return userObject;
  },

  async searchUsers(query: string, currentUserId: string) {
    const users = await userRepository.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: currentUserId },
    }, '_id username avatarUrl isBot', 10);

    const botUserIds = users.filter((u: any) => (u as any).isBot).map((u) => u._id);
    const botDmEnabledByUserId = new Map<string, boolean>();
    if (botUserIds.length > 0) {
      const bots = await BotModel.find({ botUserId: { $in: botUserIds } })
        .select('botUserId dmEnabled')
        .lean();
      bots.forEach((b: any) => botDmEnabledByUserId.set(b.botUserId.toString(), !!b.dmEnabled));
    }

    return users
      .map((u) => {
        const userObject = u.toObject() as any;
        if (userObject.avatarUrl) {
          userObject.avatarUrl = getS3PublicUrl(userObject.avatarUrl);
        }
        const { _id, username, avatarUrl, isBot } = userObject;
        if (isBot) {
          const dmEnabled = botDmEnabledByUserId.get(_id.toString()) === true;
          return { _id, username, avatarUrl, isBot, dmEnabled };
        }
        return { _id, username, avatarUrl, isBot: false };
      })
      .filter((u: any) => !u.isBot || u.dmEnabled === true);
  },

  async getUserById(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    // Manually select fields because repository returns the full document
    const userObject = user.toObject();
    if (userObject.avatarUrl) {
        userObject.avatarUrl = getS3PublicUrl(userObject.avatarUrl);
    }
    const { _id, username, avatarUrl, isBot, createdAt } = userObject;
    if (isBot) {
      const bot = await BotModel.findOne({ botUserId: _id }).select('dmEnabled').lean();
      return { _id, username, avatarUrl, isBot, createdAt, dmEnabled: bot?.dmEnabled === true };
    }
    return { _id, username, avatarUrl, isBot, createdAt };
  },

  async updateMe(userId: string, updateData: { username?: string; avatarUrl?: string }) {
    try {
      const user = await userRepository.updateById(userId, updateData);
      if (!user) {
        throw new NotFoundError('User not found');
      }
      const userObject = user.toObject();
      if (userObject.avatarUrl) {
          userObject.avatarUrl = getS3PublicUrl(userObject.avatarUrl);
      }
      return userObject;
    } catch (error: any) {
      if (error.name === 'MongoServerError' && error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new ConflictError(`${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`);
      }
      throw error;
    }
  },

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!oldPassword || !newPassword) {
      throw new BadRequestError('Old and new passwords are required');
    }

    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password || '');
    if (!isMatch) {
      throw new UnauthorizedError('Invalid old password');
    }

    if (oldPassword === newPassword) {
      throw new BadRequestError('New password cannot be the same as the old password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await userRepository.updateById(userId, { password: hashedPassword });
  },
};

export default userService;
