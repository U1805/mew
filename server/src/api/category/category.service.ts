import { NotFoundError } from '../../utils/errors';
import Channel from '../channel/channel.model';
import { ICategory } from './category.model';
import { socketManager } from '../../gateway/events';
import { categoryRepository } from './category.repository';

export const createCategory = async (
  name: string,
  serverId: string
): Promise<ICategory> => {
  return categoryRepository.create(name, serverId);
};

export const getCategoriesByServer = async (serverId: string): Promise<ICategory[]> => {
  return categoryRepository.findByServer(serverId);
};

export const updateCategoryById = async (
  categoryId: string,
  data: Partial<Pick<ICategory, 'name' | 'position'>>,
  userId: string
): Promise<ICategory> => {
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
  const category = await categoryRepository.findById(categoryId);
  if (!category) {
    throw new NotFoundError('Category not found');
  }

  await Channel.updateMany({ categoryId }, { $unset: { categoryId: '' } });

  const serverId = category.serverId.toString();
  await categoryRepository.deleteById(categoryId);

  socketManager.broadcast('CATEGORY_DELETE', serverId, { categoryId });
};
