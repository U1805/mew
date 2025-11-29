import { NotFoundError, ForbiddenError } from '../../utils/errors';
import Server from '../server/server.model';
import Category, { ICategory } from './category.model';

export const createCategory = async (
  name: string,
  serverId: string,
  userId: string
): Promise<ICategory> => {
  const server = await Server.findById(serverId);

  if (!server) {
    throw new NotFoundError('Server not found');
  }

  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You are not the owner of this server');
  }

  const newCategory = await Category.create({ name, serverId });

  return newCategory;
};

export const getCategoriesByServer = async (serverId: string, userId: string): Promise<ICategory[]> => {
  const server = await Server.findById(serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  // For a private system, checking ownership is good practice.
  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to view these categories');
  }

  const categories = await Category.find({ serverId });
  return categories;
};