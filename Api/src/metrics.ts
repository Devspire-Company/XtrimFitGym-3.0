import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';

const startedAt = Date.now();
const requests = new Map<string, number>();
let durationMilliseconds = 0;

export function recordMetrics(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();
  res.once('finish', () => {
    const key = `${req.method}:${res.statusCode}`;
    requests.set(key, (requests.get(key) ?? 0) + 1);
    durationMilliseconds += performance.now() - start;
  });
  next();
}

export function metricsHandler(req: Request, res: Response) {
  const token = config().MONITORING_TOKEN;
  if (!token || req.get('x-monitoring-token') !== token) return res.status(404).json({ message: 'Not found.' });
  const total = [...requests.values()].reduce((sum, value) => sum + value, 0);
  const lines = [
    '# HELP xtrim_uptime_seconds Process uptime.', '# TYPE xtrim_uptime_seconds gauge', `xtrim_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    '# HELP xtrim_database_ready MongoDB connection readiness.', '# TYPE xtrim_database_ready gauge', `xtrim_database_ready ${mongoose.connection.readyState === 1 ? 1 : 0}`,
    '# HELP xtrim_http_requests_total HTTP responses.', '# TYPE xtrim_http_requests_total counter',
    ...[...requests.entries()].map(([key, value]) => { const [method, status] = key.split(':'); return `xtrim_http_requests_total{method="${method}",status="${status}"} ${value}`; }),
    '# HELP xtrim_http_duration_milliseconds_total Accumulated request duration.', '# TYPE xtrim_http_duration_milliseconds_total counter', `xtrim_http_duration_milliseconds_total ${durationMilliseconds.toFixed(3)}`,
    '# HELP xtrim_http_requests_observed Requests included in duration.', '# TYPE xtrim_http_requests_observed counter', `xtrim_http_requests_observed ${total}`,
  ];
  res.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`);
}
