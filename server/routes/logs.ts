import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../http/context.js';
import { requireDeveloper } from '../http/requireDeveloper.js';
import { pruneAuditLogs } from '../services/audit.js';

const filterSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  /** Cursor: only rows older than this log id, for the "load more" button. */
  before: z.coerce.number().int().positive().optional(),
  /** Event family such as `document` (matches `document.delete`) or an exact event name. */
  action: z.string().trim().max(60).optional(),
  userId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

/** Activity log for the developer: newest first, filterable by event, person and free text. */
export function logRoutes({ query }: AppContext) {
  const router = Router();
  router.use(requireDeveloper);

  router.get('/', async (req, res) => {
    const filter = filterSchema.parse(req.query);
    // Opening the console also clears expired entries, so a quiet system still stays tidy.
    await pruneAuditLogs(query);
    const escape = (text: string) => text.replace(/[\%_]/g, '\$&');
    const rows = await query(
      `SELECT "LogId" AS id, "CreatedAt" AS "createdAt", "ActorUserId" AS "actorUserId", "ActorName" AS "actorName",
        "ActorRole" AS "actorRole", "Action" AS action, "TargetType" AS "targetType", "TargetId" AS "targetId",
        "Summary" AS summary, "Details" AS details, "Ip" AS ip
        FROM "AuditLogs"
        WHERE ($1::bigint IS NULL OR "LogId"<$1)
          AND ($2::text IS NULL OR "Action"=$2 OR "Action" LIKE $2 || '.%')
          AND ($3::int IS NULL OR "ActorUserId"=$3)
          AND ($4::text IS NULL OR "Summary" ILIKE '%' || $4 || '%' OR "ActorName" ILIKE '%' || $4 || '%')
        ORDER BY "LogId" DESC LIMIT $5`,
      [
        filter.before ?? null,
        filter.action || null,
        filter.userId ?? null,
        filter.q ? escape(filter.q) : null,
        filter.limit + 1,
      ],
    );
    res
      .set('Cache-Control', 'no-store')
      .json({ items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit });
  });

  return router;
}
