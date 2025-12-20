import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  serverId: mongoose.Types.ObjectId;
  position?: number;
}

const CategorySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    serverId: { type: Schema.Types.ObjectId, ref: 'Server', required: true },
    position: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model<ICategory>('Category', CategorySchema);
