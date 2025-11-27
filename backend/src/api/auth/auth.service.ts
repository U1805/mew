import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../../models/User';
import config from '../../config';

export const login = async (loginData: Pick<IUser, 'email' | 'password'>) => {
  const { email, password } = loginData;

  if (!password) {
    throw new Error('Password is required');
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, user.password || '');
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const payload = { id: user.id, username: user.username };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1d' });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user.toObject();

  return { user: userWithoutPassword, token };
};

export const register = async (userData: Partial<IUser>) => {
  const { email, username, password } = userData;

  if (!password) {
    throw new Error('Password is required');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = new User({
    email,
    username,
    password: hashedPassword,
  });

  await newUser.save();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = newUser.toObject();

  return userWithoutPassword;
};