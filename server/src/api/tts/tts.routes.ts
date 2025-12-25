import { Router } from 'express';
import { protect } from '../../middleware/auth';
import { synthesizeTts } from './tts.controller';

const router = Router();

router.post('/', protect, synthesizeTts);

export default router;

