import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { cookieOptions, JWT_AUDIENCE, JWT_ISSUER, SESSION_COOKIE } from '../http/authenticate.js';
import type { AppContext } from '../http/context.js';
import { fail, HttpError } from '../http/errors.js';
import { type Actor, hashPassword, sessionVersion, verifyPassword } from '../security.js';
import { loginSchema, registerSchema } from '../schemas.js';

const SESSION_SECONDS = 24 * 60 * 60;
/** Role assigned to every self-registered account (observer: read-only). */
const OBSERVER_ROLE_ID = 10;
/** Prefix of placeholder hashes for accounts managed by Neon; they can never sign in with a password. */
const NEON_MANAGED_PREFIX = '!neon-managed:';

/** Endpoints reachable without a session: auth settings, legacy login/registration and logout. */
export function publicAuthRoutes({ query, transaction, authProvider }: AppContext) {
  const router = Router();

  // The client reads this to decide which sign-in screen to show.
  router.get('/config', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ provider: authProvider, authUrl: config.neonAuthUrl || null });
  });

  // Password endpoints are disabled when Neon owns authentication.
  router.use(['/login', '/register'], (_req, _res, next) => {
    next(authProvider === 'neon' ? new HttpError(410, 'استخدم خدمة تسجيل الدخول المُدارة للمتابعة.') : undefined);
  });

  // Brute-force protection for the password endpoints.
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.' },
  });

  router.post('/login', limiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const [user] = await query(
      `SELECT u."UserId" AS "userId", u."FullName" AS "fullName", u."RoleId" AS "roleId",
        u."PasswordHash" AS password, r."RoleName" AS "roleName" FROM "Users" u JOIN "Roles" r
        ON r."RoleId"=u."RoleId" WHERE u."Username"=$1 LIMIT 1`,
      [body.username],
    );
    if (!user || user.password.startsWith(NEON_MANAGED_PREFIX) || !verifyPassword(body.password, user.password))
      fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    const actor: Actor = { userId: user.userId, fullName: user.fullName, roleId: user.roleId, roleName: user.roleName };
    const token = jwt.sign({ sub: String(actor.userId), ver: sessionVersion(user.password) }, config.jwtSecret, {
      expiresIn: SESSION_SECONDS,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS * 1000 }).json(actor);
  });

  router.post('/register', limiter, async (req, res) => {
    const body = registerSchema.parse(req.body);
    await transaction(async client => {
      // Serialise concurrent sign-ups for the same username so the uniqueness check below cannot race.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`register:${body.username}`]);
      if ((await client.query('SELECT 1 FROM "Users" WHERE "Username"=$1', [body.username])).rowCount)
        fail(409, 'اسم المستخدم مستخدم بالفعل.');
      // Self-registration never grants a committee or leadership role.
      await client.query(
        `INSERT INTO "Users" ("RoleId","FullName","Username","Email","PhoneWhatsapp","PasswordHash","CreatedAt")
          VALUES (${OBSERVER_ROLE_ID},$1,$2,$3,$4,$5,NOW())`,
        [body.fullName, body.username, body.email, body.phoneWhatsapp, hashPassword(body.password)],
      );
    });
    res.status(201).json({ message: 'تم إنشاء الحساب بدور مراقب. يمكنك تسجيل الدخول.' });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions).sendStatus(204);
  });

  return router;
}

/** Session endpoints; mounted after authentication. */
export function sessionRoutes() {
  const router = Router();
  router.get('/me', (req, res) => {
    res.set('Cache-Control', 'no-store').json(req.actor);
  });
  return router;
}
