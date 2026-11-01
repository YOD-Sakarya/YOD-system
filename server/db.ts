import pg from 'pg';
import { config } from './config.js';
export const pool = new pg.Pool({
  ...config.database,
  max: 5,
  connectionTimeoutMillis: 15000,
  statement_timeout: 20000,
});
pool.on('error', () => console.error('PostgreSQL pool connection interrupted.'));
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  return (await pool.query<T>(sql, params)).rows;
}
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export const documentSql = `SELECT d."DocId" AS "docId", d."Title" AS title,
 d."OwnerUserId" AS "ownerUserId", u."FullName" AS "ownerName", u."RoleId" AS "roleId",
 r."RoleName" AS "roleName", d."DocTypeId" AS "docTypeId", t."TypeName" AS "typeName",
 d."QuarterId" AS "quarterId", q."QuarterName" AS "quarterName", d."Status" AS status,
 d."EventDate" AS "eventDate", d."CreatedAt" AS "createdAt",
 COALESCE((SELECT json_agg(json_build_object('reviewId',rv."ReviewId",'reviewerId',rv."ReviewerUserId",
 'reviewerName',ru."FullName",'roleId',ru."RoleId",'roleName',rr."RoleName",'decision',rv."Decision",
 'comment',rv."Comment",'reviewedAt',rv."ReviewedAt") ORDER BY rv."ReviewedAt" DESC)
 FROM "Reviews" rv JOIN "Users" ru ON ru."UserId"=rv."ReviewerUserId"
 JOIN "Roles" rr ON rr."RoleId"=ru."RoleId" WHERE rv."DocId"=d."DocId"),'[]') AS reviews
 FROM "Documents" d JOIN "Users" u ON u."UserId"=d."OwnerUserId"
 JOIN "Roles" r ON r."RoleId"=u."RoleId" JOIN "DocumentTypes" t ON t."DocTypeId"=d."DocTypeId"
 JOIN "Quarters" q ON q."QuarterID"=d."QuarterId"`;
export const sessionsSql = `SELECT s."VoteSessionId" AS "sessionId", s."Title" AS title,
 s."Description" AS description, s."Status" AS status, s."Decision" AS decision,
 s."CreatedByUserId" AS "createdByUserId", u."FullName" AS "createdByName",
 s."CreatedAt" AS "createdAt", s."ClosedAt" AS "closedAt",
 COALESCE((SELECT json_agg(json_build_object('optionId',o."VoteOptionId",'text',o."Text",
 'count',(SELECT count(*)::int FROM "Votes" v WHERE v."VoteOptionId"=o."VoteOptionId")) ORDER BY o."VoteOptionId")
 FROM "VoteOptions" o WHERE o."VoteSessionId"=s."VoteSessionId"),'[]') AS options,
 (SELECT count(*)::int FROM "Votes" v WHERE v."VoteSessionId"=s."VoteSessionId") AS "voteCount",
 (SELECT v."VoteOptionId" FROM "Votes" v WHERE v."VoteSessionId"=s."VoteSessionId"
 AND v."VoterUserId"=$1 LIMIT 1) AS "myOptionId",
 (SELECT v."Comment" FROM "Votes" v WHERE v."VoteSessionId"=s."VoteSessionId"
 AND v."VoterUserId"=$1 LIMIT 1) AS "myComment"
 FROM "VoteSessions" s JOIN "Users" u ON u."UserId"=s."CreatedByUserId"`;
