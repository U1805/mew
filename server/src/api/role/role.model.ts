import { Document, Schema, model } from 'mongoose';
import { Permission } from '../../constants/permissions';

export interface IRole extends Document {
  name: string;
  serverId: Schema.Types.ObjectId;
  permissions: Permission[];
  color: string;
  position: number;
  isDefault: boolean;
}

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true },
    serverId: {
      type: Schema.Types.ObjectId,
      ref: 'Server',
      required: true,
      index: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    color: {
      type: String,
      default: '#99AAB5',
    },
    position: {
      type: Number,
      required: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

export default model<IRole>('Role', RoleSchema);
