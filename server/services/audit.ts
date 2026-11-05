import type { Request } from 'express';
import type { query as databaseQuery } from '../db.js';

/** Who did what and when. Rows are only ever inserted; the developer reads them in the admin console. */
export const auditLogsSql = `CREATE TABLE IF NOT EXISTS "AuditLogs" (
  "LogId" bigserial PRIMARY KEY,
  "CreatedAt" timestamptz NOT NULL DEFAULT NOW(),
  "ActorUserId" integer,
  "ActorName" text NOT NULL,
  "ActorRole" text NOT NULL DEFAULT '',
  "Action" text NOT NULL,
  "TargetType" text NOT NULL DEFAULT '',
  "TargetId" text NOT NULL DEFAULT '',
  "Summary" text NOT NULL DEFAULT '',
  "Details" jsonb,
  "Ip" text NOT NULL DEFAULT ''
)`;
export const auditIndexSql = 'CREATE INDEX IF NOT EXISTS "AuditLogs_CreatedAt" ON "AuditLogs" ("CreatedAt" DESC)';

export type AuditEntry = {
  /** Dotted event name such as `document.delete`; the console groups and filters by it. */
  action: string;
  targetType?: string;
  targetId?: string | number;
  /** One readable Arabic sentence shown in the console. */
  summary: string;
  /** Extra facts (never passwords, tokens or ballots). */
  details?: Record<string, unknown>;
  /** For events without a signed-in user (failed sign-in). */
  actor?: { userId?: number; fullName: string; roleName?: string };
};

export type Audit = (req: Pick<Request, 'actor' | 'ip'>, entry: AuditEntry) => Promise<void>;

/**
 * Records an event after the action succeeded. A logging failure (for example the table is not created yet) must never
 * break the request it describes, so errors are only reported to the server console.
 */
export function createAudit(query: typeof databaseQuery): Audit {
  return async (req, entry) => {
    const actor = entry.actor ?? req.actor;
    try {
      await query(
        `INSERT INTO "AuditLogs" ("ActorUserId","ActorName","ActorRole","Action","TargetType","TargetId","Summary","Details","Ip")
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          actor && 'userId' in actor ? (actor.userId ?? null) : null,
          actor?.fullName ?? 'غير معروف',
          actor?.roleName ?? '',
          entry.action,
          entry.targetType ?? '',
          entry.targetId === undefined ? '' : String(entry.targetId),
          entry.summary,
          entry.details ? JSON.stringify(entry.details) : null,
          req.ip ?? '',
        ],
      );
    } catch (error) {
      console.error('Audit log failed:', error instanceof Error ? error.message : 'unknown error');
    }
  };
}
