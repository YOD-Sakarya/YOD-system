import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query, transaction } from './db.js';
import { activateSeat } from './services/activation.js';
import type { ManagedAccounts } from './services/managedAccounts.js';

type Seat = { id: number; name: string };

/** In-memory seats + a recorder for what the service did, so each scenario can be read as a story. */
function scenario(options: { seats: Seat[]; linked?: boolean; mailFails?: boolean }) {
  const events: string[] = [];
  const fakeTransaction = (async work =>
    work({
      query: async (sql: string) => {
        if (sql.includes('FROM "Users" WHERE lower(btrim("Email"))'))
          return { rows: options.seats, rowCount: options.seats.length };
        if (sql.includes('FROM "AuthIdentities"') && sql.startsWith('SELECT'))
          return { rows: options.linked ? [{}] : [], rowCount: options.linked ? 1 : 0 };
        if (sql.startsWith('INSERT INTO "AuthIdentities"')) {
          events.push('link');
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('UPDATE "Users" SET "PasswordHash"')) {
          events.push('replace-stored-password');
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as never)) as typeof transaction;
  const managed: ManagedAccounts = {
    provision: async () => {
      events.push('provision');
      return { subject: 'subject-1', marker: '!neon-temporary:x' };
    },
    remove: async () => {},
    sendActivation: async () => {
      events.push('mail');
      if (options.mailFails) throw new Error('mail failed');
    },
  };
  return { events, deps: { transaction: fakeTransaction, managed } };
}

function withManagement<T>(configured: boolean, run: () => Promise<T>) {
  const saved = [config.neonApiKey, config.neonProjectId, config.neonBranchId];
  [config.neonApiKey, config.neonProjectId, config.neonBranchId] = configured ? ['k', 'p', 'b'] : ['', '', ''];
  return run().finally(() => ([config.neonApiKey, config.neonProjectId, config.neonBranchId] = saved));
}

test('a seat without a login gets one, linked, its old stored password replaced, then the code is mailed', async () => {
  const { events, deps } = scenario({ seats: [{ id: 7, name: 'Member' }] });
  const outcome = await withManagement(true, () => activateSeat(deps, 'fresh@students.org.tr'));
  assert.equal(outcome, 'sent');
  assert.deepEqual(events, ['provision', 'link', 'replace-stored-password', 'mail']);
});

test('a seat that already has a login only receives a new code (this is also how resend works)', async () => {
  const { events, deps } = scenario({ seats: [{ id: 7, name: 'Member' }], linked: true });
  assert.equal(await withManagement(true, () => activateSeat(deps, 'linked@students.org.tr')), 'sent');
  assert.deepEqual(events, ['mail']);
});

test('unknown and shared emails do nothing at all', async () => {
  for (const [email, seats] of [
    ['nobody@students.org.tr', []],
    [
      'shared@students.org.tr',
      [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
    ],
  ] as const) {
    const { events, deps } = scenario({ seats: [...seats] });
    assert.equal(await withManagement(true, () => activateSeat(deps, email)), 'skipped');
    assert.deepEqual(events, [], email);
  }
});

test('without the Neon management settings the login is not created, but the code is still sent', async () => {
  const { events, deps } = scenario({ seats: [{ id: 7, name: 'Member' }] });
  assert.equal(await withManagement(false, () => activateSeat(deps, 'nokey@students.org.tr')), 'sent');
  assert.deepEqual(events, ['mail']);
});

test('the same email cannot be mailed twice within a minute unless the developer is sending invitations', async () => {
  const { events, deps } = scenario({ seats: [{ id: 7, name: 'Member' }], linked: true });
  await withManagement(true, async () => {
    assert.equal(await activateSeat(deps, 'twice@students.org.tr'), 'sent');
    assert.equal(await activateSeat(deps, 'Twice@Example.com '), 'skipped', 'case and spaces do not dodge the limit');
    assert.equal(await activateSeat(deps, 'twice@students.org.tr', { ignoreCooldown: true }), 'sent');
  });
  assert.equal(events.filter(e => e === 'mail').length, 2);
});

async function call(authProvider: 'legacy' | 'neon', body: unknown, mailFails = false) {
  const { deps } = scenario({ seats: [{ id: 7, name: 'Member' }], linked: true, mailFails });
  const app = createApp({
    authProvider,
    transaction: deps.transaction,
    query: (async () => []) as unknown as typeof query,
    managedAccounts: deps.managed,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(origin + '/api/auth/activate', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('public activation answers the same for known, unknown and failing addresses, and is off in the old login mode', async () => {
  const known = await call('neon', { email: 'api-known@students.org.tr' });
  const failing = await call('neon', { email: 'api-fail@students.org.tr' }, true);
  assert.equal(known.status, 200);
  assert.equal(failing.status, 200, 'a mail failure must not be visible from outside');
  assert.deepEqual(failing.body, known.body);
  assert.equal((await call('neon', { email: 'not-an-email' })).status, 400);
  assert.equal((await call('legacy', { email: 'api-legacy@students.org.tr' })).status, 409);
});

test('placeholder and reserved addresses can never receive a code and are never provisioned', async () => {
  const { events, deps } = scenario({ seats: [{ id: 7, name: 'Member' }] });
  for (const email of [
    'x@example.com',
    'x@example.org',
    'x@mail.test',
    'x@nowhere.invalid',
    'no-at-sign',
    'x@localhost',
  ])
    assert.equal(await withManagement(true, () => activateSeat(deps, email)), 'skipped', email);
  assert.deepEqual(events, []);
  const { isDeliverableEmail } = await import('./services/activation.js');
  assert.equal(isDeliverableEmail('person@students.org.tr'), true);
  assert.equal(isDeliverableEmail('person@gmail.com'), true);
});
