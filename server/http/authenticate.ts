import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { resolveNeonActor, verifyNeonToken } from '../neon-auth.js';
import type { Actor } from '../security.js';
import type { AppContext } from './context.js';
import { HttpError } from './errors.js';

export const SESSION_COOKIE = 'yod_session';
export const JWT_ISSUER = 'yod-express';
export const JWT_AUDIENCE = 'yod-react';

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
  const [actor] = await context.query(
    `SELECT u."UserId" AS "userId",u."FullName" AS "fullName",u."RoleId" AS "roleId",
      r."RoleName" AS "roleName" FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId" WHERE u."UserId"=$1`,
    [Number(claims.sub)],
  );
  if (!actor) throw new HttpError(401, 'الحساب غير موجود.');
  return actor as Actor;
}

/** Requires a valid session on everything mounted after it and exposes the user as `req.actor`. */
export function authenticate(context: AppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.actor =
        context.authProvider === 'neon' ? await actorFromBearer(req, context) : await actorFromCookie(req, context);
      next();
    } catch (error) {
      next(error instanceof jwt.JsonWebTokenError ? new HttpError(401, 'انتهت الجلسة. سجّل الدخول مجددًا.') : error);
    }
  };
}
