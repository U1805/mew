import { Router } from 'express';
import {
  addReactionHandler,
  createMessageHandler,
  deleteMessageHandler,
  getMessagesHandler,
  removeReactionHandler,
  transcribeVoiceMessageHandler,
  updateMessageHandler,
} from './message.controller';
import { protect } from '../../middleware/auth';
import { authorizeChannel } from '../../middleware/checkPermission';
import { uploadTransient } from '../../middleware/upload';

const router = Router({ mergeParams: true });

router.use(protect);

router.post('/', authorizeChannel('SEND_MESSAGES'), createMessageHandler);
router.get('/', authorizeChannel('VIEW_CHANNEL'), getMessagesHandler);
router.patch('/:messageId', updateMessageHandler);
router.delete('/:messageId', deleteMessageHandler);

router.post('/:messageId/transcribe', uploadTransient.single('file'), transcribeVoiceMessageHandler);

router.put('/:messageId/reactions/:emoji/@me', addReactionHandler);
router.delete('/:messageId/reactions/:emoji/@me', removeReactionHandler);

export default router;
