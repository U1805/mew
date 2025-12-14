import bcrypt from 'bcryptjs';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../../utils/errors';
import { getS3PublicUrl } from '../../utils/s3';
import { userRepository } from './user.repository';

const userService = {
  async getMe(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
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
    }, '_id username avatarUrl', 10);
    return users;
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
    return { _id, username, avatarUrl, isBot, createdAt };
  },

  async updateMe(userId: string, updateData: { username?: string; avatarUrl?: string }) {
    const user = await userRepository.updateById(userId, updateData);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const userObject = user.toObject();
    if (userObject.avatarUrl) {
        userObject.avatarUrl = getS3PublicUrl(userObject.avatarUrl);
    }
    return userObject;
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
