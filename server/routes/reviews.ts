import { Router } from 'express';
import type { AppContext } from '../http/context.js';
import { fail } from '../http/errors.js';
import { reviewSchema } from '../schemas.js';
import { canReview, reviewStatus } from '../security.js';
import { ARCHIVED_MESSAGE } from '../services/cycles.js';

const PROPOSAL_TYPE_ID = 1;
/** Roles whose reviews count towards a proposal's outcome: president, secretary general, financial officer. */
const REVIEWER_ROLE_IDS = '1,3,4';

/** Proposal reviews. Each reviewer has one current review per document; the document status is recomputed on save. */
export function reviewRoutes({ transaction }: AppContext) {
  const router = Router();

  router.post('/', async (req, res) => {
    if (!canReview(req.actor)) fail(403, 'المراجعة متاحة للرئيس والأمين العام والمسؤول المالي.');
    const body = reviewSchema.parse(req.body);
    await transaction(async client => {
      // Lock the document so concurrent reviews update its status one at a time.
      const doc = (await client.query('SELECT * FROM "Documents" WHERE "DocId"=$1 FOR UPDATE', [body.documentId]))
        .rows[0];
      if (!doc) fail(404, 'المستند غير موجود.');
      if (doc.DocTypeId !== PROPOSAL_TYPE_ID) fail(400, 'المراجعة متاحة لوثائق التصور فقط.');
      // Proposals of finished cycles keep the outcome they were archived with.
      const current = (await client.query('SELECT "CycleId" FROM "Cycles" WHERE "IsCurrent"')).rows[0];
      if (!current || doc.CycleId !== current.CycleId) fail(409, ARCHIVED_MESSAGE);
      // Replace this reviewer's previous review, if any.
      await client.query('DELETE FROM "Reviews" WHERE "DocId"=$1 AND "ReviewerUserId"=$2', [
        body.documentId,
        req.actor.userId,
      ]);
      await client.query(
        'INSERT INTO "Reviews" ("DocId","ReviewerUserId","Decision","Comment","ReviewedAt") VALUES ($1,$2,$3,$4,NOW())',
        [body.documentId, req.actor.userId, body.decision, body.comment],
      );
      // Latest review per reviewer role decides the document status.
      const reviews = (
        await client.query(
          `SELECT DISTINCT ON (u."RoleId") u."RoleId" AS role, r."Decision" AS decision
            FROM "Reviews" r JOIN "Users" u ON u."UserId"=r."ReviewerUserId" WHERE r."DocId"=$1 AND u."RoleId" IN (${REVIEWER_ROLE_IDS})
            ORDER BY u."RoleId",r."ReviewedAt" DESC`,
          [body.documentId],
        )
      ).rows;
      await client.query('UPDATE "Documents" SET "Status"=$1 WHERE "DocId"=$2', [
        reviewStatus(reviews),
        body.documentId,
      ]);
    });
    res.json({ message: 'تم حفظ المراجعة.' });
  });

  return router;
}
