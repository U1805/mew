import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./user.model', () => ({
  default: {
    findById: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    find: vi.fn(),
  },
}));

import User from './user.model';
import { userRepository } from './user.repository';

describe('user.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findById delegates to User.findById', async () => {
    vi.mocked((User as any).findById).mockResolvedValue({ _id: 'u1' });
    const result = await userRepository.findById('u1');
    expect((User as any).findById).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ _id: 'u1' });
  });

  it('findByEmail delegates to User.findOne', async () => {
    vi.mocked((User as any).findOne).mockResolvedValue({ email: 'a@b.com' });
    const result = await userRepository.findByEmail('a@b.com');
    expect((User as any).findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(result).toEqual({ email: 'a@b.com' });
  });

  it('findByIdWithPassword selects +password', async () => {
    const select = vi.fn().mockResolvedValue({ _id: 'u1', password: 'p' });
    vi.mocked((User as any).findById).mockReturnValue({ select });
    const result = await userRepository.findByIdWithPassword('u1');
    expect((User as any).findById).toHaveBeenCalledWith('u1');
    expect(select).toHaveBeenCalledWith('+password');
    expect(result).toEqual({ _id: 'u1', password: 'p' });
  });

  it('findByEmailWithPassword selects +password', async () => {
    const select = vi.fn().mockResolvedValue({ email: 'a@b.com', password: 'p' });
    vi.mocked((User as any).findOne).mockReturnValue({ select });
    const result = await userRepository.findByEmailWithPassword('a@b.com');
    expect((User as any).findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(select).toHaveBeenCalledWith('+password');
    expect(result).toEqual({ email: 'a@b.com', password: 'p' });
  });

  it('create delegates to User.create', async () => {
    vi.mocked((User as any).create).mockResolvedValue({ _id: 'u1' });
    const result = await userRepository.create({ username: 'x' } as any);
    expect((User as any).create).toHaveBeenCalledWith({ username: 'x' });
    expect(result).toEqual({ _id: 'u1' });
  });

  it('updateById delegates to User.findByIdAndUpdate', async () => {
    vi.mocked((User as any).findByIdAndUpdate).mockResolvedValue({ _id: 'u1', username: 'y' });
    const result = await userRepository.updateById('u1', { username: 'y' } as any);
    expect((User as any).findByIdAndUpdate).toHaveBeenCalledWith('u1', { username: 'y' }, { new: true });
    expect(result).toEqual({ _id: 'u1', username: 'y' });
  });

  it('find delegates to User.find().limit().select()', async () => {
    const select = vi.fn().mockResolvedValue([{ _id: 'u2' }]);
    const limit = vi.fn().mockReturnValue({ select });
    vi.mocked((User as any).find).mockReturnValue({ limit });

    const result = await userRepository.find({ username: /a/ }, '_id username', 10);

    expect((User as any).find).toHaveBeenCalledWith({ username: /a/ });
    expect(limit).toHaveBeenCalledWith(10);
    expect(select).toHaveBeenCalledWith('_id username');
    expect(result).toEqual([{ _id: 'u2' }]);
  });
});

