import mongoose, { Schema, Document } from 'mongoose';

export interface IServer extends Document {
  name: string;
  avatarUrl?: string;
  everyoneRoleId: mongoose.Types.ObjectId;
}

const ServerSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    avatarUrl: { type: String },
    everyoneRoleId: { type: Schema.Types.ObjectId, ref: 'Role' },
  },
  { timestamps: true }
);

export default mongoose.model<IServer>('Server', ServerSchema);
