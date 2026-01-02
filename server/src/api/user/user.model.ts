import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  username: string;
  discriminator: string;
  password?: string;
  avatarUrl?: string;
  isBot: boolean;
  notificationSettings?: {
    soundEnabled: boolean;
    soundVolume: number; // 0..1
    desktopEnabled: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const generateDiscriminatorCandidate = () => {
  // Discord-style 4-digit discriminator: 0001-9999 (0000 reserved/unused)
  const n = Math.floor(Math.random() * 9999) + 1;
  return String(n).padStart(4, '0');
};

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    // Username is no longer globally unique; uniqueness is enforced by (username, discriminator).
    username: { type: String, required: true, trim: true },
    discriminator: { type: String, required: true, trim: true, match: [/^\d{4}$/, 'Invalid discriminator'] },
    password: { type: String, required: true, select: false },
    avatarUrl: { type: String },
    isBot: { type: Boolean, default: false },
    notificationSettings: {
      soundEnabled: { type: Boolean, default: true },
      soundVolume: { type: Number, default: 0.6, min: 0, max: 1 },
      desktopEnabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

UserSchema.index({ username: 1, discriminator: 1 }, { unique: true });

UserSchema.pre('validate', async function () {
  const doc: any = this;
  if (!doc || typeof doc.username !== 'string') return;

  // Only auto-assign when missing; do not change an existing discriminator.
  if (typeof doc.discriminator === 'string' && /^\d{4}$/.test(doc.discriminator)) return;

  const User = doc.constructor as mongoose.Model<IUser>;
  const username = doc.username;
  const excludeId = doc._id ? doc._id : undefined;

  const isTaken = async (disc: string) => {
    const query: any = { username, discriminator: disc };
    if (excludeId) query._id = { $ne: excludeId };
    return !!(await User.exists(query));
  };

  // Try a handful of random candidates first.
  for (let attempt = 0; attempt < 25; attempt++) {
    const disc = generateDiscriminatorCandidate();
    if (!(await isTaken(disc))) {
      doc.discriminator = disc;
      return;
    }
  }

  // Deterministic fallback: scan 0001..9999.
  for (let i = 1; i <= 9999; i++) {
    const disc = String(i).padStart(4, '0');
    if (!(await isTaken(disc))) {
      doc.discriminator = disc;
      return;
    }
  }

  throw new Error('DISCRIMINATOR_EXHAUSTED');
});

export default mongoose.model<IUser>('User', UserSchema);
