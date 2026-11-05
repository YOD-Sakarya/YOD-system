import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../http/context.js';
import { fail, id } from '../http/errors.js';
import { requireDeveloper } from '../http/requireDeveloper.js';
import { DEVELOPER_ROLE_ID, generateTemporaryPassword, hashPassword, hashTemporaryPassword } from '../security.js';
import { config } from '../config.js';
import { createManagedAccounts } from '../services/managedAccounts.js';
import { activateSeat, isDeliverableEmail } from '../services/activation.js';

const userFields = {
  fullName: z.string().trim().min(3).max(150),
  username: z.string().trim().min(3).max(100),
  email: z.email().max(254),
  phoneWhatsapp: z.string().trim().max(30).default(''),
  roleId: z.number().int().positive(),
};
const createUserSchema = z.object({ ...userFields, password: z.string().min(10).max(256).optional() });
const updateUserSchema = z.object({ ...userFields, password: z.string().min(10).max(256).optional() });

/** Better Auth mails the activation code, so the address must belong to a real mailbox. */
const EMAIL_MUST_BE_REAL = 'أدخل بريدًا إلكترونيًا حقيقيًا يستطيع صاحبه استلام رمز التفعيل.';

const userSelection = `SELECT u."UserId" AS "userId", u."FullName" AS "fullName", u."Username" AS username,
  u."Email" AS email, u."PhoneWhatsapp" AS "phoneWhatsapp", u."RoleId" AS "roleId", r."RoleName" AS "roleName",
  u."CreatedAt" AS "createdAt", (SELECT count(*)::int FROM "Documents" d WHERE d."OwnerUserId"=u."UserId") AS "documentCount"
  FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId"`;

/**
 * User administration for the developer. Each year the people in the seats change, so a seat (user row) can be
 * handed to a new person at any time by editing the account in place. Documents stay attached to the account.
 */
export function userRoutes({ query, transaction, authProvider, managedAccounts, audit }: AppContext) {
  const router = Router();
  router.use(requireDeveloper);
  const managed = managedAccounts || createManagedAccounts(query);
  const provider = `neon:${config.neonAuthUrl}`;
  /** Mail and directory cleanup happen after commit; failures must never masquerade as an unsaved seat. */
  async function finish(email: string, oldSubject?: string) {
    const warnings: string[] = [];
    if (oldSubject) {
      try {
        await managed.remove(oldSubject);
      } catch {
        warnings.push('تم إيقاف وصول المستخدم السابق، لكن تعذر حذفه من دليل Neon.');
      }
    }
    try {
      await managed.sendActivation(email);
    } catch {
      warnings.push('تم حفظ الحساب، لكن تعذر إرسال رمز التفعيل. استخدم إعادة إرسال التفعيل.');
    }
    return warnings.length ? warnings.join(' ') : 'تم حفظ الحساب وإرسال رمز التفعيل إلى البريد الإلكتروني.';
  }

  router.get('/', async (_req, res) => {
    res.json(await query(userSelection + ' ORDER BY u."RoleId", u."FullName"'));
  });

  router.post('/', async (req, res) => {
    const body = createUserSchema.parse(req.body);
    if (authProvider === 'neon' && body.password) fail(400, 'يختار المستخدم كلمة مروره من رسالة التفعيل.');
    if (authProvider === 'neon' && !isDeliverableEmail(body.email)) fail(400, EMAIL_MUST_BE_REAL);
    if (authProvider === 'legacy' && !body.password) fail(400, 'أدخل كلمة مرور للحساب.');
    const userId = await transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`register:${body.username}`]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`auth:email:${body.email.toLowerCase()}`]);
      if (!(await client.query('SELECT 1 FROM "Roles" WHERE "RoleId"=$1', [body.roleId])).rowCount)
        fail(400, 'الدور غير موجود.');
      if ((await client.query('SELECT 1 FROM "Users" WHERE lower("Username")=lower($1)', [body.username])).rowCount)
        fail(409, 'اسم المستخدم مستخدم بالفعل.');
      if ((await client.query('SELECT 1 FROM "Users" WHERE lower(btrim("Email"))=lower($1)', [body.email])).rowCount)
        fail(409, 'البريد الإلكتروني مستخدم بالفعل.');
      const identity = authProvider === 'neon' ? await managed.provision(body.email, body.fullName) : null;
      const created = await client.query(
        `INSERT INTO "Users" ("RoleId","FullName","Username","Email","PhoneWhatsapp","PasswordHash","CreatedAt")
          VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING "UserId" AS id`,
        [
          body.roleId,
          body.fullName,
          body.username,
          body.email.trim().toLowerCase(),
          body.phoneWhatsapp,
          identity?.marker || hashTemporaryPassword(body.password!),
        ],
      );
      if (identity)
        await client.query('INSERT INTO "AuthIdentities" ("Provider","Subject","UserId") VALUES ($1,$2,$3)', [
          provider,
          identity.subject,
          created.rows[0].id,
        ]);
      return created.rows[0].id as number;
    });
    await audit(req, {
      action: 'user.create',
      targetType: 'user',
      targetId: userId,
      summary: `أنشأ حساب «${body.fullName}» (${body.username})`,
      details: { roleId: body.roleId, email: body.email },
    });
    res.status(201).json({ userId, message: authProvider === 'neon' ? await finish(body.email) : 'تم إنشاء الحساب.' });
  });

  router.put('/:id', async (req, res) => {
    const userId = id(req.params.id);
    const body = updateUserSchema.parse(req.body);
    if (authProvider === 'neon' && body.password) fail(400, 'استخدم إرسال رمز إعادة تعيين كلمة المرور.');
    if (authProvider === 'neon' && !isDeliverableEmail(body.email)) fail(400, EMAIL_MUST_BE_REAL);
    let activation = false;
    let oldSubject: string | undefined;
    await transaction(async client => {
      // Serialise with sign-ups/other edits of the same username.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`register:${body.username}`]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`auth:email:${body.email.toLowerCase()}`]);
      const current = (await client.query('SELECT * FROM "Users" WHERE "UserId"=$1 FOR UPDATE', [userId])).rows[0];
      if (!current) fail(404, 'المستخدم غير موجود.');
      if (!(await client.query('SELECT 1 FROM "Roles" WHERE "RoleId"=$1', [body.roleId])).rowCount)
        fail(400, 'الدور غير موجود.');
      if (
        (
          await client.query('SELECT 1 FROM "Users" WHERE lower("Username")=lower($1) AND "UserId"<>$2', [
            body.username,
            userId,
          ])
        ).rowCount
      )
        fail(409, 'اسم المستخدم مستخدم بالفعل.');
      if (
        (
          await client.query('SELECT 1 FROM "Users" WHERE lower(btrim("Email"))=lower($1) AND "UserId"<>$2', [
            body.email,
            userId,
          ])
        ).rowCount
      )
        fail(409, 'البريد الإلكتروني مستخدم بالفعل.');

      // Never leave the system without a developer (the last one cannot be demoted).
      if (current.RoleId === DEVELOPER_ROLE_ID && body.roleId !== DEVELOPER_ROLE_ID) {
        const others = await client.query('SELECT 1 FROM "Users" WHERE "RoleId"=$1 AND "UserId"<>$2', [
          DEVELOPER_ROLE_ID,
          userId,
        ]);
        if (!others.rowCount) fail(409, 'لا يمكن إزالة دور المطوّر من آخر مطوّر في النظام.');
      }

      // Handing the seat to a new person (new username) must not keep the previous person's password in legacy mode.
      const newPerson = current.Username.toLowerCase() !== body.username.toLowerCase();
      const emailChanged = current.Email.trim().toLowerCase() !== body.email.trim().toLowerCase();
      if (authProvider === 'neon' && newPerson && !emailChanged)
        fail(400, 'عند تسليم المقعد لشخص جديد أدخل بريده الإلكتروني الجديد.');
      if (newPerson && authProvider === 'legacy' && !body.password)
        fail(400, 'أدخل كلمة مرور جديدة عند تغيير اسم المستخدم.');
      const identity =
        authProvider === 'neon' && emailChanged ? await managed.provision(body.email, body.fullName) : null;
      if (identity) {
        const previous = (
          await client.query('SELECT id FROM neon_auth."user" WHERE lower(email)=lower($1)', [current.Email.trim()])
        ).rows[0];
        oldSubject = previous?.id;
        // Revoke every linked subject, including a subject whose managed email was changed separately.
        await client.query(
          `INSERT INTO "AuthRevocations" ("Provider","Subject") SELECT "Provider","Subject" FROM "AuthIdentities" WHERE "UserId"=$1 ON CONFLICT DO NOTHING`,
          [userId],
        );
        if (oldSubject)
          await client.query(
            'INSERT INTO "AuthRevocations" ("Provider","Subject") VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [provider, oldSubject],
          );
        await client.query('DELETE FROM "AuthIdentities" WHERE "UserId"=$1', [userId]);
        await client.query('INSERT INTO "AuthIdentities" ("Provider","Subject","UserId") VALUES ($1,$2,$3)', [
          provider,
          identity.subject,
          userId,
        ]);
        await client.query('UPDATE "Users" SET "PasswordHash"=$1 WHERE "UserId"=$2', [identity.marker, userId]);
        activation = true;
      }

      await client.query(
        `UPDATE "Users" SET "FullName"=$1,"Username"=$2,"Email"=$3,"PhoneWhatsapp"=$4,"RoleId"=$5 WHERE "UserId"=$6`,
        [body.fullName, body.username, body.email, body.phoneWhatsapp, body.roleId, userId],
      );
      if (body.password && authProvider === 'legacy')
        await client.query('UPDATE "Users" SET "PasswordHash"=$1 WHERE "UserId"=$2', [
          // Editing your own seat keeps you signed in; anyone else must replace the password you set.
          userId === req.actor.userId ? hashPassword(body.password) : hashTemporaryPassword(body.password),
          userId,
        ]);

      // Neon mode: unlink the previous person's Neon identity so only the new email can claim this seat.
      if (authProvider === 'legacy' && emailChanged) {
        const table = await client.query(`SELECT to_regclass('"AuthIdentities"') AS name`);
        if (table.rows[0].name) await client.query('DELETE FROM "AuthIdentities" WHERE "UserId"=$1', [userId]);
      }
    });
    await audit(req, {
      action: 'user.update',
      targetType: 'user',
      targetId: userId,
      summary: `عدّل حساب «${body.fullName}» (${body.username})`,
      // Only whether a password was set, never the password itself.
      details: { roleId: body.roleId, email: body.email, passwordChanged: Boolean(body.password) },
    });
    res.json({ message: activation ? await finish(body.email, oldSubject) : 'تم حفظ بيانات المستخدم.' });
  });

  /**
   * Sends activation codes to seats that have no Better Auth login yet (the switch-over). Works in small batches so a
   * request stays well inside the hosting time limit; the developer presses the button again until none are left.
   */
  router.post('/invite-pending', async (_req, res) => {
    if (authProvider !== 'neon') fail(409, 'إرسال الدعوات متاح مع Better Auth فقط.');
    // Without the management settings no seat could be linked, and every press would mail the same people again.
    if (!config.neonApiKey || !config.neonProjectId || !config.neonBranchId)
      fail(503, 'يلزم إعداد NEON_API_KEY وNEON_PROJECT_ID وNEON_BRANCH_ID قبل إرسال الدعوات.');
    const batch = 8;
    const pending = await query(
      `SELECT u."UserId" AS id, u."FullName" AS name, u."Email" AS email FROM "Users" u
        WHERE NOT EXISTS (SELECT 1 FROM "AuthIdentities" a WHERE a."UserId"=u."UserId")
        ORDER BY u."UserId"`,
    );
    const sent: string[] = [];
    const failed: string[] = [];
    for (const seat of pending.slice(0, batch)) {
      try {
        const outcome = await activateSeat({ transaction, managed }, seat.email, { ignoreCooldown: true });
        (outcome === 'sent' ? sent : failed).push(seat.name);
      } catch {
        failed.push(seat.name);
      }
    }
    res.json({
      sent: sent.length,
      failed,
      remaining: Math.max(0, pending.length - batch),
      message: sent.length ? `أُرسلت الدعوات إلى ${sent.length} من المقاعد.` : 'لا توجد دعوات جديدة لإرسالها.',
    });
  });

  router.post('/:id/reset-password', async (req, res) => {
    if (authProvider !== 'neon') {
      // Legacy mode: issue a new temporary password. It is shown once; only its hash is stored.
      const userId = id(req.params.id);
      if (userId === req.actor.userId) fail(400, 'غيّر كلمة مرورك من صفحة حسابي.');
      const temporaryPassword = generateTemporaryPassword();
      const updated = await query('UPDATE "Users" SET "PasswordHash"=$1 WHERE "UserId"=$2 RETURNING 1', [
        hashTemporaryPassword(temporaryPassword),
        userId,
      ]);
      if (!updated.length) fail(404, 'المستخدم غير موجود.');
      await audit(req, {
        action: 'user.reset_password',
        targetType: 'user',
        targetId: userId,
        summary: 'أنشأ كلمة مرور مؤقتة جديدة لمستخدم',
      });
      return res.set('Cache-Control', 'no-store').json({
        temporaryPassword,
        message: 'تم إنشاء كلمة مرور مؤقتة. أرسلها للمستخدم، وسيختار كلمة جديدة عند أول دخول.',
      });
    }
    const [user] = await query('SELECT "Email" AS email FROM "Users" WHERE "UserId"=$1', [id(req.params.id)]);
    if (!user) fail(404, 'المستخدم غير موجود.');
    await managed.sendActivation(user.email);
    await audit(req, {
      action: 'user.reset_password',
      targetType: 'user',
      targetId: id(req.params.id),
      summary: 'أرسل رمز إعادة تعيين كلمة المرور إلى مستخدم',
    });
    res.json({ message: 'تم إرسال رمز تعيين كلمة المرور إلى المستخدم.' });
  });

  return router;
}
