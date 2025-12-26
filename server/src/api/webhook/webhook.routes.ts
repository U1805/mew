import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { authorizeChannel } from '../../middleware/checkPermission';
import { uploadImage } from '../../middleware/upload';
import * as WebhookController from './webhook.controller';

const router = Router({ mergeParams: true });

router.use(protect);
router.use(authorizeChannel('MANAGE_WEBHOOKS'));

router.route('/')
  .get(WebhookController.getWebhooks)
  .post(uploadImage.single('avatar'), WebhookController.createWebhook);

router.get('/:webhookId/token', WebhookController.getWebhookToken);

router.post('/:webhookId/reset-token', WebhookController.resetWebhookToken);

router.route('/:webhookId')
  .patch(uploadImage.single('avatar'), WebhookController.updateWebhook)
  .delete(WebhookController.deleteWebhook);

export default router;
