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
import { coachRouter } from './routes/coach.js';
import { randomUUID } from 'node:crypto';
import { log } from './logger.js';
import { metricsHandler, recordMetrics } from './metrics.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id')?.slice(0, 100) || randomUUID();
    res.locals.requestId = requestId; res.setHeader('X-Request-Id', requestId);
    const started = performance.now();
    res.once('finish', () => log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http_request', { requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round((performance.now() - started) * 100) / 100 }));
    next();
  });
  app.use(recordMetrics);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin(origin, callback) {
    if (!origin || config().allowedOrigins.includes(origin)) return callback(null, true);
    callback(new HttpError(403, 'Request origin is not allowed.'));
  }, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-XTRIM-Request', 'X-Attendance-Station'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(authenticate);
  app.use(verifyMutationOrigin);
  app.use('/v1', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', database: ready ? 'connected' : 'disconnected' });
  });
  app.get('/metrics', metricsHandler);
  app.use('/v1/auth', authRouter);
  app.use('/v1/admin', adminRouter);
  app.use('/v1/member', memberRouter);
  app.use('/v1/coach', coachRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
