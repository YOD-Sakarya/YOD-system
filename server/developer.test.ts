import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query, transaction } from './db.js';
import {
  canDelete,
  canEditDocument,
  canManageVotes,
  DEVELOPER_ROLE_ID,
  hashPassword,
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

async function withActor(
  actor: Actor,
  run: (base: string) => Promise<void>,
  handler?: (sql: string) => unknown[],
  tx?: typeof transaction,
) {
  const database = (async (sql: string) => {
    if (sql.includes('WHERE u."UserId"=$1')) return [{ ...actor, passwordHash: storedHash }];
    return handler ? handler(sql) : [];
  }) as unknown as typeof query;
  const server = createApp({ authProvider: 'legacy', query: database, ...(tx ? { transaction: tx } : {}) }).listen(
    0,
    '127.0.0.1',
  );
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
      ['POST', '/api/users/5/reset-password'],
      ['GET', '/api/storage'],
      ['POST', '/api/cycles'],
      ['DELETE', '/api/cycles/1'],
    ]) {
      const response = await fetch(base + path, { method, headers, body: method === 'GET' ? undefined : '{}' });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
  });
});

test("leadership cannot delete other people's documents or any vote session", async () => {
  await withActor(
    president,
    async base => {
      const headers = { Cookie: cookieFor(president), Origin: base };
      for (const path of ['/api/documents/3', '/api/votes/3']) {
        const response = await fetch(base + path, { method: 'DELETE', headers });
        assert.equal(response.status, 403, path);
      }
    },
    sql =>
      sql.includes('FROM "Documents"')
        ? [{ DocId: 3, OwnerUserId: 99, ownerRoleId: 7, Status: 'قيد المراجعة', CycleId: 1 }]
        : sql.includes('"Cycles"')
          ? [{ id: 1 }]
          : [],
  );
});

const ownDocument =
  (Status: string, CycleId = 1) =>
  (sql: string) =>
    sql.includes('FROM "Documents"')
      ? [{ DocId: 3, OwnerUserId: president.userId, ownerRoleId: 1, Status, CycleId }]
      : sql.includes('"Cycles"')
        ? [{ id: 1 }]
        : [];

test('a creator can delete their own document until it is accepted', async () => {
  for (const status of ['قيد المراجعة', 'مرفوض', 'لا يحتاج إلى مراجعة']) {
    await withActor(
      president,
      async base => {
        const response = await fetch(base + '/api/documents/3', {
          method: 'DELETE',
          headers: { Cookie: cookieFor(president), Origin: base },
        });
        assert.equal(response.status, 204, status);
      },
      ownDocument(status),
    );
  }
});

test('once accepted, or once the year is archived, only the developer can delete it', async () => {
  for (const [status, cycleId] of [
    ['مقبول', 1],
    ['قيد المراجعة', 2],
  ] as const) {
    await withActor(
      president,
      async base => {
        const response = await fetch(base + '/api/documents/3', {
          method: 'DELETE',
          headers: { Cookie: cookieFor(president), Origin: base },
        });
        assert.equal(response.status, 403, `${status} in cycle ${cycleId}`);
      },
      ownDocument(status, cycleId),
    );
  }
  await withActor(
    developer,
    async base => {
      const response = await fetch(base + '/api/documents/3', {
        method: 'DELETE',
        headers: { Cookie: cookieFor(developer), Origin: base },
      });
      assert.equal(response.status, 204, 'developer deletes anything');
    },
    ownDocument('مقبول', 2),
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

test('deleting a year needs the exact year name and never touches data otherwise', async () => {
  const statements: string[] = [];
  const fakeTransaction = (async work =>
    work({
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM "Cycles" WHERE "CycleId"=$1 FOR UPDATE'))
          return { rows: [{ Name: '2025/2026', IsCurrent: false }] };
        return { rows: [], rowCount: 0 };
      },
    } as never)) as typeof transaction;
  await withActor(
    developer,
    async base => {
      const headers = { Cookie: cookieFor(developer), Origin: base, 'Content-Type': 'application/json' };
      const wrong = await fetch(base + '/api/cycles/1', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ confirm: '2025' }),
      });
      assert.equal(wrong.status, 400);
      assert.equal(
        statements.some(sql => sql.startsWith('DELETE')),
        false,
        'nothing deleted on a wrong confirmation',
      );
      const missing = await fetch(base + '/api/cycles/1', { method: 'DELETE', headers, body: '{}' });
      assert.equal(missing.status, 400);
    },
    undefined,
    fakeTransaction,
  );
});

test('sign-in accepts the account email as well as the username, but never guesses between shared emails', async () => {
  const password = hashPassword('a long password');
  const login = (rows: unknown[]) => async (base: string) => {
    const response = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dev@example.com', password: 'a long password' }),
    });
    return { status: response.status, rows };
  };
  const row = { userId: 1, fullName: 'Dev', roleId: DEVELOPER_ROLE_ID, roleName: 'مطوّر', password, byUsername: false };
  for (const [rows, expected] of [
    [[row], 200], // one account owns that email
    [[row, { ...row, userId: 2 }], 401], // two accounts share it: refuse
    [[], 401],
  ] as const) {
    await withActor(
      developer,
      async base => assert.equal((await login([])(base)).status, expected),
      () => [...rows],
    );
  }
});
