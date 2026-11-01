import { pool } from './db.js';
import { DEVELOPER_ROLE_ID, hashPassword } from './security.js';

/**
 * Creates (or promotes) the developer account. Credentials come from the environment so they never
 * land in shell history or the repository:
 *   DEV_USERNAME, DEV_EMAIL, DEV_FULLNAME, DEV_PASSWORD (10+ characters)
 * Run with `npm run create-developer` after `npm run db:upgrade`.
 */
const { DEV_USERNAME, DEV_EMAIL, DEV_FULLNAME, DEV_PASSWORD } = process.env;
if (!DEV_USERNAME || !DEV_EMAIL || !DEV_FULLNAME || !DEV_PASSWORD || DEV_PASSWORD.length < 10) {
  console.error('Set DEV_USERNAME, DEV_EMAIL, DEV_FULLNAME and DEV_PASSWORD (10+ characters).');
  process.exit(1);
}

try {
  const role = await pool.query('SELECT 1 FROM "Roles" WHERE "RoleId"=$1', [DEVELOPER_ROLE_ID]);
  if (!role.rowCount) throw new Error('Developer role missing. Run `npm run db:upgrade` first.');
  const existing = await pool.query('SELECT "UserId" FROM "Users" WHERE "Username"=$1', [DEV_USERNAME]);
  if (existing.rowCount) {
    await pool.query('UPDATE "Users" SET "RoleId"=$1,"PasswordHash"=$2,"Email"=$3,"FullName"=$4 WHERE "UserId"=$5', [
      DEVELOPER_ROLE_ID,
      hashPassword(DEV_PASSWORD),
      DEV_EMAIL,
      DEV_FULLNAME,
      existing.rows[0].UserId,
    ]);
    console.log('Existing account promoted to developer and its password reset.');
  } else {
    await pool.query(
      `INSERT INTO "Users" ("RoleId","FullName","Username","Email","PhoneWhatsapp","PasswordHash","CreatedAt")
        VALUES ($1,$2,$3,$4,'',$5,NOW())`,
      [DEVELOPER_ROLE_ID, DEV_FULLNAME, DEV_USERNAME, DEV_EMAIL, hashPassword(DEV_PASSWORD)],
    );
    console.log('Developer account created.');
  }
} catch (error) {
  console.error('Could not create the developer:', error instanceof Error ? error.message : 'service error');
  process.exitCode = 1;
} finally {
  await pool.end();
}
