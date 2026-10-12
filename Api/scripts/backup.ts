import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
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

const environment = config();
const directory = resolve(process.env.BACKUP_DIRECTORY || './backups');
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const archive = resolve(directory, `${environment.MONGODB_DATABASE}-${stamp}.archive.gz`);
await mkdir(directory, { recursive: true });
await run('mongodump', ['--uri', environment.MONGODB_URI, '--db', environment.MONGODB_DATABASE, '--archive', archive, '--gzip']);
const [metadata, sha256] = await Promise.all([stat(archive), fileHash(archive)]);
await writeFile(`${archive}.json`, JSON.stringify({ database: environment.MONGODB_DATABASE, createdAt: new Date().toISOString(), archive, bytes: metadata.size, sha256 }, null, 2));
log('info', 'backup_created', { archive, bytes: metadata.size, sha256 });
