import bcrypt from 'bcryptjs';
import { NotFoundError, UnauthorizedError, BadRequestError, ConflictError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';
import { userRepository } from './user.repository';
import BotModel from '../bot/bot.model';
import UserModel from './user.model';
import { Types } from 'mongoose';
import { UserChannelNotificationSetting } from '../channel/channelNotificationSetting.model';

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

  async getMyNotificationSettings(userId: string) {
    const user = await UserModel.findById(userId).select('notificationSettings').lean();
    if (!user) throw new NotFoundError('User not found');

    const settings = (user as any).notificationSettings || {};
    return {
      soundEnabled: settings.soundEnabled ?? true,
      soundVolume: typeof settings.soundVolume === 'number' ? settings.soundVolume : 0.6,
      desktopEnabled: settings.desktopEnabled ?? false,
    };
  },

  async updateMyNotificationSettings(
    userId: string,
    update: Partial<{ soundEnabled: boolean; soundVolume: number; desktopEnabled: boolean }>
  ) {
    const user = await UserModel.findById(userId).select('notificationSettings');
    if (!user) throw new NotFoundError('User not found');

    const current = (user as any).notificationSettings || {};
    const next = {
      soundEnabled: typeof update.soundEnabled === 'boolean' ? update.soundEnabled : (current.soundEnabled ?? true),
      soundVolume: typeof update.soundVolume === 'number' ? update.soundVolume : (typeof current.soundVolume === 'number' ? current.soundVolume : 0.6),
      desktopEnabled: typeof update.desktopEnabled === 'boolean' ? update.desktopEnabled : (current.desktopEnabled ?? false),
    };

    (user as any).notificationSettings = next;
    await user.save();

    return next;
  },

  async listMyChannelNotificationSettings(userId: string) {
    const rows = await UserChannelNotificationSetting.find({ userId: new Types.ObjectId(userId) })
      .select('channelId level')
      .sort({ updatedAt: -1 })
      .lean();
    return rows.map((r: any) => ({
      channelId: String(r.channelId),
      level: r.level,
    }));
  },

  async searchUsers(query: string, currentUserId: string) {
    const users = await userRepository.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: currentUserId },
    }, '_id username discriminator avatarUrl isBot', 10);

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
          return { _id, username, discriminator: userObject.discriminator, avatarUrl, isBot, dmEnabled };
        }
        return { _id, username, discriminator: userObject.discriminator, avatarUrl, isBot: false };
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
      return { _id, username, discriminator: userObject.discriminator, avatarUrl, isBot, createdAt, dmEnabled: bot?.dmEnabled === true };
    }
    return { _id, username, discriminator: userObject.discriminator, avatarUrl, isBot, createdAt };
  },

  async updateMe(userId: string, updateData: { username?: string; avatarUrl?: string }) {
    try {
      const user = await UserModel.findById(userId).select('username discriminator avatarUrl isBot email createdAt updatedAt notificationSettings');
      if (!user) throw new NotFoundError('User not found');

      if (typeof updateData.username === 'string' && updateData.username.trim()) {
        const nextUsername = updateData.username.trim();
        if (user.username !== nextUsername) {
          user.username = nextUsername;
          // Keep discriminator if possible; on conflict, clear and let the User model auto-assign a new one.
          try {
            await user.save();
          } catch (error: any) {
            if (error?.name === 'MongoServerError' && error?.code === 11000) {
              (user as any).discriminator = undefined;
              await user.save();
            } else if (error?.message === 'DISCRIMINATOR_EXHAUSTED') {
              throw new ConflictError('Username is unavailable.');
            } else {
              throw error;
            }
          }
        }
      }

      if (typeof updateData.avatarUrl === 'string' && updateData.avatarUrl) {
        user.avatarUrl = updateData.avatarUrl;
      }

      await user.save();

      const userObject: any = user.toObject();
      if (userObject.avatarUrl) userObject.avatarUrl = getS3PublicUrl(userObject.avatarUrl);
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
