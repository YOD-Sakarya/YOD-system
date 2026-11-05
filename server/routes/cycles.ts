import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../http/context.js';
import { fail, id } from '../http/errors.js';
import { requireDeveloper } from '../http/requireDeveloper.js';
import { roundMoney } from '../services/budget.js';
import { deleteCloudFiles } from '../services/storage.js';

const deleteCycleSchema = z.object({ confirm: z.string() });
const newCycleSchema = z.object({
  name: z.string().trim().min(3).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // What is left in each budget when the year starts (the developer is reminded of last year's closing balance).
  openingUnion: z.number().finite().min(-1e9).max(1e9),
  openingFaza: z.number().finite().min(-1e9).max(1e9),
});

/**
 * Yearly cycles. Everyone can list them (to browse previous years); only the developer can start a new one.
 * Starting a cycle archives the previous one: nothing is deleted, old documents simply become read-only.
 */
export function cycleRoutes({ query, transaction, audit }: AppContext) {
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
      const newId = created.rows[0].id as number;
      for (const [fund, amount] of [
        ['union', body.openingUnion],
        ['faza', body.openingFaza],
      ] as const)
        await client.query('INSERT INTO "BudgetOpening" ("CycleId","Fund","Amount") VALUES ($1,$2,$3)', [
          newId,
          fund,
          roundMoney(amount),
        ]);
      return newId;
    });
    await audit(req, {
      action: 'cycle.create',
      targetType: 'cycle',
      targetId: cycleId,
      summary: `بدأ العام «${body.name}»`,
      details: { startDate: body.startDate },
    });
    res.status(201).json({ cycleId });
  });

  /**
   * Permanently deletes a year with all its documents, reviews and vote sessions, and removes the uploaded files.
   * The caller must type the year's exact name. Deleting the current year promotes the latest remaining one.
   */
  router.delete('/:id', requireDeveloper, async (req, res) => {
    const cycleId = id(req.params.id);
    const { confirm } = deleteCycleSchema.parse(req.body);
    const summary = await transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cycles:create']);
      const cycle = (await client.query('SELECT * FROM "Cycles" WHERE "CycleId"=$1 FOR UPDATE', [cycleId])).rows[0];
      if (!cycle) fail(404, 'العام غير موجود.');
      if (confirm.trim() !== cycle.Name) fail(400, 'نص التأكيد لا يطابق اسم العام.');
      if ((await client.query('SELECT count(*)::int AS n FROM "Cycles"')).rows[0].n < 2)
        fail(409, 'لا يمكن حذف العام الوحيد في النظام.');

      const files = (await client.query('SELECT "FilePath" FROM "Documents" WHERE "CycleId"=$1', [cycleId])).rows.map(
        row => row.FilePath as string,
      );
      // Financial records are never removed by the developer: a year with budget entries cannot be deleted.
      if ((await client.query('SELECT 1 FROM "BudgetTransactions" WHERE "CycleId"=$1 LIMIT 1', [cycleId])).rowCount)
        fail(409, 'لا يمكن حذف عام يحتوي على حركات مالية. السجلات المالية للقراءة فقط.');
      await client.query('DELETE FROM "BudgetOpening" WHERE "CycleId"=$1', [cycleId]);
      // Children first: reviews belong to documents; votes and options belong to sessions.
      await client.query(
        'DELETE FROM "Reviews" WHERE "DocId" IN (SELECT "DocId" FROM "Documents" WHERE "CycleId"=$1)',
        [cycleId],
      );
      const documents = await client.query('DELETE FROM "Documents" WHERE "CycleId"=$1', [cycleId]);
      const sessions = '(SELECT "VoteSessionId" FROM "VoteSessions" WHERE "CycleId"=$1)';
      await client.query(`DELETE FROM "Votes" WHERE "VoteSessionId" IN ${sessions}`, [cycleId]);
      await client.query(`DELETE FROM "VoteOptions" WHERE "VoteSessionId" IN ${sessions}`, [cycleId]);
      const votes = await client.query('DELETE FROM "VoteSessions" WHERE "CycleId"=$1', [cycleId]);
      await client.query('DELETE FROM "Cycles" WHERE "CycleId"=$1', [cycleId]);

      // The workspace must always have a current year.
      if (cycle.IsCurrent)
        await client.query(
          `UPDATE "Cycles" SET "IsCurrent"=true,"EndDate"=NULL
            WHERE "CycleId"=(SELECT "CycleId" FROM "Cycles" ORDER BY "StartDate" DESC LIMIT 1)`,
        );
      return { name: cycle.Name as string, documents: documents.rowCount ?? 0, votes: votes.rowCount ?? 0, files };
    });
    // Files are removed only after the database change is committed.
    const cloud = await deleteCloudFiles(summary.files);
    await audit(req, {
      action: 'cycle.delete',
      targetType: 'cycle',
      targetId: cycleId,
      summary: `حذف العام «${summary.name}» بما فيه ${summary.documents} مستندًا و${summary.votes} جلسة تصويت`,
      details: {
        documents: summary.documents,
        votes: summary.votes,
        filesRemoved: cloud.removed,
        filesFailed: cloud.failed,
      },
    });
    res.json({
      name: summary.name,
      documents: summary.documents,
      votes: summary.votes,
      filesRemoved: cloud.removed,
      filesFailed: cloud.failed,
    });
  });

  return router;
}
