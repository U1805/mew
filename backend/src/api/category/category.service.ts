import Category, { ICategory } from './category.model';
import Server from '../server/server.model';
import Channel from '../channel/channel.model';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

interface CreateCategoryData {
  name: string;
  serverId: string;
}

export const createCategory = async (data: CreateCategoryData, userId: string): Promise<ICategory> => {
  const server = await Server.findById(data.serverId);
  if (!server) {
    throw new NotFoundError('Server not found');
  }

  if (server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to create a category in this server');
  }

  const category = new Category(data);
  await category.save();
  return category;
};

interface UpdateCategoryData {
  name?: string;
  position?: number;
}

export const updateCategory = async (
  categoryId: string,
  userId: string,
  data: UpdateCategoryData
): Promise<ICategory> => {
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  const server = await Server.findById(category.serverId);
  if (!server || server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to edit categories in this server');
  }

  Object.assign(category, data);
  await category.save();
  return category;
};

export const deleteCategory = async (categoryId: string, userId: string) => {
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  const server = await Server.findById(category.serverId);
  if (!server || server.ownerId.toString() !== userId) {
    throw new ForbiddenError('You do not have permission to delete categories in this server');
  }

  // Optional: Move channels from this category to 'uncategorized' (or null)
  await Channel.updateMany({ categoryId }, { $unset: { categoryId: '' } });

  await category.deleteOne();

  return { message: 'Category deleted successfully' };
};
