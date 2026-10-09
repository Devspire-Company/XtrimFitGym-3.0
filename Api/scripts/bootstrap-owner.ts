import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { Account } from '../src/models.js';
import { hashPassword, normalizeUsername } from '../src/security.js';

async function main() {
  const [username, password, firstName, lastName] = process.argv.slice(2);
  if (!username || !password || !firstName || !lastName) throw new Error('Usage: npm run bootstrap:owner -- <username> <strong-password> <first-name> <last-name>');
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw new Error('Password must be at least 10 characters and include lowercase, uppercase, and a number.');
  await connectDatabase();
  if (await Account.exists({ role: 'OWNER' })) throw new Error('An owner account already exists. Create additional admins through the owner-only API.');
  const account = await Account.create({ username: normalizeUsername(username), passwordHash: await hashPassword(password), role: 'OWNER', firstName, lastName, mustChangePassword: false });
  console.log(`Owner created: ${account.username}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);

