import { pool } from './db.js';
import { hashPassword, isPlainTextPassword } from './security.js';

/**
 * One-off security fix: accounts migrated from the original .NET app still keep their password as plain text.
 * This replaces each one with a salted scrypt hash. Members notice nothing (sign-in accepts hashes), and no value is
 * ever printed. It is idempotent and does nothing unless run with --apply.
 *   npm run db:hash-passwords            (dry run: counts only)
 *   npm run db:hash-passwords -- --apply
 */
const apply = process.argv.includes('--apply');
try {
  const rows = (await pool.query('SELECT "UserId" AS id, "PasswordHash" AS stored FROM "Users"')).rows;
  const plain = rows.filter(row => isPlainTextPassword(String(row.stored)));
  console.log(`${plain.length} of ${rows.length} accounts store a plain-text password.`);
  if (!apply) console.log('Dry run: nothing changed. Re-run with --apply to hash them.');
  else {
    let done = 0;
    for (const row of plain) {
      // Compare-and-set: a password changed meanwhile is never overwritten with an old value.
      const result = await pool.query('UPDATE "Users" SET "PasswordHash"=$1 WHERE "UserId"=$2 AND "PasswordHash"=$3', [
        hashPassword(String(row.stored)),
        row.id,
        row.stored,
      ]);
      done += result.rowCount ?? 0;
    }
    console.log(`Hashed ${done} passwords.`);
  }
} catch (error) {
  console.error('Could not process passwords:', error instanceof Error ? error.name : 'service error');
  process.exitCode = 1;
} finally {
  await pool.end();
}
