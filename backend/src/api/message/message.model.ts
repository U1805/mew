import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachment {
  filename: string;
  contentType: string;
  url: string;
  size: number;
}

export interface IReaction {
  emoji: string;
  userIds: mongoose.Types.ObjectId[];
}

export interface IMessage extends Document {
  channelId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  type: string;
  content: string;
  payload?: Record<string, any>;
  attachments?: IAttachment[];
  mentions?: mongoose.Types.ObjectId[];
  referencedMessageId?: mongoose.Types.ObjectId;
  reactions?: IReaction[];
  editedAt?: Date;
  retractedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema: Schema = new Schema({
  filename: { type: String, required: true },
  contentType: { type: String, required: true },
  url: { type: String, required: true },
  size: { type: Number, required: true },
});

const ReactionSchema: Schema = new Schema({
  emoji: { type: String, required: true },
  userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
});

const MessageSchema: Schema = new Schema(
  {
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, default: 'message/default' },
    content: { type: String, required: true },
    payload: { type: Object },
    attachments: [AttachmentSchema],
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    referencedMessageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    reactions: [ReactionSchema],
    editedAt: { type: Date },
    retractedAt: { type: Date },
  },
  { timestamps: true }
);

MessageSchema.index({ content: 'text' });

export default mongoose.model<IMessage>('Message', MessageSchema);