import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as CategoryService from './category.service';
import ServerMember from '../member/member.model';
import Category from './category.model';
import Channel from '../channel/channel.model';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { socketManager } from '../../gateway/events';

vi.mock('../../gateway/events', () => ({
  socketManager: {
    broadcast: vi.fn(),
  },
}));

describe('Category Service', () => {

  let serverId: string, ownerId: string, memberId: string, categoryId: string;

  beforeEach(async () => {
    await Category.deleteMany({});
    await ServerMember.deleteMany({});
    await Channel.deleteMany({});
    vi.clearAllMocks();

    serverId = new mongoose.Types.ObjectId().toHexString();
    ownerId = new mongoose.Types.ObjectId().toHexString();
    memberId = new mongoose.Types.ObjectId().toHexString();

    await ServerMember.create([
      { serverId, userId: ownerId, role: 'OWNER' },
      { serverId, userId: memberId, role: 'MEMBER' },
    ]);

    const category = await Category.create({ name: 'General', serverId });
    categoryId = category._id.toHexString();

    await Channel.create({ name: 'general-chat', serverId, categoryId, type: 'GUILD_TEXT' });
  });

  describe('createCategory & getCategoriesByServer', () => {
    it('should create and retrieve categories for a server', async () => {
      await CategoryService.createCategory('Announcements', serverId);
      const categories = await CategoryService.getCategoriesByServer(serverId);
      expect(categories.length).toBe(2);
      expect(categories.some((c) => c.name === 'Announcements')).toBe(true);
    });
  });

  describe('updateCategoryById', () => {
    it('should allow an owner to update a category', async () => {
      const updatedName = 'Updated General';
      const category = await CategoryService.updateCategoryById(categoryId, { name: updatedName }, ownerId);
      expect(category.name).toBe(updatedName);
      expect(socketManager.broadcast).toHaveBeenCalledWith('CATEGORY_UPDATE', serverId, expect.any(Object));
    });

    it('should prevent a non-owner from updating', async () => {
      await expect(CategoryService.updateCategoryById(categoryId, { name: 't' }, memberId)).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError for non-existent category', async () => {
        const nonExistentId = new mongoose.Types.ObjectId().toHexString();
        await expect(CategoryService.updateCategoryById(nonExistentId, {}, ownerId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteCategoryById', () => {
    it('should allow an owner to delete a category and un-categorize channels', async () => {
      await CategoryService.deleteCategoryById(categoryId, ownerId);
      const deletedCategory = await Category.findById(categoryId);
      expect(deletedCategory).toBeNull();

      const channel = await Channel.findOne({ serverId });
      expect(channel).not.toBeNull();
      expect(channel!.categoryId).toBeUndefined();
      expect(socketManager.broadcast).toHaveBeenCalledWith('CATEGORY_DELETE', serverId, { categoryId });
    });

    it('should prevent a non-owner from deleting', async () => {
      await expect(CategoryService.deleteCategoryById(categoryId, memberId)).rejects.toThrow(ForbiddenError);
    });
  });
});
