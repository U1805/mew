import Bot, { IBot } from './bot.model';
import mongoose from 'mongoose';

/**
 * Creates a new bot.
 */
export const create = async (botData: Partial<IBot>): Promise<IBot> => {
  const bot = new Bot(botData);
  return bot.save();
};

/**
 * Finds a bot by its ID, ensuring it belongs to the specified owner.
 */
export const findById = async (
  botId: string,
  ownerId: string
): Promise<IBot | null> => {
  return Bot.findOne({ _id: botId, ownerId });
};

/**
 * Finds all bots belonging to a specific owner.
 */
export const findByOwnerId = async (ownerId: string): Promise<IBot[]> => {
  return Bot.find({ ownerId });
};

/**
 * Finds a bot by its associated bot user ID.
 */
export const findByBotUserId = async (botUserId: string): Promise<IBot | null> => {
  return Bot.findOne({ botUserId: new mongoose.Types.ObjectId(botUserId) as any });
};

/**
 * Updates a bot by its ID, ensuring it belongs to the specified owner.
 */
export const updateById = async (
  botId: string,
  ownerId: string,
  updateData: Partial<IBot>
): Promise<IBot | null> => {
  return Bot.findOneAndUpdate({ _id: botId, ownerId }, updateData, { new: true });
};

/**
 * Deletes a bot by its ID, ensuring it belongs to the specified owner.
 */
export const deleteById = async (
  botId: string,
  ownerId: string
): Promise<IBot | null> => {
  return Bot.findOneAndDelete({ _id: botId, ownerId });
};

/**
 * Finds a bot by ID for token regeneration, including the accessToken field.
 */
export const findByIdWithToken = async (
  botId: string,
  ownerId: string
): Promise<IBot | null> => {
  return Bot.findOne({ _id: botId, ownerId }).select('+accessToken');
};

/**
 * Finds all bots for a given service type, including access tokens (for infra bootstrap).
 */
export const findByServiceTypeWithToken = async (serviceType: string): Promise<IBot[]> => {
  if (serviceType === 'rss-fetcher') {
    return Bot.find({ $or: [{ serviceType }, { serviceType: { $exists: false } }] }).select('+accessToken');
  }
  return Bot.find({ serviceType }).select('+accessToken');
};

/**
 * Finds a bot by ID, including access token (infra-only).
 */
export const findByIdWithTokenUnscoped = async (botId: string): Promise<IBot | null> => {
  return Bot.findById(botId).select('+accessToken');
};

/**
 * Finds a bot by its access token (used by interactive bots to authenticate).
 */
export const findByAccessToken = async (accessToken: string): Promise<IBot | null> => {
  return Bot.findOne({ accessToken }).select('+accessToken');
};
