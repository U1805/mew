import { Router } from 'express';
import {
  getAuthConfigHandler,
  registerHandler,
  registerCookieHandler,
  loginHandler,
  loginCookieHandler,
  botLoginHandler,
  refreshHandler,
  refreshCookieHandler,
  logoutHandler,
} from './auth.controller';
import validate from '../../middleware/validate';
import { registerSchema, loginSchema, botLoginSchema } from './auth.validation';
import { csrfCookieHandler, requireCsrf } from '../../middleware/csrf';

const router = Router();

router.get('/config', getAuthConfigHandler);
router.get('/csrf', csrfCookieHandler);
router.post('/register', requireCsrf, validate(registerSchema), registerHandler);
router.post('/register-cookie', requireCsrf, validate(registerSchema), registerCookieHandler);
router.post('/login', requireCsrf, validate(loginSchema), loginHandler);
router.post('/login-cookie', requireCsrf, validate(loginSchema), loginCookieHandler);
router.post('/bot', requireCsrf, validate(botLoginSchema), botLoginHandler);
router.post('/refresh', requireCsrf, refreshHandler);
router.post('/refresh-cookie', requireCsrf, refreshCookieHandler);
router.post('/logout', requireCsrf, logoutHandler);

export default router;
