import assert from 'node:assert/strict';
import test from 'node:test';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test';
process.env.MONGODB_DATABASE = 'test';
process.env.SESSION_SECRET = 'session-secret-with-at-least-32-characters';
process.env.PASSWORD_PEPPER = 'password-pepper-with-at-least-32-characters';
process.env.ALLOWED_ORIGINS = 'http://localhost:3100,http://localhost:3200';
process.env.ADMIN_APP_ORIGIN = 'http://localhost:3100';
process.env.MEMBER_APP_ORIGIN = 'http://localhost:3200';

const security = await import('../src/security.js');

test('password hashes do not contain the password and can be verified', async () => {
  const password = 'StrongPassword9';
  const hash = await security.hashPassword(password);
  assert.equal(hash.includes(password), false);
  assert.equal(await security.verifyPassword(password, hash), true);
  assert.equal(await security.verifyPassword('WrongPassword9', hash), false);
});

test('card UIDs are normalized consistently', () => {
  assert.equal(security.normalizeCardUid('04:a1-b2 c3'), '04A1B2C3');
});

test('opaque tokens are one-way hashed', () => {
  const token = security.randomToken();
  assert.notEqual(security.tokenHash(token), token);
  assert.notEqual(security.portalTokenHash(token), security.tokenHash(token));
});

