import mongoose, { Schema, Document } from 'mongoose';

export interface IServiceType extends Document {
  name: string;
  serverName?: string;
  icon?: string;
  description?: string;
  configTemplate?: string;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceTypeSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    serverName: { type: String, default: '' },
    icon: { type: String, default: '' },
    description: { type: String, default: '' },
    configTemplate: { type: String, default: '' },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IServiceType>('ServiceType', ServiceTypeSchema);

