import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import { query, transaction } from './db.js';
import { hashPassword, type Actor } from './security.js';
type Query = (sql: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
const member: Actor = { userId: 25, fullName: 'Test user', roleId: 7, roleName: 'Activities' };
const signature = { issuer: 'yod-express', audience: 'yod-react' };
const token = () => jwt.sign({ sub: String(member.userId) }, config.jwtSecret, { ...signature, expiresIn: '1m' });
async function withServer(run: (base: string) => Promise<void>, database: Query = async () => { throw new Error('Unexpected database access'); }, tx?: typeof transaction) {
  const app = createApp({ authProvider: 'legacy', query: database as typeof query, ...(tx ? { transaction: tx } : {}) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
test('protected resources reject anonymous requests before querying the database', async () => {
  await withServer(async base => {
    for (const endpoint of ['/auth/me', '/catalog', '/documents', '/votes']) {
      const response = await fetch(base + '/api' + endpoint);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('x-powered-by'), null);
    }
  });
});
test('CSRF origin checks protect every mutation including login and logout', async () => {
  await withServer(async base => {
    for (const endpoint of ['/auth/login', '/auth/logout', '/documents', '/reviews', '/votes']) {
      for (const origin of [undefined, 'https://attacker.example']) {
        const response = await fetch(base + '/api' + endpoint, { method: 'POST', headers: origin ? { Origin: origin } : {} });
        assert.equal(response.status, 403);
      }
    }
  });
});
test('invalid request JSON and login values return actionable 400 errors', async () => {
  await withServer(async base => {
    for (const body of ['{broken', '{}']) {
      const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, 400); assert.ok((await response.json()).message);
    }
  });
});
test('invalid, expired and wrong-audience sessions cannot authenticate', async () => {
  await withServer(async base => {
    const cookies = ['invalid-token', jwt.sign({ sub: '25' }, config.jwtSecret, { ...signature, expiresIn: -1 }),
      jwt.sign({ sub: '25' }, config.jwtSecret, { issuer: signature.issuer, audience: 'other-app' })];
    for (const cookie of cookies) {
      const response = await fetch(base + '/api/auth/me', { headers: { Cookie: `yod_session=${cookie}` } });
      assert.equal(response.status, 401);
    }
  });
});
test('login issues an HTTP-only scoped session and never exposes passwords or token in JSON', async () => {
  const password = hashPassword('a test password');
  await withServer(async base => {
    const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'a test password' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), member);
    const cookie = response.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Path=\/api/i);
  }, async (sql, values) => { assert.match(sql, /PasswordHash/); assert.deepEqual(values, ['tester']); return [{ ...member, password }]; });
});
test('current role comes from database and committee members cannot review or create ballots', async () => {
  await withServer(async base => {
    for (const endpoint of ['/reviews', '/votes']) {
      const response = await fetch(base + '/api' + endpoint, { method: 'POST', headers: { Origin: config.origin, Cookie: `yod_session=${token()}`, 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 403);
    }
  }, async sql => { assert.match(sql, /WHERE u\."UserId"=\$1/); return [member]; });
});
test('malformed document filters cannot reach SQL, and valid filters stay parameterized', async () => {
  const calls: unknown[][] = [];
  await withServer(async base => {
    const headers = { Cookie: `yod_session=${token()}` };
    const invalid = await fetch(base + '/api/documents?roleId=1%20OR%201%3D1', { headers });
    assert.equal(invalid.status, 400); assert.equal(calls.length, 0);
    const valid = await fetch(base + '/api/documents?roleId=7', { headers });
    assert.equal(valid.status, 200); assert.deepEqual(calls, [[7]]);
  }, async (sql, values) => { if (sql.includes('AS reviews')) { calls.push(values || []); return []; } return [member]; });
});
test('registration ignores supplied leadership role and writes only a salted observer account', async () => {
  const inserts: { sql: string; values: unknown[] }[] = [];
  const fakeTransaction = (async work => work({ query: async (sql: string, values: unknown[] = []) => {
    if (sql.includes('INSERT INTO')) inserts.push({ sql, values });
    return { rows: [], rowCount: 0 };
  } } as never)) as typeof transaction;
  await withServer(async base => {
    const response = await fetch(base + '/api/auth/register', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: 'Test member', username: 'new-user', email: 'test@example.com', phoneWhatsapp: '', password: 'a long password', roleId: 1 }) });
    assert.equal(response.status, 201); assert.equal(inserts.length, 1);
    assert.match(inserts[0].sql, /VALUES \(10,/);
    assert.match(String(inserts[0].values[4]), /^scrypt:/);
    assert.notEqual(inserts[0].values[4], 'a long password');
  }, undefined, fakeTransaction);
});
