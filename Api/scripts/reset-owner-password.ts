import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { Account, AuthSession } from '../src/models.js';
import { hashPassword, normalizeUsername } from '../src/security.js';

async function main() {
  const [username] = process.argv.slice(2);
  const password = process.env.RESET_OWNER_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'Set RESET_OWNER_PASSWORD in .env.local, then run: npm run reset:owner-password -- <username>',
    );
  }

  if (
    password.length < 10
    || !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
  ) {
    throw new Error(
      'Password must be at least 10 characters and include lowercase, uppercase, and a number.',
    );
  }

  await connectDatabase();

  const account = await Account.findOne({
    username: normalizeUsername(username),
    role: 'OWNER',
    isActive: true,
  }).select('+passwordHash').exec();

  if (!account) {
    throw new Error('An active owner account with that username was not found.');
  }

  account.passwordHash = await hashPassword(password);
  account.mustChangePassword = false;
  await account.save();
  await AuthSession.deleteMany({ accountId: account._id });

  console.log(`Owner password reset: ${account.username}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
