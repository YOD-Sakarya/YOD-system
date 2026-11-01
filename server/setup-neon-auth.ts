import { pool } from './db.js';
import { config } from './config.js';

// Deliberate one-time setup. The HTTP server never performs schema changes.
if (!process.env.DATABASE_URL) throw new Error('Set an explicit destination DATABASE_URL before setting up managed auth.');
if (!config.neonAuthUrl) throw new Error('Set NEON_AUTH_URL before setting up managed auth.');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['yod:setup-neon-auth']);
  await client.query(`CREATE TABLE IF NOT EXISTS "AuthIdentities" (
    "Provider" text NOT NULL,
    "Subject" text NOT NULL,
    "UserId" integer NOT NULL REFERENCES "Users"("UserId") ON DELETE CASCADE,
    "CreatedAt" timestamp with time zone NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("Provider","Subject"),
    UNIQUE ("Provider","UserId")
  )`);
  await client.query('COMMIT');
  console.log('Managed auth identity mapping is ready. Existing users and passwords were not changed.');
} catch {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Managed auth setup failed; transaction rolled back.'); process.exitCode = 1;
} finally { client.release(); await pool.end(); }
