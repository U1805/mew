import mongoose, { Schema, Document } from 'mongoose';

export interface IServer extends Document {
  name: string;
  avatarUrl?: string;
}

const ServerSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    avatarUrl: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IServer>('Server', ServerSchema);
