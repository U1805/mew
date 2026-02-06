import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../../utils/errors';

vi.mock('./category.service', () => ({
  createCategory: vi.fn(),
  getCategoriesByServer: vi.fn(),
  updateCategoryById: vi.fn(),
  deleteCategoryById: vi.fn(),
}));

import * as categoryService from './category.service';
import {
  createCategoryHandler,
  deleteCategoryHandler,
  getCategoriesHandler,
  updateCategoryHandler,
} from './category.controller';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('api/category/category.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createCategoryHandler rejects unauthenticated requests', async () => {
    const req: any = { user: null, body: { name: 'General' }, params: { serverId: 's1' } };
    const res = makeRes();
    const next = vi.fn();

    await createCategoryHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(categoryService.createCategory).not.toHaveBeenCalled();
  });

  it('createCategoryHandler creates category for authenticated user', async () => {
    vi.mocked(categoryService.createCategory).mockResolvedValue({ _id: 'c1' } as any);
    const req: any = { user: { id: 'u1' }, body: { name: 'General' }, params: { serverId: 's1' } };
    const res = makeRes();
    const next = vi.fn();

    await createCategoryHandler(req, res, next);

    expect(categoryService.createCategory).toHaveBeenCalledWith('General', 's1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ _id: 'c1' });
    expect(next).not.toHaveBeenCalled();
  });

  it('getCategoriesHandler returns categories', async () => {
    vi.mocked(categoryService.getCategoriesByServer).mockResolvedValue([{ _id: 'c1' }] as any);
    const req: any = { user: { id: 'u1' }, params: { serverId: 's1' } };
    const res = makeRes();
    const next = vi.fn();

    await getCategoriesHandler(req, res, next);

    expect(categoryService.getCategoriesByServer).toHaveBeenCalledWith('s1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ _id: 'c1' }]);
    expect(next).not.toHaveBeenCalled();
  });

  it('getCategoriesHandler rejects unauthenticated requests', async () => {
    const req: any = { user: null, params: { serverId: 's1' } };
    const res = makeRes();
    const next = vi.fn();

    await getCategoriesHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(categoryService.getCategoriesByServer).not.toHaveBeenCalled();
  });

  it('updateCategoryHandler passes category payload and actor id', async () => {
    vi.mocked(categoryService.updateCategoryById).mockResolvedValue({ _id: 'c1', name: 'Renamed' } as any);
    const req: any = {
      user: { id: 'u2' },
      params: { categoryId: 'c1' },
      body: { name: 'Renamed' },
    };
    const res = makeRes();
    const next = vi.fn();

    await updateCategoryHandler(req, res, next);

    expect(categoryService.updateCategoryById).toHaveBeenCalledWith('c1', { name: 'Renamed' }, 'u2');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ _id: 'c1', name: 'Renamed' });
    expect(next).not.toHaveBeenCalled();
  });

  it('deleteCategoryHandler deletes and returns 204', async () => {
    const req: any = { user: { id: 'u2' }, params: { categoryId: 'c1' } };
    const res = makeRes();
    const next = vi.fn();

    await deleteCategoryHandler(req, res, next);

    expect(categoryService.deleteCategoryById).toHaveBeenCalledWith('c1', 'u2');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('updateCategoryHandler rejects unauthenticated requests', async () => {
    const req: any = { user: null, params: { categoryId: 'c1' }, body: { name: 'Renamed' } };
    const res = makeRes();
    const next = vi.fn();

    await updateCategoryHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(categoryService.updateCategoryById).not.toHaveBeenCalled();
  });

  it('deleteCategoryHandler rejects unauthenticated requests', async () => {
    const req: any = { user: null, params: { categoryId: 'c1' } };
    const res = makeRes();
    const next = vi.fn();

    await deleteCategoryHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(categoryService.deleteCategoryById).not.toHaveBeenCalled();
  });
});
