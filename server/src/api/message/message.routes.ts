import { Router } from 'express';
import {
  addReactionHandler,
  createMessageHandler,
  deleteMessageHandler,
  getMessagesHandler,
  removeReactionHandler,
  updateMessageHandler,
} from './message.controller';
import { protect } from '../../middleware/auth';
import { authorizeChannel } from '../../middleware/checkPermission';

const router = Router({ mergeParams: true });

router.use(protect);

router.post('/', authorizeChannel('SEND_MESSAGES'), createMessageHandler);
router.get('/', getMessagesHandler);
router.patch('/:messageId', updateMessageHandler);
router.delete('/:messageId', deleteMessageHandler);

router.put('/:messageId/reactions/:emoji/@me', addReactionHandler);
router.delete('/:messageId/reactions/:emoji/@me', removeReactionHandler);

export default router;
