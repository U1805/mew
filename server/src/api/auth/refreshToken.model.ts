import mongoose, { Schema, Document } from 'mongoose';

export interface IRefreshToken extends Document {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  isPersistent: boolean;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedByTokenId?: mongoose.Types.ObjectId | null;
  createdByIp?: string | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    isPersistent: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenId: { type: Schema.Types.ObjectId, default: null },
    createdByIp: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

// Best-effort cleanup for expired tokens.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
