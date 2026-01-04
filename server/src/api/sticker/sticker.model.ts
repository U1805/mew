import mongoose, { Schema, Document } from 'mongoose';

export type StickerFormat = 'png' | 'gif' | 'webp' | 'jpg';

export interface ISticker extends Document {
  serverId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  format: StickerFormat;
  contentType: string;
  key: string;
  size: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StickerSchema = new Schema<ISticker>(
  {
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    format: { type: String, required: true, enum: ['png', 'gif', 'webp', 'jpg'] },
    contentType: { type: String, required: true },
    key: { type: String, required: true },
    size: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

StickerSchema.index({ serverId: 1, name: 1 }, { unique: true });

export default mongoose.model<ISticker>('Sticker', StickerSchema);

