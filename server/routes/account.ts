import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { startSession } from '../http/authenticate.js';
import type { AppContext } from '../http/context.js';
import { fail } from '../http/errors.js';
import { changeEmailSchema, changePasswordSchema, changeUsernameSchema } from '../schemas.js';
import { hashPassword, verifyPassword } from '../security.js';

/**
 * Self-service account settings: every signed-in user can change their own password and email.
 * Both need the current password. In Neon mode the auth service owns credentials, so they are refused here.
 * A wrong current password answers 403 (not 401), which the client would treat as an expired session.
 */
export function accountRoutes({ query, authProvider, audit }: AppContext) {
  const router = Router();
  // Same brute-force protection as sign-in: these endpoints also check a password.
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'محاولات كثيرة. حاول مرة أخرى بعد قليل.' },
  });

  const ensureManagedLocally = () => {
    if (authProvider === 'neon') fail(409, 'تُدار بيانات الدخول عبر خدمة تسجيل الدخول. استخدم استعادة كلمة المرور.');
  };

  async function loadAccount(userId: number) {
    const [row] = await query(
      `SELECT "FullName" AS "fullName","Username" AS username,"Email" AS email,"PhoneWhatsapp" AS "phoneWhatsapp",
        "PasswordHash" AS "passwordHash" FROM "Users" WHERE "UserId"=$1`,
      [userId],
    );
    return row ?? fail(404, 'الحساب غير موجود.');
  }

  router.get('/', async (req, res) => {
    const { passwordHash: _hash, ...profile } = await loadAccount(req.actor.userId);
    res.set('Cache-Control', 'no-store').json({ ...profile, canChangeCredentials: authProvider === 'legacy' });
  });

  router.put('/password', limiter, async (req, res) => {
    ensureManagedLocally();
    const body = changePasswordSchema.parse(req.body);
    const account = await loadAccount(req.actor.userId);
    if (!verifyPassword(body.currentPassword, account.passwordHash)) fail(403, 'كلمة المرور الحالية غير صحيحة.');
    if (body.newPassword === body.currentPassword) fail(400, 'اختر كلمة مرور مختلفة عن الحالية.');
    const passwordHash = hashPassword(body.newPassword);
    await query('UPDATE "Users" SET "PasswordHash"=$1 WHERE "UserId"=$2', [passwordHash, req.actor.userId]);
    // Older sessions (other devices) stop working; this one continues with a fresh cookie.
    startSession(res, req.actor.userId, passwordHash);
    await audit(req, {
      action: 'account.password',
      targetType: 'user',
      targetId: req.actor.userId,
      summary: 'غيّر كلمة مروره',
    });
    res.json({ message: 'تم تغيير كلمة المرور.' });
  });

  router.put('/email', limiter, async (req, res) => {
    ensureManagedLocally();
    const body = changeEmailSchema.parse(req.body);
    const account = await loadAccount(req.actor.userId);
    if (!verifyPassword(body.currentPassword, account.passwordHash)) fail(403, 'كلمة المرور الحالية غير صحيحة.');
    const taken = await query('SELECT 1 FROM "Users" WHERE lower(btrim("Email"))=lower($1) AND "UserId"<>$2', [
      body.email,
      req.actor.userId,
    ]);
    if (taken.length) fail(409, 'البريد الإلكتروني مستخدم بالفعل.');
    await query('UPDATE "Users" SET "Email"=$1 WHERE "UserId"=$2', [body.email, req.actor.userId]);
    await audit(req, {
      action: 'account.email',
      targetType: 'user',
      targetId: req.actor.userId,
      summary: `غيّر بريده الإلكتروني إلى ${body.email}`,
      details: { from: account.email, to: body.email },
    });
    res.json({ message: 'تم تحديث البريد الإلكتروني.', email: body.email });
  });

  // Documents, votes and reviews belong to the account, not the name, so renaming never touches them. The session
  // identifies the account by id, so the member stays signed in.
  router.put('/username', limiter, async (req, res) => {
    ensureManagedLocally();
    const parsed = changeUsernameSchema.safeParse(req.body);
    if (!parsed.success) return fail(400, 'اسم المستخدم من 3 إلى 100 حرف أو رقم أو . _ - بدون مسافات أو @.');
    const body = parsed.data;
    const account = await loadAccount(req.actor.userId);
    if (!verifyPassword(body.currentPassword, account.passwordHash)) fail(403, 'كلمة المرور الحالية غير صحيحة.');
    const taken = await query('SELECT 1 FROM "Users" WHERE lower("Username")=lower($1) AND "UserId"<>$2', [
      body.username,
      req.actor.userId,
    ]);
    if (taken.length) fail(409, 'اسم المستخدم مستخدم بالفعل.');
    await query('UPDATE "Users" SET "Username"=$1 WHERE "UserId"=$2', [body.username, req.actor.userId]);
    await audit(req, {
      action: 'account.username',
      targetType: 'user',
      targetId: req.actor.userId,
      summary: `غيّر اسم المستخدم من «${account.username}» إلى «${body.username}»`,
      details: { from: account.username, to: body.username },
    });
    res.json({ message: 'تم تحديث اسم المستخدم. استخدمه في تسجيل الدخول القادم.', username: body.username });
  });

  return router;
}
