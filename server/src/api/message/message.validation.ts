import { z } from 'zod';

export const getMessagesSchema = z.object({
  query: z.object({
    limit: z.preprocess(
      (val) => (val ? parseInt(val as string, 10) : 50),
      z.number().min(1).max(100).default(50)
    ),
    before: z.string().optional(), // Expecting a message ID (MongoDB ObjectId)
  }),
});

const attachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  key: z.string().min(1, 'Attachment key cannot be empty'),
  size: z.number(),
});

export const createMessageSchema = z.object({
  body: z
    .object({
      content: z.string().optional(), // Content can be optional if there are attachments
      // Voice-message plaintext (sender-provided or STT result). Allow both camelCase and bot-friendly dashed key.
      plainText: z.string().optional(),
      'plain-text': z.string().optional(),
      attachments: z.array(attachmentSchema).optional(),
      referencedMessageId: z.string().optional(),
      type: z.string().optional(),
      payload: z.any().optional(),
    })
    .refine(
      (data) => {
        const hasContent = !!(data.content && data.content.trim() !== '');
        const hasAttachments = !!(data.attachments && data.attachments.length > 0);

        if (data.type === 'app/x-forward-card') {
          const forwarded = (data.payload as any)?.forwardedMessage;
          return !!(forwarded && typeof forwarded === 'object');
        }

        if (data.type === 'message/voice') {
          const voice = (data.payload as any)?.voice;
          const key = typeof voice?.key === 'string' ? voice.key.trim() : '';
          const contentType = typeof voice?.contentType === 'string' ? voice.contentType.trim() : '';
          const size = typeof voice?.size === 'number' ? voice.size : Number.NaN;
          const durationMs =
            voice?.durationMs == null ? null : (typeof voice.durationMs === 'number' ? voice.durationMs : Number.NaN);

          const okDuration = durationMs == null || (Number.isFinite(durationMs) && durationMs > 0);
          return !!(key && contentType && Number.isFinite(size) && size > 0 && okDuration);
        }

        // Allow non-default typed messages (e.g. webhook cards) to be created without content/attachments.
        if (data.type && data.type !== 'message/default') {
          return !!data.payload;
        }

        return hasContent || hasAttachments;
      },
      {
        message: 'A message must have either content or at least one attachment.',
      }
    ),
});

export const updateMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
  }),
});
