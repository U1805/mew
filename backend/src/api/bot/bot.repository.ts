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
