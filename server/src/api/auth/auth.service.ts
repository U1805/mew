import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { IUser } from '../user/user.model';
import config from '../../config';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../utils/errors';
import { userRepository } from '../user/user.repository';

export const login = async (loginData: Pick<IUser, 'email' | 'password'>) => {
  const { email, password } = loginData;

  if (!password) {
    throw new BadRequestError('Password is required');
  }

  const user = await userRepository.findByEmailWithPassword(email);
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const isMatch = await bcrypt.compare(password, user.password || '');
  if (!isMatch) throw new UnauthorizedError('Invalid credentials');

  const payload = { id: user._id, username: user.username };
  const token = jwt.sign(payload, config.jwtSecret);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user.toObject();

  return { user: userWithoutPassword, token };
};

export const register = async (userData: Partial<IUser>) => {
  const { email, username, password } = userData;

  if (!password) {
    throw new BadRequestError('Password is required');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await userRepository.create({
      email,
      username,
      password: hashedPassword,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = newUser.toObject();

    return userWithoutPassword;
  } catch (error: any) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      throw new ConflictError(`${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`);
    }
    throw error;
  }
};
