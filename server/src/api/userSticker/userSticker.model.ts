import mongoose, { Schema, Document } from 'mongoose';

export type UserStickerFormat = 'png' | 'gif' | 'webp' | 'jpg';

export interface IUserSticker extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  format: UserStickerFormat;
  contentType: string;
  key: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserStickerSchema = new Schema<IUserSticker>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    format: { type: String, required: true, enum: ['png', 'gif', 'webp', 'jpg'] },
    contentType: { type: String, required: true },
    key: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

UserStickerSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model<IUserSticker>('UserSticker', UserStickerSchema);

