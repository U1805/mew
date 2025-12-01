import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as categoryService from './category.service';
import Category from './category.model';
import Server from '../server/server.model';
import Channel from '../channel/channel.model';
import * as events from '../../gateway/events';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

// Mock the models and gateway
vi.mock('./category.model');
vi.mock('../server/server.model');
vi.mock('../channel/channel.model');
vi.mock('../../gateway/events');

describe('Category Service', () => {
  const userId = 'user123';
  const ownerId = 'user123';
  const otherUserId = 'user456';
  const serverId = 'server123';
  const categoryId = 'category123';

  const mockServer = {
    _id: serverId,
    ownerId: ownerId,
  };

  const mockCategory = {
    _id: categoryId,
    name: 'Test Category',
    serverId: mockServer,
    save: vi.fn(),
    deleteOne: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateCategoryById', () => {
    it('should update a category and broadcast an event', async () => {
      Category.findById.mockReturnValue({ populate: () => Promise.resolve(mockCategory) });

      const updatedData = { name: 'Updated Name' };
      const result = await categoryService.updateCategoryById(categoryId, updatedData, ownerId);

      expect(Category.findById).toHaveBeenCalledWith(categoryId);
      expect(mockCategory.save).toHaveBeenCalled();
      expect(result.name).toBe('Updated Name');
      expect(events.broadcastEvent).toHaveBeenCalledWith(serverId, 'CATEGORY_UPDATE', expect.any(Object));
    });

    it('should throw ForbiddenError if user is not the owner', async () => {
      Category.findById.mockReturnValue({ populate: () => Promise.resolve(mockCategory) });

      await expect(categoryService.updateCategoryById(categoryId, { name: 'new' }, otherUserId)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('deleteCategoryById', () => {
    it('should delete a category, unset its channels, and broadcast an event', async () => {
        Category.findById.mockReturnValue({ populate: () => Promise.resolve(mockCategory) });

        await categoryService.deleteCategoryById(categoryId, ownerId);

        expect(Category.findById).toHaveBeenCalledWith(categoryId);
        expect(Channel.updateMany).toHaveBeenCalledWith({ categoryId }, { $unset: { categoryId: '' } });
        expect(mockCategory.deleteOne).toHaveBeenCalled();
        expect(events.broadcastEvent).toHaveBeenCalledWith(serverId, 'CATEGORY_DELETE', { categoryId });
    });

    it('should throw NotFoundError if category does not exist', async () => {
        Category.findById.mockReturnValue({ populate: () => Promise.resolve(null) });
        await expect(categoryService.deleteCategoryById('nonexistent', ownerId)).rejects.toThrow(NotFoundError);
    });
  });
});
