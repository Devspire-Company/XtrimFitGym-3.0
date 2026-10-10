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
const { verifyMutationOrigin } = await import('../src/middleware.js');
const { Account } = await import('../src/models.js');

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

test('password hashes are excluded from account queries by default', () => {
  assert.equal(Account.schema.path('passwordHash').options.select, false);
});

test('state-changing requests require an allowed origin and the CSRF request header', () => {
  const invoke = (origin?: string, verification?: string) => {
    let forwarded: unknown;
    const headers: Record<string, string | undefined> = {
      origin,
      'x-xtrim-request': verification,
    };
    verifyMutationOrigin(
      { method: 'POST', get: (name: string) => headers[name.toLowerCase()] } as never,
      {} as never,
      ((error?: unknown) => { forwarded = error ?? null; }) as never,
    );
    return forwarded;
  };

  assert.equal(invoke('http://localhost:3100', '1'), null);
  assert.equal((invoke('https://attacker.example', '1') as { status: number }).status, 403);
  assert.equal((invoke('http://localhost:3100') as { status: number }).status, 403);
});
