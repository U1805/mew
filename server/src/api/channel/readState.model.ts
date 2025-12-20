import { Schema, model, Document, Types } from 'mongoose';

export interface IChannelReadState extends Document {
  userId: Types.ObjectId;
  channelId: Types.ObjectId;
  lastReadMessageId: Types.ObjectId;
}

const ChannelReadStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    lastReadMessageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
  },
  { timestamps: true },
);

ChannelReadStateSchema.index({ userId: 1, channelId: 1 }, { unique: true });

export const ChannelReadState = model<IChannelReadState>('ChannelReadState', ChannelReadStateSchema);
