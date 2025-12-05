import { NotFoundError } from '../../utils/errors';
import User from './user.model';

export const getMe = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

export const searchUsers = async (query: string, currentUserId: string) => {
  const users = await User.find({
    username: { $regex: query, $options: 'i' }, // 'i' 表示不区分大小写
    _id: { $ne: currentUserId } // 排除当前用户
  }).limit(10).select('_id username avatarUrl'); // 只选择必要字段
  return users;
};

export const getUserById = async (userId: string) => {
  const user = await User.findById(userId)
    .select('_id username avatarUrl isBot createdAt');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
};