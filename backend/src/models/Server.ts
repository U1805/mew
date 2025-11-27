import mongoose, { Schema, Document } from 'mongoose';

export interface IServer extends Document {
  name: string;
  avatarUrl?: string;
  ownerId: mongoose.Types.ObjectId;
}

const ServerSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    avatarUrl: { type: String },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IServer>('Server', ServerSchema);
