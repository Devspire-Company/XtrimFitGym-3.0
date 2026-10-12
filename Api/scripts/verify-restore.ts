import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { log } from '../src/logger.js';

function run(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

function fileHash(path: string) {
  return new Promise<string>((resolvePromise, reject) => {
    const hash = createHash('sha256'); const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk)); stream.once('error', reject); stream.once('end', () => resolvePromise(hash.digest('hex')));
  });
}

const archiveArgument = process.argv[2];
if (!archiveArgument) throw new Error('Usage: npm run backup:verify -- <archive-path>');
const archive = resolve(archiveArgument); await access(archive);
const manifest = JSON.parse(await readFile(`${archive}.json`, 'utf8')) as { sha256?: string; database?: string };
const actualHash = await fileHash(archive);
if (!manifest.sha256 || manifest.sha256 !== actualHash) throw new Error('Backup checksum does not match its manifest.');
const environment = config(); const restoreDatabase = process.env.RESTORE_DATABASE;
if (manifest.database !== environment.MONGODB_DATABASE) throw new Error('Backup manifest database does not match MONGODB_DATABASE.');
if (!restoreDatabase || !/^[A-Za-z0-9_-]+_restore_check$/.test(restoreDatabase)) throw new Error('RESTORE_DATABASE must be a dedicated database name ending in _restore_check.');
if (restoreDatabase === environment.MONGODB_DATABASE) throw new Error('Restore verification cannot target the live database.');
await run('mongorestore', ['--uri', environment.MONGODB_URI, '--archive', archive, '--gzip', '--nsFrom', `${environment.MONGODB_DATABASE}.*`, '--nsTo', `${restoreDatabase}.*`, '--drop']);
await mongoose.connect(environment.MONGODB_URI, { dbName: restoreDatabase, serverSelectionTimeoutMS: 10_000 });
try {
  const names = new Set((await mongoose.connection.db!.listCollections().toArray()).map((item) => item.name));
  const required = ['accounts', 'payments', 'members', 'memberships', 'auditlogs']; const missing = required.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Restore is missing required collections: ${missing.join(', ')}`);
  const counts = Object.fromEntries(await Promise.all(required.map(async (name) => [name, await mongoose.connection.db!.collection(name).countDocuments()] as const)));
  log('info', 'restore_verified', { archive, restoreDatabase, counts });
} finally { await mongoose.disconnect(); }
