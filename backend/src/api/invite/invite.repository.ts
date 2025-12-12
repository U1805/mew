import { Types } from 'mongoose';
import Invite, { IInvite } from './invite.model';

class InviteRepository {
  // NOTE: Using `any` as a workaround for a persistent TS compilation issue
  // where FilterQuery and UpdateQuery cannot be resolved from the Mongoose module.
  public async findOne(filter: any) {
    return Invite.findOne(filter);
  }

  public async create(data: Partial<IInvite>) {
    return Invite.create(data);
  }

  public async updateOne(filter: any, data: any) {
    return Invite.updateOne(filter, data);
  }

  public async deleteOne(filter: any) {
    return Invite.deleteOne(filter);
  }
}

export const inviteRepository = new InviteRepository();
