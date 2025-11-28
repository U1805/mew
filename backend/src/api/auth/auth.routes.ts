import { Router } from 'express';
import { registerHandler, loginHandler } from './auth.controller.js';
import validate from '../../middleware/validate.js';
import { registerSchema, loginSchema } from './auth.validation.js';

const router = Router();

router.post('/register', validate(registerSchema), registerHandler);
router.post('/login', validate(loginSchema), loginHandler);

export default router;

