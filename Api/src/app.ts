import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config } from './config.js';
import { authenticate, verifyMutationOrigin } from './middleware.js';
import { errorHandler, HttpError, notFound } from './http.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { memberRouter } from './routes/member.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin(origin, callback) {
    if (!origin || config().allowedOrigins.includes(origin)) return callback(null, true);
    callback(new HttpError(403, 'Request origin is not allowed.'));
  }, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(authenticate);
  app.use(verifyMutationOrigin);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', database: ready ? 'connected' : 'disconnected' });
  });
  app.use('/v1/auth', authRouter);
  app.use('/v1/admin', adminRouter);
  app.use('/v1/member', memberRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
