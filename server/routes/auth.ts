import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { cookieOptions, SESSION_COOKIE, startSession } from '../http/authenticate.js';
import type { AppContext } from '../http/context.js';
import { fail, HttpError } from '../http/errors.js';
import { type Actor, verifyPassword } from '../security.js';
import { loginSchema } from '../schemas.js';

/** Prefix of placeholder hashes for accounts managed by Neon; they can never sign in with a password. */
const NEON_MANAGED_PREFIX = '!neon-managed:';

/** Endpoints reachable without a session: auth settings, legacy login, closed registration and logout. */
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
    // The sign-in field accepts the username or the account's email. A username always wins; an email only
    // counts when exactly one account uses it (a shared email must not pick an account at random).
    const candidates = await query(
      `SELECT u."UserId" AS "userId", u."FullName" AS "fullName", u."RoleId" AS "roleId",
        u."PasswordHash" AS password, r."RoleName" AS "roleName", (u."Username"=$1) AS "byUsername"
        FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId"
        WHERE u."Username"=$1 OR lower(btrim(u."Email"))=lower(btrim($1))
        ORDER BY (u."Username"=$1) DESC LIMIT 2`,
      [body.username],
    );
    const user = candidates.find(row => row.byUsername) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!user || user.password.startsWith(NEON_MANAGED_PREFIX) || !verifyPassword(body.password, user.password))
      return fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    const actor: Actor = { userId: user.userId, fullName: user.fullName, roleId: user.roleId, roleName: user.roleName };
    startSession(res, actor.userId, user.password);
    res.json(actor);
  });

  // Accounts are created by the developer only (see routes/users.ts); open sign-up would hand out roles.
  router.post('/register', limiter, () => {
    fail(403, 'التسجيل مغلق. يضيف المطوّر الحسابات الجديدة، تواصل معه للحصول على حساب.');
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
