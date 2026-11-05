import { Router } from 'express';
import { documentSql } from '../db.js';
import type { AppContext } from '../http/context.js';
import { fail, id } from '../http/errors.js';
import { documentSchema } from '../schemas.js';
import {
  type Actor,
  DEVELOPER_ROLE_ID,
  canDeleteDocument,
  canEditDocument,
  canSeeRestrictedDocuments,
  canViewDocument,
  isDeveloper,
  requiredReviewerRoles,
} from '../security.js';
import { ARCHIVED_MESSAGE, getCurrentCycleId } from '../services/cycles.js';
import { saveFile, sendDocument, upload } from '../services/storage.js';

const STATUS_PENDING = 'قيد المراجعة';
const STATUS_NO_REVIEW = 'لا يحتاج إلى مراجعة';

/** Documents that need reviewers (proposals, oversight uploads) start pending; everything else is final on upload. */
const initialStatus = (docTypeId: number, ownerRoleId: number) =>
  requiredReviewerRoles(docTypeId, ownerRoleId).length ? STATUS_PENDING : STATUS_NO_REVIEW;

/** Document CRUD plus file download. File contents live in Cloudinary; the database stores only the URL. */
export function documentRoutes({ query, transaction, audit }: AppContext) {
  const router = Router();

  /** Loads a document the actor is allowed to see; hidden oversight documents look like they do not exist. */
  async function getDocument(docId: number, actor: Actor) {
    const [doc] = await query(
      `SELECT d.*, u."RoleId" AS "ownerRoleId" FROM "Documents" d JOIN "Users" u ON u."UserId"=d."OwnerUserId"
        WHERE d."DocId"=$1`,
      [docId],
    );
    if (!doc || !canViewDocument(actor, doc.ownerRoleId, doc.Status)) fail(404, 'المستند غير موجود.');
    return doc;
  }

  /** A role may only create document types listed in RoleDocPerms; the developer may create any type. */
  async function assertTypeAllowed(roleId: number, docTypeId: number) {
    if (roleId === DEVELOPER_ROLE_ID) return;
    const allowed = await query('SELECT 1 FROM "RoleDocPerms" WHERE "RoleId"=$1 AND "DocTypeId"=$2', [
      roleId,
      docTypeId,
    ]);
    if (!allowed.length) fail(403, 'نوع المستند غير متاح لهذا الدور.');
  }

  router.get('/', async (req, res) => {
    // Authenticated members retain the existing cross-committee document visibility.
    const roleId = req.query.roleId ? id(req.query.roleId) : null;
    // Oversight uploads stay hidden from everyone but the oversight committee and the developer until accepted.
    res.json(
      await query(
        documentSql +
          ` WHERE ($1::int IS NULL OR u."RoleId"=$1)
            AND ($2::boolean OR u."RoleId" NOT IN (10,12,13) OR d."Status"='مقبول') ORDER BY d."CreatedAt" DESC`,
        [roleId, canSeeRestrictedDocuments(req.actor)],
      ),
    );
  });

  router.post('/', upload.single('file'), async (req, res) => {
    const body = documentSchema.parse(req.body);
    await assertTypeAllowed(req.actor.roleId, body.docTypeId);
    // New documents belong to the current cycle; the developer may target another (archived) cycle.
    const requested = Number(req.body.cycleId);
    let cycleId = await getCurrentCycleId(query);
    if (isDeveloper(req.actor) && Number.isInteger(requested) && requested > 0 && requested !== cycleId) {
      const exists = await query('SELECT 1 FROM "Cycles" WHERE "CycleId"=$1', [requested]);
      if (!exists.length) fail(400, 'العام غير موجود.');
      cycleId = requested;
    }
    if (!req.file) fail(400, 'اختر ملفًا لإرفاقه.');
    const filePath = await saveFile(req.file!);
    const [doc] = await query(
      `INSERT INTO "Documents" ("OwnerUserId","DocTypeId","Title","EventDate","Status","QuarterId","FilePath","CycleId","CreatedAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING "DocId" AS "docId"`,
      [
        req.actor.userId,
        body.docTypeId,
        body.title,
        body.eventDate,
        initialStatus(body.docTypeId, req.actor.roleId),
        body.quarterId,
        filePath,
        cycleId,
      ],
    );
    await audit(req, {
      action: 'document.create',
      targetType: 'document',
      targetId: doc.docId,
      summary: `رفع المستند «${body.title}»`,
      details: { docTypeId: body.docTypeId, cycleId },
    });
    res.status(201).json(doc);
  });

  router.put('/:id', upload.single('file'), async (req, res) => {
    const docId = id(req.params.id);
    const doc = await getDocument(docId, req.actor);
    const body = documentSchema.parse(req.body);
    if (!canEditDocument(req.actor, doc.OwnerUserId)) fail(403, 'ليس لديك صلاحية تعديل هذا المستند.');
    // Documents of finished cycles are read-only; only the developer can still change them.
    if (!isDeveloper(req.actor) && doc.CycleId !== (await getCurrentCycleId(query))) fail(403, ARCHIVED_MESSAGE);
    // Type permissions follow the owner's role, not the editor's.
    const [owner] = await query('SELECT "RoleId" AS "roleId" FROM "Users" WHERE "UserId"=$1', [doc.OwnerUserId]);
    await assertTypeAllowed(owner.roleId, body.docTypeId);
    const filePath = req.file ? await saveFile(req.file) : doc.FilePath;
    await transaction(async client => {
      await client.query(
        'UPDATE "Documents" SET "Title"=$1,"EventDate"=$2,"DocTypeId"=$3,"QuarterId"=$4,"FilePath"=$5,"Status"=$6 WHERE "DocId"=$7',
        [
          body.title,
          body.eventDate,
          body.docTypeId,
          body.quarterId,
          filePath,
          initialStatus(body.docTypeId, owner.roleId),
          docId,
        ],
      );
      // An edited document must be reviewed again.
      await client.query('DELETE FROM "Reviews" WHERE "DocId"=$1', [docId]);
    });
    await audit(req, {
      action: 'document.update',
      targetType: 'document',
      targetId: docId,
      summary: `عدّل المستند «${body.title}»`,
      details: { previousTitle: doc.Title, newFile: Boolean(req.file) },
    });
    res.json({ docId });
  });

  router.delete('/:id', async (req, res) => {
    const docId = id(req.params.id);
    const doc = await getDocument(docId, req.actor);
    const mayDelete = canDeleteDocument(req.actor, {
      ownerId: doc.OwnerUserId,
      status: doc.Status,
      inCurrentCycle: doc.CycleId === (await getCurrentCycleId(query)),
    });
    if (!mayDelete) fail(403, 'لا يمكن حذف هذا المستند: يحذف صاحبه مستنداته قبل قبولها فقط، وبعد ذلك للمطوّر وحده.');
    await query('DELETE FROM "Documents" WHERE "DocId"=$1', [docId]);
    await audit(req, {
      action: 'document.delete',
      targetType: 'document',
      targetId: docId,
      summary: `حذف المستند «${doc.Title}»`,
      details: { ownerUserId: doc.OwnerUserId, status: doc.Status },
    });
    // Retain cloud assets for recovery; database deletion does not destroy a remote file.
    res.sendStatus(204);
  });

  router.get('/:id/download', async (req, res) => {
    const doc = await getDocument(id(req.params.id), req.actor);
    await audit(req, {
      action: 'document.download',
      targetType: 'document',
      targetId: doc.DocId,
      summary: `نزّل المستند «${doc.Title}»`,
    });
    await sendDocument(res, { FilePath: doc.FilePath, Title: doc.Title });
  });

  // Same access rules as the download; the browser displays the file instead of saving it (PDF, images and text only).
  router.get('/:id/view', async (req, res) => {
    const doc = await getDocument(id(req.params.id), req.actor);
    await audit(req, {
      action: 'document.view',
      targetType: 'document',
      targetId: doc.DocId,
      summary: `عرض المستند «${doc.Title}»`,
    });
    await sendDocument(res, { FilePath: doc.FilePath, Title: doc.Title }, { inline: true });
  });

  return router;
}
