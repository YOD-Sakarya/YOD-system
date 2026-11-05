import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query, transaction } from './db.js';
import { DEVELOPER_ROLE_ID, sessionVersion, type Actor } from './security.js';
import { createAudit } from './services/audit.js';

const storedHash = 'stored-password-hash';
const developer: Actor = { userId: 1, fullName: 'Dev', roleId: DEVELOPER_ROLE_ID, roleName: 'مطوّر' };
const member: Actor = { userId: 7, fullName: 'Member', roleId: 7, roleName: 'أنشطة' };
const cookieFor = (actor: Actor) =>
  'yod_session=' +
  jwt.sign({ sub: String(actor.userId), ver: sessionVersion(storedHash) }, config.jwtSecret, {
    issuer: 'yod-express',
    audience: 'yod-react',
    expiresIn: '1m',
  });

type Call = { sql: string; values: unknown[] };

async function withActor(
  actor: Actor,
  run: (base: string, calls: Call[]) => Promise<void>,
  handler: (sql: string) => unknown[] = () => [],
  tx?: typeof transaction,
) {
  const calls: Call[] = [];
  const database = (async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.includes('WHERE u."UserId"=$1')) return [{ ...actor, passwordHash: storedHash }];
    return handler(sql);
  }) as unknown as typeof query;
  const server = createApp({ authProvider: 'legacy', query: database, ...(tx ? { transaction: tx } : {}) }).listen(
    0,
    '127.0.0.1',
  );
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  try {
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('only the developer can read the activity log', async () => {
  await withActor(member, async base => {
    const response = await fetch(base + '/api/logs', { headers: { Cookie: cookieFor(member) } });
    assert.equal(response.status, 403);
  });
  await withActor(
    developer,
    async base => {
      const response = await fetch(base + '/api/logs?limit=1', { headers: { Cookie: cookieFor(developer) } });
      assert.equal(response.status, 200);
      const body = await response.json();
      // One extra row is fetched to know whether more exist.
      assert.equal(body.items.length, 1);
      assert.equal(body.hasMore, true);
    },
    sql => (sql.includes('FROM "AuditLogs"') ? [{ id: 2 }, { id: 1 }] : []),
  );
});

test('log filters reject nonsense instead of reaching the database', async () => {
  await withActor(developer, async (base, calls) => {
    const response = await fetch(base + '/api/logs?limit=9999', { headers: { Cookie: cookieFor(developer) } });
    assert.equal(response.status, 400);
    assert.equal(calls.filter(call => call.sql.includes('AuditLogs')).length, 0);
  });
});

test('a failing log write never breaks the request it describes', async () => {
  const audit = createAudit((async () => {
    throw new Error('relation "AuditLogs" does not exist');
  }) as unknown as typeof query);
  const original = console.error;
  console.error = () => {};
  try {
    await audit({ actor: developer, ip: '1.2.3.4' }, { action: 'document.delete', summary: 'x' });
  } finally {
    console.error = original;
  }
});

test('a log entry stores the actor and the event but only the fields it is given', async () => {
  const calls: Call[] = [];
  const audit = createAudit((async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    return [];
  }) as unknown as typeof query);
  await audit(
    { actor: developer, ip: '9.9.9.9' },
    { action: 'document.delete', targetType: 'document', targetId: 5, summary: 'حذف', details: { status: 'مقبول' } },
  );
  assert.deepEqual(calls[0].values, [
    1,
    'Dev',
    'مطوّر',
    'document.delete',
    'document',
    '5',
    'حذف',
    '{"status":"مقبول"}',
    '9.9.9.9',
  ]);
});

test('a failed sign-in is logged under the attempted name without the password', async () => {
  await withActor(member, async (base, calls) => {
    const response = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ghost', password: 'secret-password-1' }),
    });
    assert.equal(response.status, 401);
    const insert = calls.find(call => call.sql.includes('INSERT INTO "AuditLogs"'));
    assert.ok(insert);
    assert.equal(insert.values[3], 'auth.login_failed');
    assert.ok(!JSON.stringify(insert.values).includes('secret-password-1'));
  });
});

test('the developer decides in the name of a reviewer role; others still cannot', async () => {
  const inserted: unknown[][] = [];
  const doc = { DocId: 3, Title: 'خطة', DocTypeId: 1, ownerRoleId: 7, CycleId: 1 };
  const tx = (async (work: (client: unknown) => unknown) =>
    work({
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes('FROM "Documents" d')) return { rows: [doc] };
        if (sql.includes('FROM "Users" WHERE "RoleId"')) return { rows: [{ UserId: 40, FullName: 'الرئيس' }] };
        if (sql.includes('FROM "Cycles"')) return { rows: [{ CycleId: 2 }] };
        if (sql.includes('INSERT INTO "Reviews"')) inserted.push(values);
        if (sql.includes('DISTINCT ON')) return { rows: [{ role: 1, decision: 'مقبول' }] };
        return { rows: [] };
      },
    })) as unknown as typeof transaction;

  await withActor(
    developer,
    async (base, calls) => {
      const headers = { Cookie: cookieFor(developer), Origin: base, 'Content-Type': 'application/json' };
      const post = (body: object) =>
        fetch(base + '/api/reviews', { method: 'POST', headers, body: JSON.stringify(body) });
      // A role must be chosen, and it must be one that reviews this document.
      assert.equal((await post({ documentId: 3, decision: 'مقبول', comment: '' })).status, 400);
      assert.equal((await post({ documentId: 3, decision: 'مقبول', comment: '', asRoleId: 9 })).status, 400);
      // Even though the cycle is archived (document in cycle 1, current is 2), the developer may still decide.
      assert.equal((await post({ documentId: 3, decision: 'مقبول', comment: '', asRoleId: 1 })).status, 200);
      // Stored on the seat that holds the role, so the normal status rules apply.
      assert.deepEqual(inserted.at(-1)?.slice(0, 3), [3, 40, 'مقبول']);
      const log = calls.find(call => call.sql.includes('INSERT INTO "AuditLogs"'));
      assert.equal(log?.values[0], developer.userId);
      assert.equal(log?.values[3], 'review.submit');
      assert.match(String(log?.values[6]), /نيابةً عن الرئيس/);
    },
    () => [],
    tx,
  );

  await withActor(member, async base => {
    const headers = { Cookie: cookieFor(member), Origin: base, 'Content-Type': 'application/json' };
    const response = await fetch(base + '/api/reviews', {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentId: 3, decision: 'مقبول', comment: '', asRoleId: 1 }),
    });
    assert.equal(response.status, 403);
  });
});

test('log entries older than a week are deleted, at most once an hour per instance', async () => {
  const deletes: unknown[][] = [];
  const audit = createAudit((async (sql: string, values: unknown[]) => {
    if (sql.startsWith('DELETE FROM "AuditLogs"')) deletes.push(values);
    return [];
  }) as unknown as typeof query);
  await audit({ actor: developer, ip: '' }, { action: 'a.b', summary: 'x' });
  await audit({ actor: developer, ip: '' }, { action: 'a.b', summary: 'y' });
  assert.deepEqual(deletes, [[7]]);
});
