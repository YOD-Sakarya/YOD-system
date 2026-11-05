import { Router } from 'express';
import type { AppContext } from '../http/context.js';
import { fail } from '../http/errors.js';
import { reviewSchema } from '../schemas.js';
import { canReviewAny, isDeveloper, requiredReviewerRoles, reviewStatus } from '../security.js';
import { ARCHIVED_MESSAGE } from '../services/cycles.js';

/**
 * Document reviews. Two flows share this endpoint (see requiredReviewerRoles):
 * proposals are reviewed by the president, secretary general and financial officer, and documents uploaded
 * by oversight members are reviewed by the other two oversight members. Each reviewer keeps one current
 * review per document and the document status is recomputed whenever it changes.
 */
export function reviewRoutes({ transaction, audit }: AppContext) {
  const router = Router();

  router.post('/', async (req, res) => {
    const developer = isDeveloper(req.actor);
    if (!developer && !canReviewAny(req.actor)) fail(403, 'المراجعة متاحة لمراجعي المستندات فقط.');
    const body = reviewSchema.parse(req.body);
    const outcome = await transaction(async client => {
      // Lock the document so concurrent reviews update its status one at a time.
      const doc = (
        await client.query(
          `SELECT d.*, u."RoleId" AS "ownerRoleId" FROM "Documents" d JOIN "Users" u ON u."UserId"=d."OwnerUserId"
            WHERE d."DocId"=$1 FOR UPDATE OF d`,
          [body.documentId],
        )
      ).rows[0];
      if (!doc) fail(404, 'المستند غير موجود.');
      const required = requiredReviewerRoles(doc.DocTypeId, doc.ownerRoleId);
      if (!required.length) fail(400, 'هذا المستند لا يحتاج إلى مراجعة.');
      // The developer decides in the name of any reviewer role of this document; the decision is stored on that
      // role's seat so the status rules stay unchanged, and the activity log records who really made it.
      let reviewerId = req.actor.userId;
      let onBehalfOf: { roleId: number; name: string } | null = null;
      if (developer) {
        if (!body.asRoleId || !required.includes(body.asRoleId)) fail(400, 'اختر الدور الذي ستسجَّل المراجعة باسمه.');
        const seat = (
          await client.query('SELECT "UserId","FullName" FROM "Users" WHERE "RoleId"=$1 ORDER BY "UserId" LIMIT 1', [
            body.asRoleId,
          ])
        ).rows[0];
        if (!seat) fail(409, 'لا يوجد مستخدم بهذا الدور.');
        reviewerId = seat.UserId;
        onBehalfOf = { roleId: body.asRoleId!, name: seat.FullName };
      } else if (!required.includes(req.actor.roleId)) fail(403, 'ليس لديك صلاحية مراجعة هذا المستند.');
      // Documents of finished cycles keep the outcome they were archived with (only the developer may still change them).
      const current = (await client.query('SELECT "CycleId" FROM "Cycles" WHERE "IsCurrent"')).rows[0];
      if (!developer && (!current || doc.CycleId !== current.CycleId)) fail(409, ARCHIVED_MESSAGE);
      // Replace this reviewer's previous review, if any.
      await client.query('DELETE FROM "Reviews" WHERE "DocId"=$1 AND "ReviewerUserId"=$2', [
        body.documentId,
        reviewerId,
      ]);
      await client.query(
        'INSERT INTO "Reviews" ("DocId","ReviewerUserId","Decision","Comment","ReviewedAt") VALUES ($1,$2,$3,$4,NOW())',
        [body.documentId, reviewerId, body.decision, body.comment],
      );
      // The latest review per required role decides the document status.
      const reviews = (
        await client.query(
          `SELECT DISTINCT ON (u."RoleId") u."RoleId" AS role, r."Decision" AS decision
            FROM "Reviews" r JOIN "Users" u ON u."UserId"=r."ReviewerUserId"
            WHERE r."DocId"=$1 AND u."RoleId"=ANY($2::int[])
            ORDER BY u."RoleId",r."ReviewedAt" DESC`,
          [body.documentId, required],
        )
      ).rows;
      const status = reviewStatus(reviews, required);
      await client.query('UPDATE "Documents" SET "Status"=$1 WHERE "DocId"=$2', [status, body.documentId]);
      return { title: doc.Title as string, status, onBehalfOf };
    });
    const verb = body.decision === 'مقبول' ? 'قَبِل' : 'رفض';
    await audit(req, {
      action: 'review.submit',
      targetType: 'document',
      targetId: body.documentId,
      summary: outcome.onBehalfOf
        ? `${verb} «${outcome.title}» نيابةً عن ${outcome.onBehalfOf.name}`
        : `${verb} «${outcome.title}»`,
      details: { decision: body.decision, status: outcome.status, onBehalfOf: outcome.onBehalfOf },
    });
    res.json({ message: 'تم حفظ المراجعة.' });
  });

  return router;
}
