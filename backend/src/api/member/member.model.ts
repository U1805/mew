import { Document, Schema, model, Types } from 'mongoose';

export interface IServerMember extends Document {
  serverId: Types.ObjectId;
  userId: Types.ObjectId;
  roleIds: Types.ObjectId[];
  isOwner: boolean;
  nickname?: string;
}

const ServerMemberSchema = new Schema<IServerMember>(
  {
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    isOwner: { type: Boolean, default: false, index: true },
    nickname: { type: String },
  },
  { timestamps: true }
);

ServerMemberSchema.index({ serverId: 1, userId: 1 }, { unique: true });

const ServerMember = model<IServerMember>('ServerMember', ServerMemberSchema);

export default ServerMember;
