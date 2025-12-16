import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors';

vi.mock('../api/category/category.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../api/server/server.model', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../api/member/member.model', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import Category from '../api/category/category.model';
import Server from '../api/server/server.model';
import ServerMember from '../api/member/member.model';
import { checkServerMembership, setServerIdFromCategory } from './memberAuth';

const makeRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('middleware/memberAuth', () => {
  const categoryFindById = (Category as any).findById as ReturnType<typeof vi.fn>;
  const serverFindById = (Server as any).findById as ReturnType<typeof vi.fn>;
  const memberFindOne = (ServerMember as any).findOne as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setServerIdFromCategory', () => {
    it('returns 400 when categoryId param is missing', async () => {
      const req: any = { params: {} };
      const res = makeRes();
      const next = vi.fn();

      await setServerIdFromCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith({ message: 'Category ID is required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 404 when category is not found', async () => {
      categoryFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      const req: any = { params: { categoryId: 'c1' } };
      const res = makeRes();
      const next = vi.fn();

      await setServerIdFromCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith({ message: 'Category not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('sets req.params.serverId and calls next when category exists', async () => {
      categoryFindById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ serverId: { toString: () => 's1' } }),
      });
      const req: any = { params: { categoryId: 'c1' } };
      const res = makeRes();
      const next = vi.fn();

      await setServerIdFromCategory(req, res, next);

      expect(req.params.serverId).toBe('s1');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkServerMembership', () => {
    it('calls next with UnauthorizedError when req.user is missing', async () => {
      const req: any = { params: { serverId: 's1' } };
      const next = vi.fn();

      await checkServerMembership(req, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    });

    it('calls next when serverId param is missing', async () => {
      const req: any = { params: {}, user: { id: 'u1' } };
      const next = vi.fn();

      await checkServerMembership(req, {} as any, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('calls next with NotFoundError when server does not exist', async () => {
      serverFindById.mockResolvedValue(null);
      const req: any = { params: { serverId: 's1' }, user: { id: 'u1' } };
      const next = vi.fn();

      await checkServerMembership(req, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(NotFoundError);
    });

    it('calls next with ForbiddenError when membership does not exist', async () => {
      serverFindById.mockResolvedValue({ _id: 's1' });
      memberFindOne.mockResolvedValue(null);
      const req: any = { params: { serverId: 's1' }, user: { id: 'u1' } };
      const next = vi.fn();

      await checkServerMembership(req, {} as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
    });

    it('attaches req.member and calls next when membership exists', async () => {
      serverFindById.mockResolvedValue({ _id: 's1' });
      memberFindOne.mockResolvedValue({ _id: 'm1', userId: 'u1', serverId: 's1' });
      const req: any = { params: { serverId: 's1' }, user: { id: 'u1' } };
      const next = vi.fn();

      await checkServerMembership(req, {} as any, next);

      expect(req.member).toEqual({ _id: 'm1', userId: 'u1', serverId: 's1' });
      expect(next).toHaveBeenCalledWith();
    });
  });
});

