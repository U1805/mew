import { Document, Schema, model, Types } from 'mongoose';

export interface IServerMember extends Document {
  serverId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'OWNER' | 'MEMBER';
  nickname?: string;
}

const ServerMemberSchema = new Schema<IServerMember>(
  {
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['OWNER', 'MEMBER'], default: 'MEMBER' },
    nickname: { type: String },
  },
  { timestamps: true }
);

ServerMemberSchema.index({ serverId: 1, userId: 1 }, { unique: true });

const ServerMember = model<IServerMember>('ServerMember', ServerMemberSchema);

export default ServerMember;
