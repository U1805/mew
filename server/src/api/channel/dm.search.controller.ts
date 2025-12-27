import type { Request, Response } from 'express';
import asyncHandler from '../../utils/asyncHandler';
import Channel from './channel.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { searchMessagesInChannel } from '../search/search.service';

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string; [key: string]: any };
}

export const searchDmMessagesHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const { channelId } = req.params;

    if (!userId) throw new ForbiddenError('Authentication required.');
    if (!channelId) throw new BadRequestError('Channel ID is required.');

    const channel = await Channel.findById(channelId).select('type recipients').lean();
    if (!channel) throw new NotFoundError('Channel not found.');

    if (channel.type !== 'DM') {
      throw new BadRequestError('This endpoint only supports DM channels.');
    }

    const isRecipient = Array.isArray(channel.recipients) && channel.recipients.some((id: any) => id.equals(userId));
    if (!isRecipient) throw new ForbiddenError('You are not a recipient of this DM channel.');

    const q = String((req.query as any)?.q ?? '');
    const limit = Number((req.query as any)?.limit ?? 20);
    const page = Number((req.query as any)?.page ?? 1);

    const result = await searchMessagesInChannel({
      channelId,
      query: q,
      limit,
      page,
    });

    res.json(result);
  }
);

