import { Router } from 'express';
import messageRoutes from '../message/message.routes';
import { protect } from '../../middleware/auth';
// You might want to add a middleware to check if the user is a recipient of the DM channel
// For now, we'll just protect it.

const router = Router();

// Protect all DM channel routes
router.use(protect);

// Mount message routes for DMs
import { ackChannelHandler } from './channel.controller';
import { ackChannelSchema } from './channel.validation';
import validate from '../../middleware/validate';

// This will handle routes like /api/channels/:channelId/messages
router.use('/:channelId/messages', messageRoutes);

router.post('/:channelId/ack', validate(ackChannelSchema), ackChannelHandler);


export default router;
