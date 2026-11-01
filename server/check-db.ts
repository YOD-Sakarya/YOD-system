import { pool, documentSql, sessionsSql } from './db.js';

// Explicitly read-only: validate schema compatibility and production SELECTs without
// printing document content, account details, credentials, or making any changes.
const client = await pool.connect();
try {
  await client.query('BEGIN READ ONLY');
  await client.query('SET LOCAL statement_timeout = 20000');
  await client.query(documentSql + ' WHERE ($1::int IS NULL OR u."RoleId"=$1) ORDER BY d."CreatedAt" DESC LIMIT 1', [null]);
  await client.query(sessionsSql + ' ORDER BY s."CreatedAt" DESC LIMIT 1', [0]);
  const roles = await client.query('SELECT "RoleId","RoleName" FROM "Roles"');
  const types = await client.query('SELECT "DocTypeId","TypeName" FROM "DocumentTypes"');
  const quarters = await client.query('SELECT "QuarterID","QuarterName" FROM "Quarters"');
  const permissions = await client.query('SELECT "RoleId","DocTypeId" FROM "RoleDocPerms"');
  await client.query(`SELECT u."UserId",u."FullName",u."RoleId",r."RoleName",u."PasswordHash"
    FROM "Users" u JOIN "Roles" r ON r."RoleId"=u."RoleId" LIMIT 0`);
  console.log(JSON.stringify({ database: 'connected', mode: 'read-only', documentQuery: 'passed', voteQuery: 'passed',
    authSchema: 'passed', catalog: { roles: roles.rowCount, types: types.rowCount, quarters: quarters.rowCount, permissions: permissions.rowCount } }, null, 2));
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Read-only database check failed:', error instanceof Error ? error.name : 'UnknownError');
  process.exitCode = 1;
} finally {
  client.release(); await pool.end();
}
