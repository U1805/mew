import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { IUser } from '../user/user.model';
import config from '../../config';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../utils/errors';
import { userRepository } from '../user/user.repository';
import { getS3PublicUrl } from '../../utils/s3';
import * as botRepository from '../bot/bot.repository';
import { ensureBotUserExists } from '../bot/bot.service';

export const signAccessToken = (payload: { id: any; username: string; discriminator?: string }) =>
  jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

export const login = async (loginData: Pick<IUser, 'email' | 'password'>) => {
  const { email, password } = loginData;

  if (!password) {
    throw new BadRequestError('Password is required');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepository.findByEmailWithPassword(normalizedEmail);
  if (!user) throw new UnauthorizedError('Invalid credentials');
  if ((user as any).isBot) throw new UnauthorizedError('Invalid credentials');

  const isMatch = await bcrypt.compare(password, user.password || '');
  if (!isMatch) throw new UnauthorizedError('Invalid credentials');

  // Ensure discriminator exists for legacy users (lazy-migration).
  if (!(user as any).discriminator) {
    (user as any).discriminator = undefined;
    await user.save();
  }

  const payload = { id: user._id, username: user.username, discriminator: (user as any).discriminator };
  const token = signAccessToken(payload);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _, ...userWithoutPassword } = user.toObject();
  if (userWithoutPassword.avatarUrl) {
    userWithoutPassword.avatarUrl = getS3PublicUrl(userWithoutPassword.avatarUrl);
  }

  return { user: userWithoutPassword, token };
};

export const loginBot = async (data: { accessToken?: string }) => {
  const accessToken = (data?.accessToken || '').trim();
  if (!accessToken) {
    throw new BadRequestError('accessToken is required');
  }

  const bot = await botRepository.findByAccessToken(accessToken);
  if (!bot) {
    throw new UnauthorizedError('Invalid bot token');
  }

  await ensureBotUserExists(bot);
  if (!bot.botUserId) {
    throw new UnauthorizedError('Bot user not found');
  }

  const user = await userRepository.findById(bot.botUserId.toString());
  if (!user) {
    throw new UnauthorizedError('Bot user not found');
  }

  // Ensure discriminator exists for legacy users (lazy-migration).
  if (!(user as any).discriminator) {
    (user as any).discriminator = undefined;
    await (user as any).save();
  }

  const payload = { id: user._id, username: user.username, discriminator: (user as any).discriminator };
  const token = signAccessToken(payload);

  const userObj: any = user.toObject ? user.toObject() : user;
  if (userObj.avatarUrl) {
    userObj.avatarUrl = getS3PublicUrl(userObj.avatarUrl);
  }

  return { user: userObj, token };
};

export const register = async (userData: Partial<IUser>) => {
  const { email, username, password } = userData;

  if (!password) {
    throw new BadRequestError('Password is required');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await userRepository.create({
      email: email?.trim().toLowerCase(),
      username: username?.trim(),
      // discriminator is auto-assigned in User model pre-validate hook
      password: hashedPassword,
      isBot: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = newUser.toObject();

    const payload = { id: newUser._id, username: newUser.username, discriminator: (newUser as any).discriminator };
    const token = signAccessToken(payload);

    if (userWithoutPassword.avatarUrl) {
      userWithoutPassword.avatarUrl = getS3PublicUrl(userWithoutPassword.avatarUrl);
    }

    return { user: userWithoutPassword, token };
  } catch (error: any) {
    if (error.name === 'MongoServerError' && error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      throw new ConflictError(`${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`);
    }
    throw error;
  }
};
