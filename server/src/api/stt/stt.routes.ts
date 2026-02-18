import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { uploadTransient } from '../../middleware/upload';
import { createTranscription } from './stt.controller';

const router = Router();

router.post('/', protect, uploadTransient.single('file'), createTranscription);

export default router;

