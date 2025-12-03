import { Document, Schema, model, Types } from 'mongoose';

export interface IInvite extends Document {
  code: string;
  serverId: Types.ObjectId;
  creatorId: Types.ObjectId;
  expiresAt?: Date;
  maxUses?: number;
  uses: number;
}

const InviteSchema = new Schema<IInvite>(
  {
    code: { type: String, required: true, unique: true },
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date },
    maxUses: { type: Number, default: 0 }, // 0 for unlimited
    uses: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Invite = model<IInvite>('Invite', InviteSchema);

export default Invite;