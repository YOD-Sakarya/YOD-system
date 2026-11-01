import { Router } from 'express';
import { documentSql } from '../db.js';
import type { AppContext } from '../http/context.js';
import { fail, id } from '../http/errors.js';
import { documentSchema } from '../schemas.js';
import { DEVELOPER_ROLE_ID, canDelete, canEditDocument, isDeveloper } from '../security.js';
import { ARCHIVED_MESSAGE, getCurrentCycleId } from '../services/cycles.js';
import { saveFile, sendDocument, upload } from '../services/storage.js';

const STATUS_PENDING = 'قيد المراجعة';
const STATUS_NO_REVIEW = 'لا يحتاج إلى مراجعة';
const PROPOSAL_TYPE_ID = 1;

/** Only proposals go through the three-reviewer approval flow; other types are complete on upload. */
const initialStatus = (docTypeId: number) => (docTypeId === PROPOSAL_TYPE_ID ? STATUS_PENDING : STATUS_NO_REVIEW);

/** Document CRUD plus file download. File contents live in Cloudinary; the database stores only the URL. */
export function documentRoutes({ query, transaction }: AppContext) {
  const router = Router();

  async function getDocument(docId: number) {
    const [doc] = await query('SELECT * FROM "Documents" WHERE "DocId"=$1', [docId]);
    return doc || fail(404, 'المستند غير موجود.');
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
    res.json(
      await query(documentSql + ' WHERE ($1::int IS NULL OR u."RoleId"=$1) ORDER BY d."CreatedAt" DESC', [roleId]),
    );
  });

  router.post('/', upload.single('file'), async (req, res) => {
    const body = documentSchema.parse(req.body);
    await assertTypeAllowed(req.actor.roleId, body.docTypeId);
    // New documents always belong to the current cycle.
    const cycleId = await getCurrentCycleId(query);
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
        initialStatus(body.docTypeId),
        body.quarterId,
        filePath,
        cycleId,
      ],
    );
    res.status(201).json(doc);
  });

  router.put('/:id', upload.single('file'), async (req, res) => {
    const docId = id(req.params.id);
    const doc = await getDocument(docId);
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
        [body.title, body.eventDate, body.docTypeId, body.quarterId, filePath, initialStatus(body.docTypeId), docId],
      );
      // An edited document must be reviewed again.
      await client.query('DELETE FROM "Reviews" WHERE "DocId"=$1', [docId]);
    });
    res.json({ docId });
  });

  router.delete('/:id', async (req, res) => {
    const docId = id(req.params.id);
    const doc = await getDocument(docId);
    if (!canDelete(req.actor)) fail(403, 'حذف المستندات متاح للمطوّر فقط.');
    await query('DELETE FROM "Documents" WHERE "DocId"=$1', [docId]);
    // Retain cloud assets for recovery; database deletion does not destroy a remote file.
    res.sendStatus(204);
  });

  router.get('/:id/download', async (req, res) => {
    const doc = await getDocument(id(req.params.id));
    await sendDocument(res, { FilePath: doc.FilePath, Title: doc.Title });
  });

  return router;
}
