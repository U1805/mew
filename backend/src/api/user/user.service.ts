import { NotFoundError } from '../../utils/errors';
import User from './user.model';

const userService = {
  async getMe(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  },

  async searchUsers(query: string, currentUserId: string) {
    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: currentUserId },
    }).limit(10).select('_id username avatarUrl');
    return users;
  },

  async getUserById(userId: string) {
    const user = await User.findById(userId).select('_id username avatarUrl isBot createdAt');
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  },
};

export default userService;
