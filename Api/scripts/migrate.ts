import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { log } from '../src/logger.js';

try {
  await connectDatabase();
  await runMigrations();
  log('info', 'migrations_current');
} catch (error) {
  log('error', 'migration_failed', { error });
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
