import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../http/context.js';
import { fail, id } from '../http/errors.js';
import { requireDeveloper } from '../http/requireDeveloper.js';
import { DEVELOPER_ROLE_ID, hashPassword } from '../security.js';

const userFields = {
  fullName: z.string().trim().min(3).max(150),
  username: z.string().trim().min(3).max(100),
  email: z.email().max(254),
  phoneWhatsapp: z.string().trim().max(30).default(''),
  roleId: z.number().int().positive(),
};
const createUserSchema = z.object({ ...userFields, password: z.string().min(10).max(256) });
const updateUserSchema = z.object({ ...userFields, password: z.string().min(10).max(256).optional() });

const userSelection = `SELECT u."UserId" AS "userId", u."FullName" AS "fullName", u."Username" AS username,
  u."Email" AS email, u."PhoneWhatsapp" AS "phoneWhatsapp", u."RoleId" AS "roleId", r."RoleName" AS "roleName",
  u."CreatedAt" AS "createdAt", (SELECT count(*)::int FROM "Documents" d WHERE d."OwnerUserId"=u."UserId") AS "documentCount"
  FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId"`;

/**
 * User administration for the developer. Each year the people in the seats change, so a seat (user row) can be
 * handed to a new person at any time by editing the account in place. Documents stay attached to the account.
 */
export function userRoutes({ query, transaction, authProvider }: AppContext) {
  const router = Router();
  router.use(requireDeveloper);

  router.get('/', async (_req, res) => {
    res.json(await query(userSelection + ' ORDER BY u."RoleId", u."FullName"'));
  });

  router.post('/', async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const userId = await transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`register:${body.username}`]);
      if (!(await client.query('SELECT 1 FROM "Roles" WHERE "RoleId"=$1', [body.roleId])).rowCount)
        fail(400, 'الدور غير موجود.');
      if ((await client.query('SELECT 1 FROM "Users" WHERE lower("Username")=lower($1)', [body.username])).rowCount)
        fail(409, 'اسم المستخدم مستخدم بالفعل.');
      if ((await client.query('SELECT 1 FROM "Users" WHERE lower(btrim("Email"))=lower($1)', [body.email])).rowCount)
        fail(409, 'البريد الإلكتروني مستخدم بالفعل.');
      const created = await client.query(
        `INSERT INTO "Users" ("RoleId","FullName","Username","Email","PhoneWhatsapp","PasswordHash","CreatedAt")
          VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING "UserId" AS id`,
        [body.roleId, body.fullName, body.username, body.email, body.phoneWhatsapp, hashPassword(body.password)],
      );
      return created.rows[0].id as number;
    });
    res.status(201).json({ userId });
  });

  router.put('/:id', async (req, res) => {
    const userId = id(req.params.id);
    const body = updateUserSchema.parse(req.body);
    await transaction(async client => {
      // Serialise with sign-ups/other edits of the same username.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`register:${body.username}`]);
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
      if (newPerson && authProvider === 'legacy' && !body.password)
        fail(400, 'أدخل كلمة مرور جديدة عند تغيير اسم المستخدم.');

      await client.query(
        `UPDATE "Users" SET "FullName"=$1,"Username"=$2,"Email"=$3,"PhoneWhatsapp"=$4,"RoleId"=$5 WHERE "UserId"=$6`,
        [body.fullName, body.username, body.email, body.phoneWhatsapp, body.roleId, userId],
      );
      if (body.password)
        await client.query('UPDATE "Users" SET "PasswordHash"=$1 WHERE "UserId"=$2', [
          hashPassword(body.password),
          userId,
        ]);

      // Neon mode: unlink the previous person's Neon identity so only the new email can claim this seat.
      if (current.Email.trim().toLowerCase() !== body.email.trim().toLowerCase()) {
        const table = await client.query(`SELECT to_regclass('"AuthIdentities"') AS name`);
        if (table.rows[0].name) await client.query('DELETE FROM "AuthIdentities" WHERE "UserId"=$1', [userId]);
      }
    });
    res.json({ message: 'تم حفظ بيانات المستخدم.' });
  });

  return router;
}
