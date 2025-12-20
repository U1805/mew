import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { uploadImage } from '../../middleware/upload';
import * as WebhookController from './webhook.controller';

const router = Router({ mergeParams: true });

router.use(protect);

router.route('/')
  .get(WebhookController.getWebhooks)
  .post(uploadImage.single('avatar'), WebhookController.createWebhook);

router.route('/:webhookId')
  .patch(uploadImage.single('avatar'), WebhookController.updateWebhook)
  .delete(WebhookController.deleteWebhook);

export default router;
