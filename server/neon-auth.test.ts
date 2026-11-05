import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { createNeonVerifier, NeonAuthError, resolveNeonActor, type NeonIdentity } from './neon-auth.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { credentialFingerprint } from './security.js';
import { authenticate } from './http/authenticate.js';
import { query, transaction } from './db.js';

const authUrl = 'https://test.neonauth.example/neondb/auth';
const issuer = new URL(authUrl).origin;
const keys = await generateKeyPair('EdDSA');
const verify = createNeonVerifier(authUrl, async () => keys.publicKey);
const identity: NeonIdentity = {
  subject: 'neon-subject-123',
  email: 'member@example.com',
  name: 'Union member',
  provider: `neon:${authUrl}`,
};
async function sign(payload: JWTPayload = {}, options: { issuer?: string; audience?: string; exp?: number } = {}) {
  return new SignJWT({ email: identity.email, emailVerified: true, banned: false, name: identity.name, ...payload })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setSubject(identity.subject)
    .setIssuedAt()
    .setIssuer(options.issuer || issuer)
    .setAudience(options.audience || issuer)
    .setExpirationTime(options.exp ?? Math.floor(Date.now() / 1000) + 900)
    .sign(keys.privateKey);
}
test('Neon verifier accepts an Ed25519 token only from configured tenant with a verified, active email', async () => {
  assert.deepEqual(await verify(await sign({ email: 'Member@Example.com', role: 'admin' })), identity);
});
test('Neon verifier fails closed for unverified or banned accounts', async () => {
  for (const payload of [{ emailVerified: false }, { banned: true }, { emailVerified: 'true' }, { banned: null }]) {
    await assert.rejects(verify(await sign(payload)), error => error instanceof NeonAuthError && error.status === 403);
  }
});
test('Neon verifier rejects wrong issuer/audience, expired signatures, malformed email, and unsupported algorithms', async () => {
  for (const token of [
    await sign({}, { issuer: 'https://attacker.example' }),
    await sign({}, { audience: 'other-app' }),
    await sign({}, { exp: Math.floor(Date.now() / 1000) - 1 }),
    await sign({ email: 'not-an-email' }),
    'not-a-jwt',
  ]) {
    await assert.rejects(verify(token), error => error instanceof NeonAuthError && error.status === 401);
  }
  const hmac = await new SignJWT({ sub: identity.subject, email: identity.email, emailVerified: true, banned: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(issuer)
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode('not-the-managed-key'));
  await assert.rejects(verify(hmac), error => error instanceof NeonAuthError && error.status === 401);
});
test('Neon verifier requires explicit exp and sub claims', async () => {
  for (const omit of ['exp', 'sub']) {
    const payload: JWTPayload = {
      sub: identity.subject,
      email: identity.email,
      emailVerified: true,
      banned: false,
      iss: issuer,
      aud: issuer,
      exp: Math.floor(Date.now() / 1000) + 900,
    };
    delete payload[omit];
    const token = await new SignJWT(payload).setProtectedHeader({ alg: 'EdDSA' }).sign(keys.privateKey);
    await assert.rejects(verify(token), error => error instanceof NeonAuthError && error.status === 401);
  }
});
type FakeQuery = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
function database(fake: FakeQuery) {
  return {
    query: (async () => {
      throw new Error('Unexpected non-transaction query');
    }) as typeof query,
    transaction: (async work =>
      work({ query: (sql: string, params: unknown[] = []) => fake(sql, params) } as never)) as typeof transaction,
  };
}
test('temporary managed passwords restrict authenticated API requests until Neon confirms a changed credential', async () => {
  for (const changed of [false, true]) {
    let cleared = false;
    const db = database(async sql => {
      if (sql.includes('FROM "AuthIdentities"')) return { rows: [{ userId: 13 }] };
      if (sql.includes('FROM "Users" u JOIN "Roles"'))
        return { rows: [{ userId: 13, roleId: 11, fullName: 'Developer', roleName: 'Developer' }] };
      if (sql.includes('AS marker'))
        return { rows: [{ marker: '!neon-temporary:' + credentialFingerprint('initial') }] };
      if (sql.includes('neon_auth.account')) return { rows: [{ password: changed ? 'new' : 'initial' }] };
      if (sql.includes('UPDATE "Users"')) cleared = true;
      return { rows: [] };
    });
    const context = { ...db, authProvider: 'neon' as const, audit: async () => {}, verifyNeon: async () => identity };
    for (const path of ['/auth/me', '/documents', '/users']) {
      const request = { method: 'GET', path, get: () => 'Bearer test-token' };
      let result: unknown;
      await authenticate(context)(request as never, {} as never, error => {
        result = error;
      });
      if (!changed && path !== '/auth/me') assert.equal((result as { status: number }).status, 403);
      else assert.equal(result, undefined);
      assert.equal(
        (request as unknown as { actor: { mustChangePassword: boolean } }).actor.mustChangePassword,
        !changed,
      );
    }
    assert.equal(cleared, changed);
  }
});
test('mapped subjects retain current DB role, ignoring provider admin claims', async () => {
  const actor = { userId: 4, fullName: 'Existing member', roleId: 7, roleName: 'Activities' };
  const actorResult = await resolveNeonActor(
    identity,
    database(async sql => {
      if (sql.includes('FROM "AuthIdentities"')) return { rows: [{ userId: 4 }] };
      if (sql.includes('FROM "Users" u JOIN "Roles"')) return { rows: [actor] };
      if (sql.includes('AS marker')) return { rows: [] };
      if (sql.includes('FROM "AuthRevocations"')) return { rows: [] };
      assert.match(sql, /pg_advisory_xact_lock/);
      return { rows: [] };
    }),
  );
  assert.deepEqual(actorResult, actor);
});
test('verified email links only one unambiguous existing account without changing its password or role', async () => {
  const actor = { userId: 3, fullName: 'Existing secretary', roleId: 3, roleName: 'Secretary' },
    writes: string[] = [];
  await resolveNeonActor(
    identity,
    database(async (sql, params) => {
      if (sql.includes('FROM "AuthIdentities"')) return { rows: [], rowCount: 0 };
      if (sql.includes('WHERE lower(btrim("Email"))')) {
        assert.deepEqual(params, [identity.email]);
        return { rows: [{ userId: 3 }] };
      }
      if (sql.includes('INSERT INTO')) {
        writes.push(sql);
        assert.deepEqual(params, [identity.provider, identity.subject, 3]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM "Users" u JOIN "Roles"')) return { rows: [actor] };
      return { rows: [] };
    }),
  );
  assert.equal(writes.length, 1);
  assert.match(writes[0], /INSERT INTO "AuthIdentities"/);
});
test('duplicate legacy emails and already claimed users cannot be automatically linked', async () => {
  for (const scenario of ['duplicate-email', 'already-linked']) {
    await assert.rejects(
      resolveNeonActor(
        identity,
        database(async sql => {
          if (sql.includes('FROM "AuthIdentities"')) return { rows: [], rowCount: sql.includes('"UserId"=$2') ? 1 : 0 };
          if (sql.includes('WHERE lower(btrim("Email"))'))
            return { rows: scenario === 'duplicate-email' ? [{ userId: 1 }, { userId: 2 }] : [{ userId: 1 }] };
          if (sql.includes('INSERT INTO')) throw new Error('Must not create any identity on ambiguous link');
          return { rows: [] };
        }),
      ),
      error => error instanceof NeonAuthError && error.status === 409,
    );
  }
});
test('unknown identities are rejected: signing up never creates a user or grants a role', async () => {
  let inserted = false;
  await assert.rejects(
    resolveNeonActor(
      identity,
      database(async sql => {
        if (sql.includes('INSERT INTO')) inserted = true;
        return { rows: [], rowCount: 0 };
      }),
    ),
    error => error instanceof NeonAuthError && error.status === 403,
  );
  assert.equal(inserted, false);
});

test('revoked managed subjects cannot reclaim a seat with an otherwise valid token', async () => {
  await assert.rejects(
    resolveNeonActor(
      identity,
      database(async sql => {
        if (sql.includes('FROM "AuthRevocations"')) return { rows: [{}], rowCount: 1 };
        if (sql.includes('FROM "Users"') || sql.includes('FROM "AuthIdentities"'))
          throw new Error('Revoked subject must stop before linking');
        return { rows: [] };
      }),
    ),
    error => error instanceof NeonAuthError && error.status === 403,
  );
});
test('missing setup table returns a safe service error rather than creating schema at runtime', async () => {
  await assert.rejects(
    resolveNeonActor(
      identity,
      database(async () => {
        throw Object.assign(new Error('missing table'), { code: '42P01' });
      }),
    ),
    error => error instanceof NeonAuthError && error.status === 503,
  );
});
test('Neon-mode API exposes runtime config, blocks legacy passwords, and requires Bearer even with an old cookie', async () => {
  const app = createApp({
    authProvider: 'neon',
    query: (async () => {
      throw new Error('Unexpected database query');
    }) as typeof query,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing address');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + '/api/auth/config');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).provider, 'neon');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    for (const endpoint of ['login', 'register']) {
      const blocked = await fetch(base + '/api/auth/' + endpoint, {
        method: 'POST',
        headers: { Origin: config.origin },
      });
      assert.equal(blocked.status, 410);
    }
    const unauthorized = await fetch(base + '/api/auth/me', { headers: { Cookie: 'yod_session=legacy-token' } });
    assert.equal(unauthorized.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
});
