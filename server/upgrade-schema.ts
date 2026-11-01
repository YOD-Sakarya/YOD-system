import { pool } from './db.js';

/**
 * One-off, idempotent upgrade that adds yearly cycles and the developer role.
 * Everything is additive: no row is deleted and existing columns are untouched, so the previous
 * deployment keeps working while this runs. Run with `npm run db:upgrade`.
 *
 * Existing documents and vote sessions become the PREVIOUS cycle; a new, empty cycle starts as the current one.
 */
const PREVIOUS = { name: '2025/2026', start: '2025-09-01', end: '2026-08-31' };
const CURRENT = { name: '2026/2027', start: '2026-09-01' };
const DEVELOPER_ROLE = { id: 11, name: 'مطوّر' };

const client = await pool.connect();
try {
  await client.query('BEGIN');

  await client.query(`CREATE TABLE IF NOT EXISTS "Cycles" (
    "CycleId" SERIAL PRIMARY KEY,
    "Name" text NOT NULL UNIQUE,
    "StartDate" date NOT NULL,
    "EndDate" date,
    "IsCurrent" boolean NOT NULL DEFAULT false,
    "CreatedAt" timestamptz NOT NULL DEFAULT NOW())`);
  // At most one current cycle, enforced by the database.
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Cycles_single_current" ON "Cycles" ("IsCurrent") WHERE "IsCurrent"`,
  );

  // Nullable on purpose: the previous app version inserts rows without a cycle until it is replaced.
  await client.query(
    'ALTER TABLE "Documents" ADD COLUMN IF NOT EXISTS "CycleId" integer REFERENCES "Cycles"("CycleId")',
  );
  await client.query(
    'ALTER TABLE "VoteSessions" ADD COLUMN IF NOT EXISTS "CycleId" integer REFERENCES "Cycles"("CycleId")',
  );
  await client.query('CREATE INDEX IF NOT EXISTS "Documents_CycleId" ON "Documents" ("CycleId")');
  await client.query('CREATE INDEX IF NOT EXISTS "VoteSessions_CycleId" ON "VoteSessions" ("CycleId")');

  const existing = await client.query('SELECT count(*)::int AS count FROM "Cycles"');
  if (existing.rows[0].count === 0) {
    await client.query('INSERT INTO "Cycles" ("Name","StartDate","EndDate","IsCurrent") VALUES ($1,$2,$3,false)', [
      PREVIOUS.name,
      PREVIOUS.start,
      PREVIOUS.end,
    ]);
    await client.query('INSERT INTO "Cycles" ("Name","StartDate","IsCurrent") VALUES ($1,$2,true)', [
      CURRENT.name,
      CURRENT.start,
    ]);
    console.log(`Created cycles ${PREVIOUS.name} (previous) and ${CURRENT.name} (current).`);
  }

  // Everything created before cycles existed belongs to the earliest cycle.
  const first = (await client.query('SELECT "CycleId" FROM "Cycles" ORDER BY "StartDate" LIMIT 1')).rows[0].CycleId;
  const docs = await client.query('UPDATE "Documents" SET "CycleId"=$1 WHERE "CycleId" IS NULL', [first]);
  const votes = await client.query('UPDATE "VoteSessions" SET "CycleId"=$1 WHERE "CycleId" IS NULL', [first]);
  console.log(`Assigned ${docs.rowCount} documents and ${votes.rowCount} vote sessions to cycle ${first}.`);

  await client.query(
    'INSERT INTO "Roles" ("RoleId","RoleName") OVERRIDING SYSTEM VALUE VALUES ($1,$2) ON CONFLICT ("RoleId") DO NOTHING',
    [DEVELOPER_ROLE.id, DEVELOPER_ROLE.name],
  );

  await client.query('COMMIT');
  console.log('Schema upgrade complete.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Schema upgrade failed and was rolled back:', error instanceof Error ? error.message : 'service error');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
