import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query, transaction } from './db.js';
import { DEVELOPER_ROLE_ID, sessionVersion, type Actor } from './security.js';

const storedHash = 'stored-password-hash';
const actor = (userId: number, roleId: number): Actor => ({
  userId,
  fullName: `User ${roleId}`,
  roleId,
  roleName: 'role',
});
const finance = actor(4, 4);
const president = actor(1, 1);
const developer = actor(11, DEVELOPER_ROLE_ID);
const member = actor(7, 7);
const cookieFor = (user: Actor) =>
  'yod_session=' +
  jwt.sign({ sub: String(user.userId), ver: sessionVersion(storedHash) }, config.jwtSecret, {
    issuer: 'yod-express',
    audience: 'yod-react',
    expiresIn: '1m',
  });

type Call = { sql: string; values: unknown[] };

async function withActor(
  user: Actor,
  run: (base: string, calls: Call[]) => Promise<void>,
  handler: (sql: string) => unknown[] = () => [],
  tx?: typeof transaction,
) {
  const calls: Call[] = [];
  const database = (async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.includes('WHERE u."UserId"=$1')) return [{ ...user, passwordHash: storedHash }];
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

const handler = (sql: string) => {
  if (sql.includes('FROM "Cycles" WHERE "IsCurrent"')) return [{ id: 2 }];
  if (sql.includes('SELECT "Name" AS name FROM "Cycles"')) return [{ name: '2026/2027' }];
  if (sql.includes('FROM "SubscriptionPayments" p'))
    return [
      {
        id: 1,
        studentId: 5,
        studentName: 'أحمد',
        amount: 100,
        quarters: [1, 2],
        paidAt: '2026-10-01',
        createdByName: 'Fin',
      },
      {
        id: 2,
        studentId: 5,
        studentName: 'أحمد',
        amount: 50.5,
        quarters: [3],
        paidAt: '2026-11-01',
        createdByName: 'Fin',
      },
    ];
  return [];
};
const payment = { studentName: '  أحمد   علي ', amount: 120.5, quarters: [4, 2], paidAt: '2026-11-01' };

/** A fake database transaction that records what the route writes. */
function fakeTransaction(options: { existingStudent?: boolean; paidQuarters?: number[] } = {}) {
  const writes: { sql: string; values: unknown[] }[] = [];
  const tx = (async (work: (client: unknown) => unknown) =>
    work({
      query: async (sql: string, values: unknown[] = []) => {
        writes.push({ sql, values });
        if (sql.includes('FROM "Cycles" WHERE "IsCurrent"')) return { rows: [{ CycleId: 2 }] };
        if (sql.includes('FROM "Students" WHERE'))
          return { rows: options.existingStudent ? [{ id: 5, name: 'أحمد علي' }] : [] };
        if (sql.includes('INSERT INTO "Students"')) return { rows: [{ id: 9, name: values[0] }] };
        if (sql.includes('"Quarters" && $3'))
          return { rows: options.paidQuarters ? [{ Quarters: options.paidQuarters }] : [] };
        if (sql.includes('INSERT INTO "BudgetTransactions"')) return { rows: [{ id: 70 }] };
        if (sql.includes('INSERT INTO "SubscriptionPayments"')) return { rows: [{ id: 31 }] };
        if (sql.includes('FROM "SubscriptionPayments" p'))
          return { rows: [{ cycleId: 2, amount: 10, quarters: [1], budgetId: 70, name: 'أحمد', isCurrent: true }] };
        return { rows: [] };
      },
    })) as unknown as typeof transaction;
  return { tx, writes };
}

test('members cannot see subscriptions; the president and the developer can, but not change them', async () => {
  await withActor(
    member,
    async base => {
      for (const path of ['/api/subscriptions', '/api/subscriptions/export']) {
        assert.equal((await fetch(base + path, { headers: { Cookie: cookieFor(member) } })).status, 403);
      }
    },
    handler,
  );
  for (const user of [president, developer]) {
    await withActor(
      user,
      async base => {
        const headers = { Cookie: cookieFor(user), Origin: base, 'Content-Type': 'application/json' };
        assert.equal((await fetch(base + '/api/subscriptions', { headers })).status, 200);
        const add = await fetch(base + '/api/subscriptions/payments', {
          method: 'POST',
          headers,
          body: JSON.stringify(payment),
        });
        assert.equal(add.status, 403);
        assert.equal((await fetch(base + '/api/subscriptions/payments/1', { method: 'DELETE', headers })).status, 403);
      },
      handler,
    );
  }
});

test('a payment needs a name, an amount, a date and one to four distinct quarters', async () => {
  await withActor(
    finance,
    async base => {
      const headers = { Cookie: cookieFor(finance), Origin: base, 'Content-Type': 'application/json' };
      const post = (body: object) =>
        fetch(base + '/api/subscriptions/payments', { method: 'POST', headers, body: JSON.stringify(body) });
      for (const bad of [
        { ...payment, quarters: [] },
        { ...payment, quarters: [5] },
        { ...payment, quarters: [1, 1] },
        { ...payment, amount: 0 },
        { ...payment, amount: 1.234 },
        { ...payment, studentName: ' ' },
        { ...payment, paidAt: '2999-01-01' },
      ])
        assert.equal((await post(bad)).status, 400, JSON.stringify(bad));
    },
    handler,
  );
});

test('a payment for a new student creates the student and the treasury income line', async () => {
  const { tx, writes } = fakeTransaction();
  await withActor(
    finance,
    async (base, calls) => {
      const headers = { Cookie: cookieFor(finance), Origin: base, 'Content-Type': 'application/json' };
      const response = await fetch(base + '/api/subscriptions/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify(payment),
      });
      assert.equal(response.status, 201);
      const student = writes.find(write => write.sql.includes('INSERT INTO "Students"'));
      assert.equal(student?.values[0], 'أحمد علي'); // spaces collapsed
      const income = writes.find(write => write.sql.includes('INSERT INTO "BudgetTransactions"'));
      assert.deepEqual(income?.values.slice(0, 2), [2, 120.5]);
      assert.match(String(income?.values[2]), /الربع الثاني، الربع الرابع/);
      const stored = writes.find(write => write.sql.includes('INSERT INTO "SubscriptionPayments"'));
      assert.deepEqual(stored?.values, [2, 9, 120.5, [2, 4], '2026-11-01', 70, finance.userId]);
      assert.ok(
        calls.some(call => call.sql.includes('INSERT INTO "AuditLogs"') && call.values[3] === 'subscription.add'),
      );
    },
    handler,
    tx,
  );
});

test('an existing student is reused, and a quarter that was already paid is refused', async () => {
  const reused = fakeTransaction({ existingStudent: true });
  await withActor(
    finance,
    async base => {
      const headers = { Cookie: cookieFor(finance), Origin: base, 'Content-Type': 'application/json' };
      const post = () =>
        fetch(base + '/api/subscriptions/payments', { method: 'POST', headers, body: JSON.stringify(payment) });
      assert.equal((await post()).status, 201);
      assert.equal(
        reused.writes.some(write => write.sql.includes('INSERT INTO "Students"')),
        false,
      );
    },
    handler,
    reused.tx,
  );

  const duplicate = fakeTransaction({ existingStudent: true, paidQuarters: [2] });
  await withActor(
    finance,
    async base => {
      const headers = { Cookie: cookieFor(finance), Origin: base, 'Content-Type': 'application/json' };
      const response = await fetch(base + '/api/subscriptions/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify(payment),
      });
      assert.equal(response.status, 409);
      assert.match((await response.json()).message, /الربع الثاني/);
      assert.equal(
        duplicate.writes.some(write => write.sql.includes('INSERT INTO "BudgetTransactions"')),
        false,
      );
    },
    handler,
    duplicate.tx,
  );
});

test('deleting a payment also removes its treasury line', async () => {
  const { tx, writes } = fakeTransaction();
  await withActor(
    finance,
    async base => {
      const response = await fetch(base + '/api/subscriptions/payments/31', {
        method: 'DELETE',
        headers: { Cookie: cookieFor(finance), Origin: base },
      });
      assert.equal(response.status, 204);
      const deletes = writes.filter(write => write.sql.startsWith('DELETE FROM'));
      assert.deepEqual(
        deletes.map(write => [write.sql.includes('"SubscriptionPayments"'), write.values[0]]),
        [
          [true, 31],
          [false, 70],
        ],
      );
    },
    handler,
    tx,
  );
});

test('the treasury line of a subscription cannot be deleted from the budget page', async () => {
  await withActor(
    finance,
    async base => {
      const response = await fetch(base + '/api/budget/transactions/70', {
        method: 'DELETE',
        headers: { Cookie: cookieFor(finance), Origin: base },
      });
      assert.equal(response.status, 409);
    },
    sql => {
      if (sql.includes('FROM "Cycles" WHERE "IsCurrent"')) return [{ id: 2 }];
      if (sql.includes('FROM "BudgetTransactions" WHERE "TransactionId"'))
        return [{ cycleId: 2, fund: 'union', kind: 'income', amount: 10, category: 'اشتراكات', txDate: '2026-11-01' }];
      if (sql.includes('FROM "SubscriptionPayments" WHERE "BudgetTransactionId"')) return [{ '?column?': 1 }];
      return [];
    },
  );
});

test('the Excel export is a real xlsx workbook for people who may see subscriptions', async () => {
  await withActor(
    president,
    async (base, calls) => {
      const response = await fetch(base + '/api/subscriptions/export', { headers: { Cookie: cookieFor(president) } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', /spreadsheetml/);
      assert.match(response.headers.get('content-disposition') ?? '', /\.xlsx/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(0, 2).toString(), 'PK'); // xlsx is a zip file
      assert.ok(
        calls.some(call => call.sql.includes('INSERT INTO "AuditLogs"') && call.values[3] === 'subscription.export'),
      );
    },
    handler,
  );
});
