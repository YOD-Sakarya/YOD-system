import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query } from './db.js';
import { hashPassword, sessionVersion, verifyPassword, type Actor } from './security.js';

const actor: Actor = { userId: 7, fullName: 'Member', roleId: 7, roleName: 'أنشطة' };
const OLD = 'old password 123';

/** One in-memory account behind the real routes, so password/email changes can be observed. */
async function withAccount(run: (base: string, state: { hash: string; email: string }) => Promise<void>) {
  const state = { hash: hashPassword(OLD), email: 'me@example.com' };
  const database = (async (sql: string, values: unknown[] = []) => {
    if (sql.includes('FROM "Users" u JOIN "Roles"')) return [{ ...actor, passwordHash: state.hash }];
    if (sql.includes('AS "passwordHash" FROM "Users" WHERE'))
      return [
        { fullName: 'Member', username: 'member', email: state.email, phoneWhatsapp: '', passwordHash: state.hash },
      ];
    if (sql.startsWith('UPDATE "Users" SET "PasswordHash"')) state.hash = String(values[0]);
    if (sql.startsWith('UPDATE "Users" SET "Email"')) state.email = String(values[0]);
    if (sql.includes('lower(btrim("Email"))=lower($1)'))
      return String(values[0]).toLowerCase() === 'taken@example.com' ? [{}] : [];
    return [];
  }) as unknown as typeof query;
  const server = createApp({ authProvider: 'legacy', query: database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  try {
    await run(`http://127.0.0.1:${address.port}`, state);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
const cookieFor = (hash: string) =>
  'yod_session=' +
  jwt.sign({ sub: String(actor.userId), ver: sessionVersion(hash) }, config.jwtSecret, {
    issuer: 'yod-express',
    audience: 'yod-react',
    expiresIn: '1m',
  });
const send = (base: string, path: string, cookie: string, body: unknown) =>
  fetch(base + '/api/account' + path, {
    method: 'PUT',
    headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('changing the password needs the current one, and a wrong one is 403 (never a forced sign-out)', async () => {
  await withAccount(async (base, state) => {
    const before = state.hash;
    const wrong = await send(base, '/password', cookieFor(state.hash), {
      currentPassword: 'nope nope nope',
      newPassword: 'brand new password 1',
    });
    assert.equal(wrong.status, 403);
    assert.equal(state.hash, before, 'nothing changed');
    const same = await send(base, '/password', cookieFor(state.hash), { currentPassword: OLD, newPassword: OLD });
    assert.equal(same.status, 400);
    const short = await send(base, '/password', cookieFor(state.hash), { currentPassword: OLD, newPassword: 'short' });
    assert.equal(short.status, 400);
  });
});

test('a successful password change is stored hashed, keeps this session and ends older ones', async () => {
  await withAccount(async (base, state) => {
    const oldCookie = cookieFor(state.hash);
    const response = await send(base, '/password', oldCookie, {
      currentPassword: OLD,
      newPassword: 'brand new password 1',
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') ?? '', /yod_session=/);
    assert.match(state.hash, /^scrypt:/);
    assert.equal(verifyPassword('brand new password 1', state.hash), true);
    assert.equal(verifyPassword(OLD, state.hash), false);
    // The cookie issued before the change no longer works...
    assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: oldCookie } })).status, 401);
    // ...while the new one does.
    assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: cookieFor(state.hash) } })).status, 200);
  });
});

test('changing the email needs the current password and refuses an email another account uses', async () => {
  await withAccount(async (base, state) => {
    const cookie = cookieFor(state.hash);
    assert.equal(
      (await send(base, '/email', cookie, { email: 'new@example.com', currentPassword: 'wrong wrong' })).status,
      403,
    );
    assert.equal(state.email, 'me@example.com');
    assert.equal(
      (await send(base, '/email', cookie, { email: 'taken@example.com', currentPassword: OLD })).status,
      409,
    );
    assert.equal((await send(base, '/email', cookie, { email: 'not-an-email', currentPassword: OLD })).status, 400);
    assert.equal((await send(base, '/email', cookie, { email: 'new@example.com', currentPassword: OLD })).status, 200);
    assert.equal(state.email, 'new@example.com');
  });
});

test('the account endpoint returns the profile without the password hash', async () => {
  await withAccount(async (base, state) => {
    const response = await fetch(base + '/api/account', { headers: { Cookie: cookieFor(state.hash) } });
    assert.equal(response.status, 200);
    const profile = await response.json();
    assert.equal(profile.email, 'me@example.com');
    assert.equal(profile.canChangeCredentials, true);
    assert.equal('passwordHash' in profile, false);
  });
});
