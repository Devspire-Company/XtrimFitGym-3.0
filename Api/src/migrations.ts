import mongoose from 'mongoose';
import './models.js';
import { log } from './logger.js';

type Migration = { id: string; run: () => Promise<void> };

const migrations: Migration[] = [
  {
    id: '2026-10-12-create-declared-indexes',
    run: async () => {
      await mongoose.connection.collection('cashclosings').dropIndex('businessDate_1').catch((error: { code?: number; codeName?: string }) => {
        if (error.code !== 26 && error.code !== 27 && error.codeName !== 'NamespaceNotFound' && error.codeName !== 'IndexNotFound') throw error;
      });
      await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
    },
  },
];

export async function runMigrations() {
  const records = mongoose.connection.collection('_migrations');
  for (const migration of migrations) {
    if (await records.findOne({ _id: migration.id as never })) continue;
    log('info', 'migration_started', { migrationId: migration.id });
    await migration.run();
    await records.insertOne({ _id: migration.id as never, appliedAt: new Date() });
    log('info', 'migration_completed', { migrationId: migration.id });
  }
}
