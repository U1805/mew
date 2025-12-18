import mongoose, { Schema, Document } from 'mongoose';

export interface IAttachment {
  filename: string;
  contentType: string;
  key: string;
  size: number;
  url?: string; // Dynamically added, not stored in DB
}

export interface IEmbed {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
  mediaType?: string;
  contentType?: string;
  videos?: any[];
  favicons?: string[];
}

export interface IMessagePayload {
  overrides?: {
    username?: string;
    avatarUrl?: string;
  };
  embeds?: IEmbed[];
  [key: string]: any;
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
  payload?: IMessagePayload;
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
  key: { type: String, required: true },
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
    content: { type: String },
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

MessageSchema.index({ content: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);