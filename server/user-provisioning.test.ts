import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import type { query, transaction } from './db.js';

const member = { fullName: 'New member', username: 'new-member', email: 'new@students.org.tr', roleId: 5 };

async function runScenario(method: string, path: string, mailFails = false) {
  const events: string[] = [];
  const statements: string[] = [];
  const fakeTransaction = (async work => {
    const result = await work({
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM "AuthRevocations"')) return { rows: [], rowCount: 0 };
        if (sql.includes('FROM "AuthIdentities"') && sql.startsWith('SELECT'))
          return { rows: [{ userId: 1 }], rowCount: 1 };
        if (sql.includes('FROM "Users" u JOIN "Roles"'))
          return { rows: [{ userId: 1, roleId: 11, fullName: 'Dev', roleName: 'Dev' }] };
        if (sql.includes('SELECT * FROM "Users"'))
          return { rows: [{ UserId: 2, RoleId: 5, Username: 'old-member', Email: 'old@students.org.tr' }] };
        if (sql.includes('FROM "Roles"')) return { rows: [{}], rowCount: 1 };
        if (sql.includes('FROM neon_auth."user"')) return { rows: [{ id: 'old-subject' }] };
        if (sql.includes('INSERT INTO "Users"')) return { rows: [{ id: 2 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    } as never);
    events.push('commit');
    return result;
  }) as typeof transaction;
  const app = createApp({
    authProvider: 'neon',
    transaction: fakeTransaction,
    query: (async () => [{ email: member.email }]) as unknown as typeof query,
    verifyNeon: async () => ({ subject: 'dev-subject', email: 'dev@example.com', name: 'Dev', provider: 'neon:test' }),
    managedAccounts: {
      provision: async () => {
        events.push('provision');
        return { subject: 'new-subject', marker: '!neon-temporary:fingerprint' };
      },
      remove: async subject => {
        events.push('remove:' + subject);
      },
      sendActivation: async () => {
        events.push('mail');
        if (mailFails) throw new Error('mail failed');
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(origin + path, {
      method,
      headers: { Authorization: 'Bearer dev', Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(member),
    });
    return { status: response.status, body: await response.json(), events, statements };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('developer creates a seat without a password and activation is sent after commit', async () => {
  const result = await runScenario('POST', '/api/users');
  assert.equal(result.status, 201);
  assert.equal(result.body.userId, 2);
  assert.ok(result.events.indexOf('mail') > result.events.lastIndexOf('commit'));
  assert.ok(result.statements.some(sql => sql.includes('INSERT INTO "AuthIdentities"')));
});

test('handover revokes and unlinks old identity, preserves the seat, then removes old auth and sends activation', async () => {
  const result = await runScenario('PUT', '/api/users/2');
  assert.equal(result.status, 200);
  assert.ok(result.statements.some(sql => sql.includes('INSERT INTO "AuthRevocations"')));
  assert.ok(result.statements.some(sql => sql.includes('DELETE FROM "AuthIdentities"')));
  assert.ok(result.statements.some(sql => sql.includes('INSERT INTO "AuthIdentities"')));
  assert.ok(
    !result.statements.some(sql => sql.includes('DELETE FROM "Users"') || sql.includes('DELETE FROM "Documents"')),
  );
  assert.ok(result.events.indexOf('remove:old-subject') > result.events.lastIndexOf('commit'));
});

test('delivery failure reports that the seat was saved and can be retried', async () => {
  const result = await runScenario('POST', '/api/users', true);
  assert.equal(result.status, 201);
  assert.match(result.body.message, /تم حفظ الحساب/);
  assert.match(result.body.message, /تعذر إرسال/);
});

test('developer can resend an activation or reset code to the current seat email', async () => {
  const result = await runScenario('POST', '/api/users/2/reset-password');
  assert.equal(result.status, 200);
  assert.ok(result.events.includes('mail'));
  assert.ok(!result.events.includes('provision'));
});
