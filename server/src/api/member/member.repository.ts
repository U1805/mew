import ServerMember, { IServerMember } from './member.model';
import mongoose from 'mongoose';

class MemberRepository {
  async find(filter: any): Promise<any[]> {
    // Repository owns populate/lean decisions.
    return ServerMember.find(filter)
      .populate('userId', '_id username discriminator avatarUrl isBot email createdAt')
      .lean();
  }

  async findOne(filter: any): Promise<IServerMember | null> {
    return ServerMember.findOne(filter);
  }

  async deleteOne(filter: any): Promise<{ deletedCount: number; acknowledged: boolean }> {
    return ServerMember.deleteOne(filter);
  }

  async count(filter: any): Promise<number> {
    return ServerMember.countDocuments(filter);
  }

  async save(member: IServerMember): Promise<IServerMember> {
    return member.save();
  }
}

export const memberRepository = new MemberRepository();
