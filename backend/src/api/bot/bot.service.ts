import { nanoid } from 'nanoid';
import * as botRepository from './bot.repository';
import { IBot } from './bot.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { uploadFile, getS3PublicUrl } from '../../utils/s3';

const generateAccessToken = () => nanoid(32);

export const createBot = async (
  ownerId: string,
  botData: Partial<IBot>,
  avatarFile?: Express.Multer.File
): Promise<IBot> => {
  const accessToken = generateAccessToken();
  let avatarUrl: string | undefined;

  if (avatarFile) {
    const { key } = await uploadFile(avatarFile);
    avatarUrl = getS3PublicUrl(key);
  }

  const newBot = await botRepository.create({
    ...botData,
    ownerId: ownerId as any,
    accessToken,
    avatarUrl,
  });

  // For the create operation ONLY, return the full object with the token.
  // Subsequent fetches (e.g., getBotById) will correctly omit it.
  const botObject = newBot.toObject();
  botObject.accessToken = newBot.accessToken;
  return botObject;
};

export const getBotsByOwner = async (ownerId: string): Promise<IBot[]> => {
  return botRepository.findByOwnerId(ownerId);
};

export const getBotById = async (
  botId: string,
  ownerId: string
): Promise<IBot> => {
  const bot = await botRepository.findById(botId, ownerId);
  if (!bot) {
    throw new NotFoundError('Bot not found or you do not have permission to view it.');
  }
  return bot;
};

export const updateBot = async (
  botId: string,
  ownerId: string,
  updateData: Partial<IBot>,
  avatarFile?: Express.Multer.File
): Promise<IBot> => {
  const bot = await getBotById(botId, ownerId);

  let avatarUrl: string | undefined;
  if (avatarFile) {
    const { key } = await uploadFile(avatarFile);
    avatarUrl = getS3PublicUrl(key);
  }

  const finalUpdateData = { ...updateData };
  if (avatarUrl) {
    finalUpdateData.avatarUrl = avatarUrl;
  }

  // Disallow direct update of accessToken
  delete finalUpdateData.accessToken;

  const updatedBot = await botRepository.updateById(botId, ownerId, finalUpdateData);
  if (!updatedBot) {
    throw new NotFoundError('Bot not found.'); // Should not happen due to getBotById check
  }

  return updatedBot;
};

export const deleteBot = async (
  botId: string,
  ownerId: string
): Promise<void> => {
  const deletedBot = await botRepository.deleteById(botId, ownerId);
  if (!deletedBot) {
    throw new NotFoundError('Bot not found or you do not have permission to delete it.');
  }
};

export const regenerateAccessToken = async (
  botId: string,
  ownerId: string
): Promise<string> => {
  // Must fetch with token first to ensure it's a valid bot owned by the user
  const bot = await botRepository.findByIdWithToken(botId, ownerId);
  if (!bot) {
    throw new NotFoundError('Bot not found or you do not have permission to manage it.');
  }

  const newAccessToken = generateAccessToken();
  bot.accessToken = newAccessToken;
  await bot.save();

  return newAccessToken;
};
