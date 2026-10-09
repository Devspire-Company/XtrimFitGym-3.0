import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db.js';

async function start(): Promise<void> {
  await connectDatabase();
  const server = createApp().listen(config().PORT, () => console.log(`XtrimFitGym 3.0 API listening on port ${config().PORT}`));
  const shutdown = async (signal: string) => {
    console.log(`${signal} received; shutting down.`);
    server.close(async () => { await disconnectDatabase(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((error) => { console.error('API startup failed:', error); process.exit(1); });

