import { Document, Schema, model, Types } from 'mongoose';

export type ChannelNotificationLevel = 'DEFAULT' | 'ALL_MESSAGES' | 'MENTIONS_ONLY' | 'MUTE';

export interface IUserChannelNotificationSetting extends Document {
  userId: Types.ObjectId;
  channelId: Types.ObjectId;
  level: ChannelNotificationLevel;
}

const UserChannelNotificationSettingSchema = new Schema<IUserChannelNotificationSetting>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    level: {
      type: String,
      enum: ['DEFAULT', 'ALL_MESSAGES', 'MENTIONS_ONLY', 'MUTE'],
      required: true,
    },
  },
  { timestamps: true }
);

UserChannelNotificationSettingSchema.index({ userId: 1, channelId: 1 }, { unique: true });

export const UserChannelNotificationSetting = model<IUserChannelNotificationSetting>(
  'UserChannelNotificationSetting',
  UserChannelNotificationSettingSchema
);

