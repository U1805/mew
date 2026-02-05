import mongoose, { Schema, Document } from 'mongoose';

export interface IBot extends Document {
  ownerId: mongoose.Types.ObjectId;
  botUserId?: mongoose.Types.ObjectId;
  name: string;
  avatarUrl?: string;
  accessToken: string;
  accessTokenEnc?: string;
  serviceType: string;
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
    accessTokenEnc: {
      type: String,
      select: false,
    },
    serviceType: {
      type: String,
      required: true,
      index: true,
    },
    botUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      sparse: true,
      index: true,
    },
    dmEnabled: { type: Boolean, default: false },
    config: { type: String, default: '{}' },
  },
  { timestamps: true }
);

export default mongoose.model<IBot>('Bot', BotSchema);
