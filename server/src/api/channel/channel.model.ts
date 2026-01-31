import mongoose, { Schema, Document } from 'mongoose';

export enum ChannelType {
  GUILD_TEXT = 'GUILD_TEXT',
  GUILD_WEB = 'GUILD_WEB',
  DM = 'DM',
}

export interface IChannelUpdate {
  name?: string;
  categoryId?: mongoose.Types.ObjectId;
  topic?: string;
  url?: string;
}

interface IPermissionOverride {
  targetType: 'role' | 'member';
  targetId: mongoose.Types.ObjectId;
  allow: string[];
  deny: string[];
}

export interface IChannel extends Document {
  name?: string;
  topic?: string;
  url?: string;
  type: ChannelType;
  serverId?: mongoose.Types.ObjectId;
  categoryId?: mongoose.Types.ObjectId;
  recipients?: mongoose.Types.ObjectId[];
  position?: number;
  permissionOverrides?: IPermissionOverride[];
}

const PermissionOverrideSchema = new Schema<IPermissionOverride>(
  {
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    allow: { type: [String], default: [] },
    deny: { type: [String], default: [] },
  },
  { _id: false }
);

const ChannelSchema: Schema = new Schema(
  {
    name: { type: String },
    topic: { type: String, maxlength: 1024 },
    url: { type: String, maxlength: 2048 },
    type: { type: String, enum: Object.values(ChannelType), required: true },
    serverId: { type: Schema.Types.ObjectId, ref: 'Server' },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    position: { type: Number },
    permissionOverrides: { type: [PermissionOverrideSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IChannel>('Channel', ChannelSchema);
