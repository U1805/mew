import { NotFoundError } from '../../utils/errors';
import Channel from '../channel/channel.model';
import { ICategory } from './category.model';
import { socketManager } from '../../gateway/events';
import { categoryRepository } from './category.repository';

export const createCategory = async (
  name: string,
  serverId: string
): Promise<ICategory> => {
  // Permission is checked by middleware
  const newCategory = await categoryRepository.create(name, serverId);
  return newCategory;
};

export const getCategoriesByServer = async (serverId: string): Promise<ICategory[]> => {
  // Permission is checked by middleware
  const categories = await categoryRepository.findByServer(serverId);
  return categories;
};

export const updateCategoryById = async (
  categoryId: string,
  data: Partial<Pick<ICategory, 'name' | 'position'>>,
  userId: string
): Promise<ICategory> => {
  // Permission is checked by middleware
  const category = await categoryRepository.updateById(categoryId, data);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  socketManager.broadcast('CATEGORY_UPDATE', category.serverId.toString(), category);

  return category;
};

export const deleteCategoryById = async (
  categoryId: string,
  userId: string
): Promise<void> => {
   // Permission is checked by middleware
  const category = await categoryRepository.findById(categoryId);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  // Un-categorize channels in this category
  await Channel.updateMany({ categoryId }, { $unset: { categoryId: '' } });

  const serverId = category.serverId.toString();
  await categoryRepository.deleteById(categoryId);

  socketManager.broadcast('CATEGORY_DELETE', serverId, { categoryId });
};