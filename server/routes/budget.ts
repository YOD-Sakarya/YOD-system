import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AppContext } from '../http/context.js';
import { fail, HttpError, id } from '../http/errors.js';
import { canManageBudget, canViewBudget } from '../security.js';
import { budgetSummary, categoriesFor, FUND_IDS, FUNDS, TRANSACTION_KINDS } from '../services/budget.js';
import { ARCHIVED_MESSAGE, getCurrentCycleId } from '../services/cycles.js';
import { saveFile, sendDocument, upload } from '../services/storage.js';

const money = z.coerce
  .number()
  .finite()
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'المبلغ بكسرين عشريين على الأكثر.');
const transactionSchema = z.object({
  fund: z.enum(FUND_IDS),
  kind: z.enum(TRANSACTION_KINDS),
  amount: money.refine(value => value > 0 && value <= 1e9, 'أدخل مبلغًا أكبر من صفر.'),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(''),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const formatAmount = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(value);

/**
 * The union's two budgets (خزينة الاتحاد and صندوق فزعة), kept per year. The president, secretary general, financial
 * officer, oversight committee and developer can see them and their receipts; only the financial officer records money
 * in or out. The developer only looks (the opening balances are typed once, when a year is created).
 */
export function budgetRoutes({ query, audit }: AppContext) {
  const router = Router();
  const finance: RequestHandler = (req, _res, next) =>
    next(canManageBudget(req.actor) ? undefined : new HttpError(403, 'تسجيل الدخل والمصروف متاح للمسؤول المالي فقط.'));
  router.use((req, _res, next) =>
    next(
      canViewBudget(req.actor)
        ? undefined
        : new HttpError(403, 'الميزانية متاحة للرئيس والأمين العام والمسؤول المالي ولجنة الرقابة فقط.'),
    ),
  );

  router.get('/', async (req, res) => {
    const current = await getCurrentCycleId(query);
    const cycleId = req.query.cycleId ? id(req.query.cycleId) : current;
    const [cycle] = await query('SELECT "Name" AS name FROM "Cycles" WHERE "CycleId"=$1', [cycleId]);
    if (!cycle) fail(404, 'العام غير موجود.');
    const transactions = await query(
      `SELECT t."TransactionId" AS id, t."Fund" AS fund, t."Kind" AS kind, t."Amount"::float8 AS amount,
          t."Category" AS category, t."Description" AS description, t."TxDate"::text AS "txDate",
          t."CreatedAt" AS "createdAt", u."FullName" AS "createdByName", (t."FilePath" IS NOT NULL) AS "hasAttachment"
        FROM "BudgetTransactions" t JOIN "Users" u ON u."UserId"=t."CreatedByUserId"
        WHERE t."CycleId"=$1 ORDER BY t."TxDate" DESC, t."TransactionId" DESC LIMIT 2000`,
      [cycleId],
    );
    res.set('Cache-Control', 'no-store').json({
      cycleId,
      cycleName: cycle.name,
      isCurrent: cycleId === current,
      funds: await budgetSummary(query, cycleId),
      transactions,
    });
  });

  // The role check runs before the upload is read, so nobody else can make the server accept a file.
  router.post('/transactions', finance, upload.single('file'), async (req, res) => {
    const body = transactionSchema.parse(req.body);
    if (!categoriesFor(body.kind).includes(body.category)) fail(400, 'اختر تصنيفًا من القائمة.');
    if (body.txDate > new Date().toISOString().slice(0, 10)) fail(400, 'لا يمكن تسجيل حركة بتاريخ في المستقبل.');
    if (Number.isNaN(Date.parse(body.txDate))) fail(400, 'التاريخ غير صالح.');
    const cycleId = await getCurrentCycleId(query);
    const filePath = req.file ? await saveFile(req.file) : null;
    const [created] = await query(
      `INSERT INTO "BudgetTransactions" ("CycleId","Fund","Kind","Amount","Category","Description","TxDate","FilePath","CreatedByUserId")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING "TransactionId" AS id`,
      [
        cycleId,
        body.fund,
        body.kind,
        body.amount,
        body.category,
        body.description,
        body.txDate,
        filePath,
        req.actor.userId,
      ],
    );
    await audit(req, {
      action: 'budget.add',
      targetType: 'budget',
      targetId: created.id,
      summary: `${body.kind === 'income' ? 'سجّل دخلًا' : 'سجّل مصروفًا'} ${formatAmount(body.amount)} في ${FUNDS[body.fund]} (${body.category})`,
      details: { ...body, hasAttachment: Boolean(filePath) },
    });
    res.status(201).json({ transactionId: created.id });
  });

  router.delete('/transactions/:id', finance, async (req, res) => {
    const transactionId = id(req.params.id);
    const cycleId = await getCurrentCycleId(query);
    const [row] = await query(
      `SELECT "CycleId" AS "cycleId","Fund" AS fund,"Kind" AS kind,"Amount"::float8 AS amount,"Category" AS category,
          "TxDate"::text AS "txDate","FilePath" IS NOT NULL AS "hasAttachment" FROM "BudgetTransactions" WHERE "TransactionId"=$1`,
      [transactionId],
    );
    if (!row) fail(404, 'الحركة غير موجودة.');
    if (row.cycleId !== cycleId) fail(403, ARCHIVED_MESSAGE);
    await query('DELETE FROM "BudgetTransactions" WHERE "TransactionId"=$1', [transactionId]);
    // Cloud receipts are kept for recovery, like documents: removing the row does not destroy the remote file.
    await audit(req, {
      action: 'budget.delete',
      targetType: 'budget',
      targetId: transactionId,
      summary: `حذف ${row.kind === 'income' ? 'دخلًا' : 'مصروفًا'} ${formatAmount(row.amount)} من ${FUNDS[row.fund as keyof typeof FUNDS]} (${row.category})`,
      details: row,
    });
    res.sendStatus(204);
  });

  /** Same visibility as the budget itself: receipts never reach anyone who cannot see the amounts. */
  async function sendAttachment(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    inline: boolean,
  ) {
    const [row] = await query(
      'SELECT "TransactionId" AS id,"FilePath" AS "filePath","TxDate"::text AS "txDate" FROM "BudgetTransactions" WHERE "TransactionId"=$1',
      [id(req.params.id)],
    );
    if (!row?.filePath) fail(404, 'لا يوجد مرفق لهذه الحركة.');
    await audit(req, {
      action: 'budget.attachment',
      targetType: 'budget',
      targetId: row.id,
      summary: `${inline ? 'عرض' : 'نزّل'} مرفق حركة مالية بتاريخ ${row.txDate}`,
    });
    await sendDocument(res, { FilePath: row.filePath, Title: `مرفق-${row.txDate}-${row.id}` }, { inline });
  }
  router.get('/transactions/:id/download', (req, res) => sendAttachment(req, res, false));
  router.get('/transactions/:id/view', (req, res) => sendAttachment(req, res, true));

  return router;
}
