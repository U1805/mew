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

const router = Router({ mergeParams: true });

// All routes are protected
router.use(protect);

router.post('/', createMessageHandler);
router.get('/', getMessagesHandler);
router.patch('/:messageId', updateMessageHandler);
router.delete('/:messageId', deleteMessageHandler);

router.put('/:messageId/reactions/:emoji/@me', addReactionHandler);
router.delete('/:messageId/reactions/:emoji/@me', removeReactionHandler);

export default router;
