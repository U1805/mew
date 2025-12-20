import { nanoid } from 'nanoid';
import * as botRepository from './bot.repository';
import { IBot } from './bot.model';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { uploadFile, getS3PublicUrl } from '../../utils/s3';
import ServiceTypeModel from '../infra/serviceType.model';
import { socketManager } from '../../gateway/events';

const generateAccessToken = () => nanoid(32);

const normalizeServiceType = (serviceType?: string) => serviceType || 'rss-fetcher';

const assertServiceTypeAllowed = async (serviceType: string) => {
  const exists = await ServiceTypeModel.exists({ name: serviceType });
  if (!exists) {
    throw new BadRequestError(`Unknown serviceType: ${serviceType}`);
  }
};

const broadcastBotConfigUpdate = (serviceType: string, botId: string) => {
  try {
    socketManager.getIO().of('/infra').to(serviceType).emit('SYSTEM_BOT_CONFIG_UPDATE', { serviceType, botId });
  } catch {
    // Socket server not initialized (e.g., in unit tests); ignore.
  }
};

export const createBot = async (
  ownerId: string,
  botData: Partial<IBot>,
  avatarFile?: Express.Multer.File
): Promise<IBot> => {
  if (!botData.serviceType) {
    throw new BadRequestError('serviceType is required');
  }
  await assertServiceTypeAllowed(botData.serviceType);

  const accessToken = generateAccessToken();
  let avatarUrl: string | undefined;

  if (avatarFile) {
    const existingKey = (avatarFile as any).key as string | undefined;
    const { key } = existingKey ? { key: existingKey } : await uploadFile(avatarFile);
    avatarUrl = getS3PublicUrl(key);
  }

  const newBot = await botRepository.create({
    ...botData,
    ownerId: ownerId as any,
    accessToken,
    avatarUrl,
  });

  broadcastBotConfigUpdate(newBot.serviceType, newBot._id.toString());

  // For the create operation ONLY, return the full object with the token.
  // Subsequent fetches (e.g., getBotById) will correctly omit it.
  const botObject = newBot.toObject();
  botObject.accessToken = newBot.accessToken;
  return botObject;
};

export const getBotsByOwner = async (ownerId: string): Promise<IBot[]> => {
  const bots = await botRepository.findByOwnerId(ownerId);
  return bots.map((b: any) => {
    const obj = b.toObject ? b.toObject() : b;
    obj.serviceType = normalizeServiceType(obj.serviceType);
    return obj;
  }) as any;
};

export const getBotById = async (
  botId: string,
  ownerId: string
): Promise<IBot> => {
  const bot = await botRepository.findById(botId, ownerId);
  if (!bot) {
    throw new NotFoundError('Bot not found or you do not have permission to view it.');
  }
  const obj: any = bot.toObject ? bot.toObject() : bot;
  obj.serviceType = normalizeServiceType(obj.serviceType);
  return obj;
};

export const updateBot = async (
  botId: string,
  ownerId: string,
  updateData: Partial<IBot>,
  avatarFile?: Express.Multer.File
): Promise<IBot> => {
  const bot = await getBotById(botId, ownerId);

  if (updateData.serviceType) {
    await assertServiceTypeAllowed(updateData.serviceType);
  }

  let avatarUrl: string | undefined;
  if (avatarFile) {
    const existingKey = (avatarFile as any).key as string | undefined;
    const { key } = existingKey ? { key: existingKey } : await uploadFile(avatarFile);
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

  broadcastBotConfigUpdate(normalizeServiceType(updatedBot.serviceType), updatedBot._id.toString());

  const obj: any = updatedBot.toObject ? updatedBot.toObject() : updatedBot;
  obj.serviceType = normalizeServiceType(obj.serviceType);
  return obj;
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

export const bootstrapBots = async (serviceType: string) => {
  await assertServiceTypeAllowed(serviceType);
  const bots = await botRepository.findByServiceTypeWithToken(serviceType);
  return bots.map((bot) => ({
    _id: bot._id,
    name: bot.name,
    config: bot.config,
    accessToken: bot.accessToken,
    serviceType: normalizeServiceType(bot.serviceType),
    dmEnabled: bot.dmEnabled,
  }));
};

export const bootstrapBotById = async (botId: string, expectedServiceType?: string) => {
  const bot = await botRepository.findByIdWithTokenUnscoped(botId);
  if (!bot) throw new NotFoundError('Bot not found.');

  const effectiveServiceType = normalizeServiceType(bot.serviceType);
  if (expectedServiceType && expectedServiceType !== effectiveServiceType) {
    throw new NotFoundError('Bot not found.');
  }

  await assertServiceTypeAllowed(effectiveServiceType);

  return {
    _id: bot._id,
    name: bot.name,
    config: bot.config,
    accessToken: bot.accessToken,
    serviceType: effectiveServiceType,
    dmEnabled: bot.dmEnabled,
  };
};
