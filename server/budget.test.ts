import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query, transaction } from './db.js';
import { canManageBudget, canViewBudget, DEVELOPER_ROLE_ID, sessionVersion, type Actor } from './security.js';
import { budgetSummary, roundMoney } from './services/budget.js';

const storedHash = 'stored-password-hash';
const actor = (userId: number, roleId: number): Actor => ({
  userId,
  fullName: `User ${roleId}`,
  roleId,
  roleName: 'role',
});
const finance = actor(4, 4);
const president = actor(1, 1);
const secretary = actor(3, 3);
const oversight = actor(10, 10);
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

const budgetHandler = (sql: string) => {
  if (sql.includes('FROM "Cycles" WHERE "IsCurrent"')) return [{ id: 2 }];
  if (sql.includes('SELECT "Name" AS name FROM "Cycles"')) return [{ name: '2026/2027' }];
  if (sql.includes('INSERT INTO "BudgetTransactions"')) return [{ id: 9 }];
  return [];
};
const entry = {
  fund: 'union',
  kind: 'income',
  amount: 150.5,
  category: 'اشتراكات',
  description: '',
  txDate: '2026-11-01',
};

test('budget access rules: seven roles see it, only the financial officer changes it', () => {
  for (const user of [finance, president, secretary, oversight, developer]) assert.equal(canViewBudget(user), true);
  assert.equal(canViewBudget(member), false);
  assert.equal(canManageBudget(finance), true);
  // The developer only looks.
  for (const user of [developer, president, secretary, oversight]) assert.equal(canManageBudget(user), false);
});

test('members cannot open the budget, its receipts or the totals', async () => {
  await withActor(
    member,
    async (base, calls) => {
      for (const path of ['/api/budget', '/api/budget/transactions/3/view', '/api/budget/transactions/3/download']) {
        const response = await fetch(base + path, { headers: { Cookie: cookieFor(member) } });
        assert.equal(response.status, 403, path);
      }
      assert.equal(calls.filter(call => call.sql.includes('Budget')).length, 0);
    },
    budgetHandler,
  );
});

test('the president, oversight and the developer can read the budget', async () => {
  for (const user of [president, oversight, developer, finance]) {
    await withActor(
      user,
      async base => {
        const response = await fetch(base + '/api/budget', { headers: { Cookie: cookieFor(user) } });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.cycleName, '2026/2027');
        assert.equal(body.isCurrent, true);
      },
      budgetHandler,
    );
  }
});

test('only the financial officer records money; the developer and others are refused before any upload is read', async () => {
  for (const user of [developer, president, oversight, member]) {
    await withActor(
      user,
      async (base, calls) => {
        const headers = { Cookie: cookieFor(user), Origin: base, 'Content-Type': 'application/json' };
        const add = await fetch(base + '/api/budget/transactions', {
          method: 'POST',
          headers,
          body: JSON.stringify(entry),
        });
        assert.equal(add.status, 403);
        const remove = await fetch(base + '/api/budget/transactions/5', { method: 'DELETE', headers });
        assert.equal(remove.status, 403);
        assert.equal(calls.filter(call => /INSERT INTO "Budget|DELETE FROM "Budget/.test(call.sql)).length, 0);
      },
      budgetHandler,
    );
  }
  // Nobody, the developer included, can change opening balances after the year was created.
  await withActor(
    developer,
    async base => {
      const response = await fetch(base + '/api/budget/opening', {
        method: 'PUT',
        headers: { Cookie: cookieFor(developer), Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({ union: 1, faza: 2 }),
      });
      assert.equal(response.status, 404);
    },
    budgetHandler,
  );
});

test('the financial officer adds an entry; categories, dates and amounts are validated', async () => {
  await withActor(
    finance,
    async (base, calls) => {
      const headers = { Cookie: cookieFor(finance), Origin: base, 'Content-Type': 'application/json' };
      const post = (body: object) =>
        fetch(base + '/api/budget/transactions', { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal((await post({ ...entry, category: 'مواصلات' })).status, 400); // spending category on income
      assert.equal((await post({ ...entry, amount: 0 })).status, 400);
      assert.equal((await post({ ...entry, amount: 1.234 })).status, 400);
      assert.equal((await post({ ...entry, fund: 'other' })).status, 400);
      assert.equal((await post({ ...entry, txDate: '2999-01-01' })).status, 400);
      assert.equal(calls.filter(call => call.sql.includes('INSERT INTO "BudgetTransactions"')).length, 0);
      assert.equal((await post(entry)).status, 201);
      const insert = calls.find(call => call.sql.includes('INSERT INTO "BudgetTransactions"'));
      assert.deepEqual(insert?.values.slice(0, 7), [2, 'union', 'income', 150.5, 'اشتراكات', '', '2026-11-01']);
      assert.equal(insert?.values[7], null); // no attachment
      assert.equal(insert?.values[8], finance.userId);
      assert.ok(calls.some(call => call.sql.includes('INSERT INTO "AuditLogs"') && call.values[3] === 'budget.add'));
      // Spending uses its own list, which includes «أخرى».
      assert.equal((await post({ ...entry, kind: 'expense', category: 'أخرى' })).status, 201);
    },
    budgetHandler,
  );
});

test('entries of a finished year cannot be deleted', async () => {
  await withActor(
    finance,
    async base => {
      const response = await fetch(base + '/api/budget/transactions/5', {
        method: 'DELETE',
        headers: { Cookie: cookieFor(finance), Origin: base },
      });
      assert.equal(response.status, 403);
    },
    sql => {
      if (sql.includes('FROM "Cycles" WHERE "IsCurrent"')) return [{ id: 2 }];
      if (sql.includes('FROM "BudgetTransactions" WHERE "TransactionId"'))
        return [{ cycleId: 1, fund: 'union', kind: 'income', amount: 10, category: 'دعم', txDate: '2025-10-01' }];
      return [];
    },
  );
});

test('a year with financial records cannot be deleted by the developer', async () => {
  const tx = (async (work: (client: unknown) => unknown) =>
    work({
      query: async (sql: string) => {
        if (sql.includes('FROM "Cycles" WHERE "CycleId"')) return { rows: [{ Name: '2025/2026', IsCurrent: false }] };
        if (sql.includes('count(*)')) return { rows: [{ n: 2 }] };
        if (sql.includes('FROM "BudgetTransactions"')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    })) as unknown as typeof transaction;
  await withActor(
    developer,
    async base => {
      const response = await fetch(base + '/api/cycles/1', {
        method: 'DELETE',
        headers: { Cookie: cookieFor(developer), Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: '2025/2026' }),
      });
      assert.equal(response.status, 409);
    },
    budgetHandler,
    tx,
  );
});

test('a new year needs both opening balances and stores them with the year', async () => {
  const inserted: unknown[][] = [];
  const tx = (async (work: (client: unknown) => unknown) =>
    work({
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes('FROM "Cycles" WHERE "IsCurrent"')) return { rows: [{ CycleId: 1, start: '2025-09-01' }] };
        if (sql.includes('INSERT INTO "Cycles"')) return { rows: [{ id: 3 }] };
        if (sql.includes('INSERT INTO "BudgetOpening"')) inserted.push(values);
        return { rows: [], rowCount: 0 };
      },
    })) as unknown as typeof transaction;
  await withActor(
    developer,
    async base => {
      const headers = { Cookie: cookieFor(developer), Origin: base, 'Content-Type': 'application/json' };
      const post = (body: object) =>
        fetch(base + '/api/cycles', { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal((await post({ name: '2027/2028', startDate: '2027-09-01' })).status, 400);
      assert.equal((await post({ name: '2027/2028', startDate: '2027-09-01', openingUnion: 10 })).status, 400);
      const ok = await post({
        name: '2027/2028',
        startDate: '2027-09-01',
        openingUnion: 4396.52,
        openingFaza: 45067.89,
      });
      assert.equal(ok.status, 201);
      assert.deepEqual(inserted, [
        [3, 'union', 4396.52],
        [3, 'faza', 45067.89],
      ]);
    },
    budgetHandler,
    tx,
  );
});

test('totals add opening and income, subtract spending and round to two decimals', async () => {
  const summary = await budgetSummary(
    (async () => [
      { fund: 'union', opening: 4396.52, income: 0.1 + 0.2, expense: 100 },
      { fund: 'faza', opening: 45067.89, income: 0, expense: 0 },
    ]) as unknown as typeof query,
    2,
  );
  assert.equal(summary[0].balance, 4296.82);
  assert.equal(summary[0].income, 0.3);
  assert.equal(summary[1].label, 'صندوق فزعة');
  assert.equal(roundMoney(1.005 + 1.005), 2.01);
});
