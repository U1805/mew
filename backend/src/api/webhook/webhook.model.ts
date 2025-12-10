import mongoose, { Document, model, Schema } from 'mongoose';

export interface IWebhook extends Document {
  name: string;
  avatarUrl?: string;
  channelId: mongoose.Types.ObjectId;
  serverId: mongoose.Types.ObjectId;
  token: string;
  botUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const webhookSchema = new Schema<IWebhook>(
  {
    name: { type: String, required: true },
    avatarUrl: { type: String },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true, index: true },
    token: { type: String, required: true },
    botUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Webhook = model<IWebhook>('Webhook', webhookSchema);
