import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { config } from './config.js';
import type { query } from './db.js';
import {
  canCastVote,
  canManageBudget,
  canViewBudget,
  OBSERVER_ROLE_ID,
  sessionVersion,
  type Actor,
} from './security.js';

const storedHash = 'stored-password-hash';
const observer: Actor = {
  userId: 50,
  fullName: 'Visitor',
  roleId: OBSERVER_ROLE_ID,
  roleName: 'مراقب من الاتحاد العام',
};
const cookie =
  'yod_session=' +
  jwt.sign({ sub: String(observer.userId), ver: sessionVersion(storedHash) }, config.jwtSecret, {
    issuer: 'yod-express',
    audience: 'yod-react',
    expiresIn: '1m',
  });

async function withObserver(run: (base: string, calls: string[]) => Promise<void>) {
  const calls: string[] = [];
  const database = (async (sql: string) => {
    calls.push(sql);
    if (sql.includes('WHERE u."UserId"=$1')) return [{ ...observer, passwordHash: storedHash }];
    if (sql.includes('FROM "Cycles" WHERE "IsCurrent"')) return [{ id: 2 }];
    if (sql.includes('SELECT "Name" AS name FROM "Cycles"')) return [{ name: '2026/2027' }];
    return [];
  }) as unknown as typeof query;
  const server = createApp({ authProvider: 'legacy', query: database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  try {
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test('the General Union observer sees the budgets but can neither vote nor change the budget', () => {
  assert.equal(canViewBudget(observer), true);
  assert.equal(canManageBudget(observer), false);
  assert.equal(canCastVote(observer, 'اجتماع'), false);
  assert.equal(canCastVote(observer, 'قرار'), false);
});

test('the observer can read the workspace and the budgets', async () => {
  await withObserver(async base => {
    for (const path of ['/api/auth/me', '/api/documents', '/api/votes', '/api/budget', '/api/subscriptions']) {
      const response = await fetch(base + path, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200, path);
    }
  });
});

test('every write is refused for the observer before it reaches the database', async () => {
  await withObserver(async (base, calls) => {
    const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
    const writes: [string, string][] = [
      ['POST', '/api/documents'],
      ['PUT', '/api/documents/1'],
      ['DELETE', '/api/documents/1'],
      ['POST', '/api/reviews'],
      ['POST', '/api/votes'],
      ['POST', '/api/votes/1/vote'],
      ['PUT', '/api/votes/1/close'],
      ['POST', '/api/budget/transactions'],
      ['DELETE', '/api/budget/transactions/1'],
      ['POST', '/api/subscriptions/payments'],
      ['DELETE', '/api/subscriptions/payments/1'],
      ['POST', '/api/users'],
      ['POST', '/api/cycles'],
    ];
    for (const [method, path] of writes) {
      const response = await fetch(base + path, { method, headers, body: method === 'DELETE' ? undefined : '{}' });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.match((await response.json()).message, /المراقب للاطلاع فقط/);
    }
    assert.equal(calls.filter(sql => /INSERT|UPDATE|DELETE/.test(sql)).length, 0);
  });
});

test('the observer can still manage their own account', async () => {
  await withObserver(async base => {
    const response = await fetch(base + '/api/account/password', {
      method: 'PUT',
      headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
      body: '{}',
    });
    // Not blocked as an observer write: it reaches the route, which rejects the empty body.
    assert.equal(response.status, 400);
  });
});
