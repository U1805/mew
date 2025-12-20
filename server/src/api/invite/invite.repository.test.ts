import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./invite.model', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

import Invite from './invite.model';
import { inviteRepository } from './invite.repository';

describe('invite.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findOne delegates to Invite.findOne', async () => {
    vi.mocked((Invite as any).findOne).mockResolvedValue({ code: 'x' });
    const result = await inviteRepository.findOne({ code: 'x' });
    expect((Invite as any).findOne).toHaveBeenCalledWith({ code: 'x' });
    expect(result).toEqual({ code: 'x' });
  });

  it('create delegates to Invite.create', async () => {
    vi.mocked((Invite as any).create).mockResolvedValue({ code: 'x' });
    const result = await inviteRepository.create({ code: 'x' } as any);
    expect((Invite as any).create).toHaveBeenCalledWith({ code: 'x' });
    expect(result).toEqual({ code: 'x' });
  });

  it('updateOne delegates to Invite.updateOne', async () => {
    vi.mocked((Invite as any).updateOne).mockResolvedValue({ matchedCount: 1 });
    const result = await inviteRepository.updateOne({ code: 'x' }, { uses: 1 });
    expect((Invite as any).updateOne).toHaveBeenCalledWith({ code: 'x' }, { uses: 1 });
    expect(result).toEqual({ matchedCount: 1 });
  });

  it('deleteOne delegates to Invite.deleteOne', async () => {
    vi.mocked((Invite as any).deleteOne).mockResolvedValue({ deletedCount: 1 });
    const result = await inviteRepository.deleteOne({ code: 'x' });
    expect((Invite as any).deleteOne).toHaveBeenCalledWith({ code: 'x' });
    expect(result).toEqual({ deletedCount: 1 });
  });
});

