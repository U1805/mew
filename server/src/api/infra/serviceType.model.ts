import mongoose, { Schema, Document } from 'mongoose';

export interface IServiceType extends Document {
  name: string;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceTypeSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IServiceType>('ServiceType', ServiceTypeSchema);

