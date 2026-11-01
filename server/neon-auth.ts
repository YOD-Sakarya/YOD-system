import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { query as databaseQuery, transaction as databaseTransaction } from './db.js';
import type { Actor } from './security.js';

export class NeonAuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type NeonIdentity = { subject: string; email: string; name: string; provider: string };
type Database = { query: typeof databaseQuery; transaction: typeof databaseTransaction };
const unauthorized = () => new NeonAuthError(401, 'الجلسة غير صالحة أو انتهت. سجّل الدخول مجددًا.');

// Each auth branch has its own JWKS. Never use an untrusted token's iss/jku to
// select a key endpoint, and never infer application roles from managed claims.
export function createNeonVerifier(authUrl: string, keyOverride?: JWTVerifyGetKey) {
  const base = new URL(authUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error('A valid HTTPS NEON_AUTH_URL is required.');
  const endpoint = base.toString().replace(/\/+$/, '');
  const issuer = base.origin;
  const key = keyOverride || createRemoteJWKSet(new URL(endpoint + '/.well-known/jwks.json'), {
    timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 10 * 60 * 1000,
  });
  return async (token: string): Promise<NeonIdentity> => {
    try {
      if (!token || token.length > 16384) throw unauthorized();
      const { payload } = await jwtVerify(token, key, {
        issuer, audience: issuer, algorithms: ['EdDSA'],
        requiredClaims: ['sub', 'exp', 'email', 'emailVerified', 'banned'],
        clockTolerance: 0,
      });
      if (!payload.sub || payload.sub.length > 200 || payload.emailVerified !== true || payload.banned !== false)
        throw new NeonAuthError(403, 'يرجى تأكيد بريدك الإلكتروني والتأكد من أن الحساب غير موقوف.');
      const email = z.email().max(320).parse(payload.email).trim().toLowerCase();
      return { subject: payload.sub, email,
        name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0,150) : email.split('@')[0],
        provider: `neon:${endpoint}` };
    } catch (error) {
      if (error instanceof NeonAuthError) throw error;
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_JWKS_TIMEOUT')
        throw new NeonAuthError(503, 'تعذر التحقق من خدمة تسجيل الدخول. حاول مرة أخرى.');
      throw unauthorized();
    }
  };
}
let verifier: ReturnType<typeof createNeonVerifier> | undefined;
export const verifyNeonToken = (token: string) => {
  if (!config.neonAuthUrl) throw new NeonAuthError(503, 'خدمة تسجيل الدخول غير مهيأة.');
  verifier ||= createNeonVerifier(config.neonAuthUrl);
  return verifier(token);
};

const actorSelection = `SELECT u."UserId" AS "userId",u."FullName" AS "fullName",u."RoleId" AS "roleId",
 r."RoleName" AS "roleName" FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId"`;

export async function resolveNeonActor(identity: NeonIdentity, database: Database = { query: databaseQuery, transaction: databaseTransaction }): Promise<Actor> {
  try {
    return await database.transaction(async client => {
      // Subject and email locks serialize first sign-in, including two different
      // subjects racing to claim the same legacy email. All locks are xact-scoped.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`auth:subject:${identity.provider}:${identity.subject}`]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`auth:email:${identity.email}`]);
      const mapped = (await client.query(`SELECT "UserId" AS "userId" FROM "AuthIdentities"
        WHERE "Provider"=$1 AND "Subject"=$2`, [identity.provider, identity.subject])).rows[0];
      let userId: number;
      if (mapped) userId = mapped.userId;
      else {
        const matches = (await client.query(`SELECT "UserId" AS "userId" FROM "Users"
          WHERE lower(btrim("Email"))=$1 ORDER BY "UserId" LIMIT 2 FOR UPDATE`, [identity.email])).rows;
        if (matches.length > 1) throw new NeonAuthError(409, 'يوجد أكثر من حساب بهذا البريد. تواصل مع مسؤول الاتحاد لربط حسابك.');
        if (matches.length === 1) {
          userId = matches[0].userId;
          const existing = (await client.query(`SELECT 1 FROM "AuthIdentities" WHERE "Provider"=$1 AND "UserId"=$2`, [identity.provider, userId])).rowCount;
          if (existing) throw new NeonAuthError(409, 'هذا الحساب مرتبط بهوية أخرى. تواصل مع مسؤول الاتحاد.');
        } else {
          const username = 'neon_' + createHash('sha256').update(identity.provider + ':' + identity.subject).digest('hex').slice(0,32);
          const created = (await client.query(`INSERT INTO "Users"
            ("RoleId","FullName","Username","Email","PhoneWhatsapp","PasswordHash","CreatedAt")
            VALUES (10,$1,$2,$3,'',$4,NOW()) RETURNING "UserId" AS "userId"`,
          [identity.name, username, identity.email, '!neon-managed:' + randomBytes(32).toString('hex')])).rows[0];
          userId = created.userId;
        }
        await client.query(`INSERT INTO "AuthIdentities" ("Provider","Subject","UserId","CreatedAt") VALUES ($1,$2,$3,NOW())`,
          [identity.provider, identity.subject, userId]);
      }
      const actor = (await client.query(actorSelection + ' WHERE u."UserId"=$1', [userId])).rows[0] as Actor | undefined;
      if (!actor) throw unauthorized();
      return actor;
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01')
      throw new NeonAuthError(503, 'يلزم تهيئة ربط حسابات تسجيل الدخول قبل المتابعة.');
    throw error;
  }
}
