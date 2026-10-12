import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';
import { log } from './logger.js';

async function start(): Promise<void> {
  await connectDatabase();
  const server = createApp().listen(config().PORT, () => log('info', 'server_started', { port: config().PORT, environment: config().NODE_ENV }));
  const shutdown = async (signal: string) => {
    log('info', 'server_shutdown', { signal });
    server.close(async () => { await disconnectDatabase(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((error) => { log('error', 'server_start_failed', { error }); process.exit(1); });
