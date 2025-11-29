import mongoose, { Schema, Document } from 'mongoose';

export enum ChannelType {
  GUILD_TEXT = 'GUILD_TEXT',
  DM = 'DM',
}

export interface IChannelUpdate {
  name?: string;
  categoryId?: mongoose.Types.ObjectId;
}

export interface IChannel extends Document {
  name?: string;
  type: ChannelType;
  serverId?: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  recipients?: mongoose.Types.ObjectId[];
  position?: number;
}

const ChannelSchema: Schema = new Schema(
  {
    name: { type: String },
    type: { type: String, enum: Object.values(ChannelType), required: true },
    serverId: { type: Schema.Types.ObjectId, ref: 'Server' },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    position: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model<IChannel>('Channel', ChannelSchema);
