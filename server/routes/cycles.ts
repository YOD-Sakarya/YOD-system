import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../http/context.js';
import { fail } from '../http/errors.js';
import { requireDeveloper } from '../http/requireDeveloper.js';

const newCycleSchema = z.object({
  name: z.string().trim().min(3).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Yearly cycles. Everyone can list them (to browse previous years); only the developer can start a new one.
 * Starting a cycle archives the previous one: nothing is deleted, old documents simply become read-only.
 */
export function cycleRoutes({ query, transaction }: AppContext) {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(
      await query(`SELECT c."CycleId" AS "cycleId", c."Name" AS name, c."StartDate"::text AS "startDate",
          c."EndDate"::text AS "endDate", c."IsCurrent" AS "isCurrent",
          (SELECT count(*)::int FROM "Documents" d WHERE d."CycleId"=c."CycleId") AS "documentCount",
          (SELECT count(*)::int FROM "VoteSessions" s WHERE s."CycleId"=c."CycleId") AS "voteCount"
        FROM "Cycles" c ORDER BY c."StartDate" DESC`),
    );
  });

  router.post('/', requireDeveloper, async (req, res) => {
    const body = newCycleSchema.parse(req.body);
    const cycleId = await transaction(async client => {
      // One cycle change at a time, so two developers cannot create two "current" cycles.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cycles:create']);
      const previous = (
        await client.query('SELECT "CycleId","StartDate"::text AS start FROM "Cycles" WHERE "IsCurrent"')
      ).rows[0];
      if (previous && body.startDate <= previous.start) fail(400, 'يجب أن يبدأ العام الجديد بعد بداية العام الحالي.');
      if ((await client.query('SELECT 1 FROM "Cycles" WHERE "Name"=$1', [body.name])).rowCount)
        fail(409, 'اسم الدورة مستخدم بالفعل.');
      if (previous)
        await client.query(
          `UPDATE "Cycles" SET "IsCurrent"=false,"EndDate"=COALESCE("EndDate",($2::date - 1)) WHERE "CycleId"=$1`,
          [previous.CycleId, body.startDate],
        );
      const created = await client.query(
        'INSERT INTO "Cycles" ("Name","StartDate","IsCurrent") VALUES ($1,$2,true) RETURNING "CycleId" AS id',
        [body.name, body.startDate],
      );
      return created.rows[0].id as number;
    });
    res.status(201).json({ cycleId });
  });

  return router;
}
