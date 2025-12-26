import express from 'express';
import type { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config';

import authRoutes from './api/auth/auth.routes';
import userRoutes from './api/user/user.routes';
import serverRoutes from './api/server/server.routes';
import roleRoutes from './api/role/role.routes';
import { categoryRootRoutes, categoryDetailRoutes } from './api/category/category.routes';
import invitePublicRoutes from './api/invite/public.routes';
import dmChannelRoutes from './api/channel/dm.routes';
import uploadRoutes from './api/upload/upload.routes';
import publicWebhookRoutes from './api/webhook/public.routes';
import infraRoutes from './api/infra/infra.routes';
import botBootstrapRoutes from './api/bot/bot.bootstrap.routes';
import botSelfRoutes from './api/bot/bot.self.routes';
import healthRoutes from './api/health/health.routes';
import ttsRoutes from './api/tts/tts.routes';
import { errorHandler } from './utils/errorHandler';

const app = express();

app.set('trust proxy', config.trustProxy);

app.use(
  helmet({
    // The SPA is served by Nginx; keep CSP out of the API server by default to avoid breaking embeds.
    contentSecurityPolicy: false,
  })
);

// Basic abuse protection (in-memory). For multi-instance deployments, replace with a shared store (Redis, etc).
const enableRateLimit = process.env.NODE_ENV === 'production' || process.env.MEW_ENABLE_RATE_LIMIT === 'true';
const apiLimiter = enableRateLimit
  ? rateLimit({
      windowMs: 5 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  : null;

const authLimiter = enableRateLimit
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
    })
  : null;

const corsOrigin: cors.CorsOptions['origin'] = (origin, cb) => {
  // Non-browser clients (curl, internal services) may omit Origin.
  if (!origin) return cb(null, true);

  if (config.cors.allowAnyOrigin) return cb(null, true);
  if (config.cors.allowedOrigins.includes(origin)) return cb(null, true);

  // Disallow cross-origin by omitting CORS headers.
  return cb(null, false);
};

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Mew-Admin-Secret'],
    exposedHeaders: ['Content-Length'],
    maxAge: 86400,
  })
);
app.use(express.json({ limit: '1mb' }));

// express-rate-limit's handler type currently doesn't line up with Express 5's `app.use` overloads.
// Cast to Express' RequestHandler to keep runtime behavior while satisfying TypeScript.
if (apiLimiter) app.use('/api', apiLimiter as unknown as RequestHandler);
if (authLimiter) app.use('/api/auth', authLimiter as unknown as RequestHandler);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers/:serverId/roles', roleRoutes);
app.use('/api/channels', dmChannelRoutes);
app.use('/api/servers/:serverId/categories', categoryRootRoutes);
app.use('/api/categories', categoryDetailRoutes);
app.use('/api/channels/:channelId/uploads', uploadRoutes);
app.use('/api/invites', invitePublicRoutes);
app.use('/api/webhooks', publicWebhookRoutes);
app.use('/api/bots', botBootstrapRoutes);
app.use('/api/bots', botSelfRoutes);
app.use('/api/infra', infraRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/tts', ttsRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

app.use(errorHandler);

export default app;
