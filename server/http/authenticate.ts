import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { resolveNeonActor, verifyNeonToken } from '../neon-auth.js';
import { type Actor, sessionVersion } from '../security.js';
import type { AppContext } from './context.js';
import { HttpError } from './errors.js';

export const SESSION_COOKIE = 'yod_session';
export const JWT_ISSUER = 'yod-express';
export const JWT_AUDIENCE = 'yod-react';

export const SESSION_SECONDS = 24 * 60 * 60;

/** Cookie settings shared by login (set) and logout (clear); scoped to the API only. */
export const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: config.production, path: '/api' };

/** Neon mode: verify the bearer JWT and map it to a local user. */
async function actorFromBearer(req: Request, context: AppContext): Promise<Actor> {
  const token = req.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new HttpError(401, 'يرجى تسجيل الدخول.');
  const identity = await (context.verifyNeon || verifyNeonToken)(token);
  return resolveNeonActor(identity, { query: context.query, transaction: context.transaction });
}

/** Legacy mode: verify the signed session cookie and load the user from the database. */
async function actorFromCookie(req: Request, context: AppContext): Promise<Actor> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) throw new HttpError(401, 'يرجى تسجيل الدخول.');
  const claims = jwt.verify(token, config.jwtSecret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (typeof claims === 'string' || !claims.sub || !/^\d+$/.test(claims.sub))
    throw new HttpError(401, 'الجلسة غير صالحة.');
  const [row] = await context.query(
    `SELECT u."UserId" AS "userId",u."FullName" AS "fullName",u."RoleId" AS "roleId",
      r."RoleName" AS "roleName",u."PasswordHash" AS "passwordHash" FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId" WHERE u."UserId"=$1`,
    [Number(claims.sub)],
  );
  if (!row) throw new HttpError(401, 'الحساب غير موجود.');
  // A changed password (e.g. the seat was handed to someone else) invalidates every older session.
  if (claims.ver !== sessionVersion(String(row.passwordHash)))
    throw new HttpError(401, 'انتهت الجلسة. سجّل الدخول مجددًا.');
  const { passwordHash: _omit, ...actor } = row;
  return actor as Actor;
}

/** Signs the session cookie for a user. Bound to the password hash, so a password change ends older sessions. */
export function startSession(res: Response, userId: number, passwordHash: string) {
  const token = jwt.sign({ sub: String(userId), ver: sessionVersion(passwordHash) }, config.jwtSecret, {
    expiresIn: SESSION_SECONDS,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 });
}

/** Requires a valid session on everything mounted after it and exposes the user as `req.actor`. */
export function authenticate(context: AppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.actor =
        context.authProvider === 'neon' ? await actorFromBearer(req, context) : await actorFromCookie(req, context);
      if (req.actor.mustChangePassword && !(req.method === 'GET' && req.path === '/auth/me'))
        throw new HttpError(403, 'يجب تغيير كلمة المرور المؤقتة قبل استخدام مساحة العمل.');
      next();
    } catch (error) {
      next(error instanceof jwt.JsonWebTokenError ? new HttpError(401, 'انتهت الجلسة. سجّل الدخول مجددًا.') : error);
    }
  };
}
