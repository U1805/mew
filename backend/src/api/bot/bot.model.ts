import mongoose, { Schema, Document } from 'mongoose';

export enum BotType {
  Official = 'Official',
  Custom = 'Custom',
}

export interface IBot extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  avatarUrl?: string;
  accessToken: string;
  botType: BotType;
  dmEnabled: boolean;
  config: string; // JSON string
  createdAt: Date;
  updatedAt: Date;
}

const BotSchema: Schema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    accessToken: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    botType: {
      type: String,
      enum: Object.values(BotType),
      required: true,
      default: BotType.Custom,
    },
    dmEnabled: { type: Boolean, default: false },
    config: { type: String, default: '{}' },
  },
  { timestamps: true }
);

export default mongoose.model<IBot>('Bot', BotSchema);
