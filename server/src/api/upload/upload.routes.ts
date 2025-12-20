import { Router } from 'express';
import { authorizeChannel } from '../../middleware/checkPermission';
import { uploadAttachment } from '../../middleware/upload';
import * as uploadController from './upload.controller';

const router = Router({ mergeParams: true });

// Route: /api/channels/:channelId/uploads
router.post(
  '/',
  authorizeChannel('ATTACH_FILES'),
  uploadAttachment.single('file'),
  uploadController.uploadFileHandler
);

export default router;
