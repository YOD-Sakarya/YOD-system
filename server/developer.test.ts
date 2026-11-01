import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query } from './db.js';
import {
  canDelete,
  canEditDocument,
  canManageVotes,
  DEVELOPER_ROLE_ID,
  sessionVersion,
  type Actor,
} from './security.js';
import { toUsage, usageLevel } from './services/storageUsage.js';

const storedHash = 'stored-password-hash';
const developer: Actor = { userId: 1, fullName: 'Dev', roleId: DEVELOPER_ROLE_ID, roleName: 'مطوّر' };
const president: Actor = { userId: 2, fullName: 'President', roleId: 1, roleName: 'رئيس' };
const cookieFor = (actor: Actor) =>
  'yod_session=' +
  jwt.sign({ sub: String(actor.userId), ver: sessionVersion(storedHash) }, config.jwtSecret, {
    issuer: 'yod-express',
    audience: 'yod-react',
    expiresIn: '1m',
  });

async function withActor(actor: Actor, run: (base: string) => Promise<void>, handler?: (sql: string) => unknown[]) {
  const database = (async (sql: string) => {
    if (sql.includes('WHERE u."UserId"=$1')) return [{ ...actor, passwordHash: storedHash }];
    return handler ? handler(sql) : [];
  }) as unknown as typeof query;
  const server = createApp({ authProvider: 'legacy', query: database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('only the developer can delete; the developer can edit, manage votes and everything else', () => {
  assert.equal(canDelete(developer), true);
  assert.equal(canDelete(president), false);
  assert.equal(canEditDocument(developer, 999), true);
  assert.equal(canManageVotes(developer), true);
});

test('user administration, cycle creation and storage are closed to non-developers', async () => {
  await withActor(president, async base => {
    const headers = { Cookie: cookieFor(president), Origin: base, 'Content-Type': 'application/json' };
    for (const [method, path] of [
      ['GET', '/api/users'],
      ['POST', '/api/users'],
      ['PUT', '/api/users/5'],
      ['GET', '/api/storage'],
      ['POST', '/api/cycles'],
    ]) {
      const response = await fetch(base + path, { method, headers, body: method === 'GET' ? undefined : '{}' });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
  });
});

test('leadership cannot delete documents or vote sessions', async () => {
  await withActor(
    president,
    async base => {
      const headers = { Cookie: cookieFor(president), Origin: base };
      for (const path of ['/api/documents/3', '/api/votes/3']) {
        const response = await fetch(base + path, { method: 'DELETE', headers });
        assert.equal(response.status, 403, path);
      }
    },
    sql => (sql.includes('FROM "Documents"') ? [{ DocId: 3, OwnerUserId: 2 }] : []),
  );
});

test('a session cookie stops working once the stored password changes', async () => {
  const stale = cookieFor(developer);
  const database = (async (sql: string) =>
    sql.includes('WHERE u."UserId"=$1')
      ? [{ ...developer, passwordHash: 'a-different-hash' }]
      : []) as unknown as typeof query;
  const server = createApp({ authProvider: 'legacy', query: database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, { headers: { Cookie: stale } });
    assert.equal(response.status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('storage levels warn at 75%, go critical at 90% and are full at 100%', () => {
  assert.equal(usageLevel(10), 'ok');
  assert.equal(usageLevel(75), 'warning');
  assert.equal(usageLevel(90), 'critical');
  assert.equal(usageLevel(100), 'full');
  assert.deepEqual(toUsage(50, 200), { usedBytes: 50, limitBytes: 200, percent: 25, level: 'ok' });
  assert.equal(toUsage(10, 0).percent, 0);
});
