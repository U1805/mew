import { NotFoundError, ForbiddenError } from '../../utils/errors';
import { calculateEffectivePermissions } from '../../utils/permission.service';
import { Permission } from '../../constants/permissions';
import Role from '../role/role.model';
import Server from '../server/server.model';
import Channel from '../channel/channel.model';
import Category, { ICategory } from './category.model';
import { socketManager } from '../../gateway/events';
import ServerMember from '../member/member.model';


export const createCategory = async (
  name: string,
  serverId: string
): Promise<ICategory> => {
  // Permission is checked by middleware
  const newCategory = await Category.create({ name, serverId });

  return newCategory;
};

export const getCategoriesByServer = async (serverId: string): Promise<ICategory[]> => {
  // Permission is checked by middleware
  const categories = await Category.find({ serverId });
  return categories;
};


export const updateCategoryById = async (
  categoryId: string,
  data: Partial<Pick<ICategory, 'name' | 'position'>>,
  userId: string
): Promise<ICategory> => {
  
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new NotFoundError('Category not found'); // Should be caught by check, but for safety
  }

  Object.assign(category, data);
  await category.save();

  socketManager.broadcast('CATEGORY_UPDATE', category.serverId.toString(), category);

  return category;
};

export const deleteCategoryById = async (
  categoryId: string,
  userId: string
): Promise<void> => {
  
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new NotFoundError('Category not found'); // Should be caught by check, but for safety
  }

  // Un-categorize channels in this category
  await Channel.updateMany({ categoryId }, { $unset: { categoryId: '' } });

  const serverId = category.serverId.toString();
  await category.deleteOne();

  socketManager.broadcast('CATEGORY_DELETE', serverId, { categoryId });
};