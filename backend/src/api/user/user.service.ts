import { NotFoundError } from '../../utils/errors';
import { userRepository } from './user.repository';

const userService = {
  async getMe(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
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
    const { _id, username, avatarUrl, isBot, createdAt } = user;
    return { _id, username, avatarUrl, isBot, createdAt };
  },
};

export default userService;
