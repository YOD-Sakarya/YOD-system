import ExcelJS from 'exceljs';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { AppContext } from '../http/context.js';
import { fail, HttpError, id } from '../http/errors.js';
import { canManageBudget, canViewBudget } from '../security.js';
import { FUNDS } from '../services/budget.js';
import { getCurrentCycleId, ARCHIVED_MESSAGE } from '../services/cycles.js';
import { QUARTER_LABELS, quarterNames } from '../services/subscriptions.js';

const paymentSchema = z.object({
  studentName: z
    .string()
    .trim()
    .min(2)
    .max(150)
    .transform(name => name.replace(/\s+/g, ' ')),
  amount: z
    .number()
    .positive()
    .max(1e9)
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'المبلغ بكسرين عشريين على الأكثر.'),
  quarters: z
    .array(z.number().int().min(1).max(4))
    .min(1)
    .max(4)
    .refine(list => new Set(list).size === list.length)
    .transform(list => [...list].sort()),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const formatAmount = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(value);

/**
 * Student subscriptions, paid per quarter. Visible to the same people as the budgets; only the financial officer
 * records or removes payments. Each payment also creates its income line in خزينة الاتحاد (category اشتراكات).
 */
export function subscriptionRoutes({ query, transaction, audit }: AppContext) {
  const router = Router();
  const finance: RequestHandler = (req, _res, next) =>
    next(canManageBudget(req.actor) ? undefined : new HttpError(403, 'تسجيل الاشتراكات متاح للمسؤول المالي فقط.'));
  router.use((req, _res, next) =>
    next(
      canViewBudget(req.actor)
        ? undefined
        : new HttpError(403, 'الاشتراكات متاحة للرئيس والأمين العام والمسؤول المالي ولجنة الرقابة فقط.'),
    ),
  );

  const paymentsOf = (cycleId: number) =>
    query(
      `SELECT p."PaymentId" AS id, p."StudentId" AS "studentId", s."Name" AS "studentName",
          p."Amount"::float8 AS amount, p."Quarters" AS quarters, p."PaidAt"::text AS "paidAt",
          u."FullName" AS "createdByName"
        FROM "SubscriptionPayments" p JOIN "Students" s ON s."StudentId"=p."StudentId"
        JOIN "Users" u ON u."UserId"=p."CreatedByUserId"
        WHERE p."CycleId"=$1 ORDER BY p."PaidAt" DESC, p."PaymentId" DESC`,
      [cycleId],
    );

  router.get('/', async (req, res) => {
    const current = await getCurrentCycleId(query);
    const cycleId = req.query.cycleId ? id(req.query.cycleId) : current;
    const [students, payments] = await Promise.all([
      query('SELECT "StudentId" AS id, "Name" AS name FROM "Students" ORDER BY "Name"'),
      paymentsOf(cycleId),
    ]);
    res.set('Cache-Control', 'no-store').json({ cycleId, isCurrent: cycleId === current, students, payments });
  });

  /** Excel workbook of one year: a sheet with who paid which quarter, and a sheet with every payment. */
  router.get('/export', async (req, res) => {
    const cycleId = req.query.cycleId ? id(req.query.cycleId) : await getCurrentCycleId(query);
    const [cycle] = await query('SELECT "Name" AS name FROM "Cycles" WHERE "CycleId"=$1', [cycleId]);
    if (!cycle) fail(404, 'العام غير موجود.');
    const payments = await paymentsOf(cycleId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'مساحة الاتحاد';
    const summary = workbook.addWorksheet('الاشتراكات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    summary.columns = [
      { header: 'الطالب', key: 'name', width: 32 },
      ...QUARTER_LABELS.map((label, index) => ({ header: label, key: `q${index + 1}`, width: 14 })),
      { header: 'إجمالي المدفوع (₺)', key: 'total', width: 20 },
    ];
    const byStudent = new Map<number, { name: string; quarters: Set<number>; total: number }>();
    for (const payment of payments) {
      const entry = byStudent.get(payment.studentId) ?? {
        name: payment.studentName,
        quarters: new Set<number>(),
        total: 0,
      };
      for (const quarter of payment.quarters as number[]) entry.quarters.add(quarter);
      entry.total = Math.round((entry.total + Number(payment.amount)) * 100) / 100;
      byStudent.set(payment.studentId, entry);
    }
    for (const entry of [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')))
      summary.addRow({
        name: entry.name,
        ...Object.fromEntries([1, 2, 3, 4].map(quarter => [`q${quarter}`, entry.quarters.has(quarter) ? '✓' : ''])),
        total: entry.total,
      });
    const details = workbook.addWorksheet('الدفعات', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    details.columns = [
      { header: 'التاريخ', key: 'paidAt', width: 14 },
      { header: 'الطالب', key: 'student', width: 32 },
      { header: 'الأرباع', key: 'quarters', width: 30 },
      { header: 'المبلغ (₺)', key: 'amount', width: 16 },
      { header: 'سجّلها', key: 'by', width: 24 },
    ];
    for (const payment of payments)
      details.addRow({
        paidAt: payment.paidAt,
        student: payment.studentName,
        quarters: quarterNames(payment.quarters as number[]),
        amount: Number(payment.amount),
        by: payment.createdByName,
      });
    for (const sheet of [summary, details]) {
      sheet.getRow(1).font = { bold: true };
      for (const column of sheet.columns) column.alignment = { horizontal: 'right' };
    }
    summary.getColumn('total').numFmt = '#,##0.00';
    details.getColumn('amount').numFmt = '#,##0.00';

    await audit(req, {
      action: 'subscription.export',
      targetType: 'subscription',
      targetId: cycleId,
      summary: `صدّر اشتراكات عام ${cycle.name} إلى Excel`,
    });
    const buffer = await workbook.xlsx.writeBuffer();
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`اشتراكات-${String(cycle.name).replace('/', '-')}.xlsx`)}`,
        'Cache-Control': 'no-store',
      })
      .send(Buffer.from(buffer));
  });

  router.post('/payments', finance, async (req, res) => {
    const body = paymentSchema.parse(req.body);
    if (body.paidAt > new Date().toISOString().slice(0, 10)) fail(400, 'لا يمكن تسجيل دفعة بتاريخ في المستقبل.');
    if (Number.isNaN(Date.parse(body.paidAt))) fail(400, 'التاريخ غير صالح.');
    const created = await transaction(async client => {
      // One payment is recorded at a time, so two clicks cannot pay the same quarter twice.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['subscriptions']);
      const cycleId = (await client.query('SELECT "CycleId" FROM "Cycles" WHERE "IsCurrent"')).rows[0]?.CycleId;
      if (!cycleId) fail(409, ARCHIVED_MESSAGE);
      // Existing students are matched by name (ignoring case and extra spaces); an unknown name becomes a new student.
      let student = (
        await client.query(
          'SELECT "StudentId" AS id, "Name" AS name FROM "Students" WHERE lower(btrim("Name"))=lower($1)',
          [body.studentName],
        )
      ).rows[0];
      if (!student)
        student = (
          await client.query(
            'INSERT INTO "Students" ("Name") VALUES ($1) RETURNING "StudentId" AS id, "Name" AS name',
            [body.studentName],
          )
        ).rows[0];
      const already = (
        await client.query(
          `SELECT "Quarters" FROM "SubscriptionPayments" WHERE "CycleId"=$1 AND "StudentId"=$2 AND "Quarters" && $3::int[]`,
          [cycleId, student.id, body.quarters],
        )
      ).rows;
      if (already.length) {
        const paid = body.quarters.filter(quarter => already.some(row => (row.Quarters as number[]).includes(quarter)));
        fail(409, `${student.name} سدّد بالفعل: ${quarterNames(paid)}.`);
      }
      const income = (
        await client.query(
          `INSERT INTO "BudgetTransactions" ("CycleId","Fund","Kind","Amount","Category","Description","TxDate","CreatedByUserId")
            VALUES ($1,'union','income',$2,'اشتراكات',$3,$4,$5) RETURNING "TransactionId" AS id`,
          [
            cycleId,
            body.amount,
            `اشتراك ${student.name} — ${quarterNames(body.quarters)}`,
            body.paidAt,
            req.actor.userId,
          ],
        )
      ).rows[0];
      const payment = (
        await client.query(
          `INSERT INTO "SubscriptionPayments" ("CycleId","StudentId","Amount","Quarters","PaidAt","BudgetTransactionId","CreatedByUserId")
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "PaymentId" AS id`,
          [cycleId, student.id, body.amount, body.quarters, body.paidAt, income.id, req.actor.userId],
        )
      ).rows[0];
      return { paymentId: payment.id as number, studentName: student.name as string };
    });
    await audit(req, {
      action: 'subscription.add',
      targetType: 'subscription',
      targetId: created.paymentId,
      summary: `سجّل اشتراك ${created.studentName} (${quarterNames(body.quarters)}) بمبلغ ${formatAmount(body.amount)} في ${FUNDS.union}`,
      details: { amount: body.amount, quarters: body.quarters, paidAt: body.paidAt },
    });
    res.status(201).json({ paymentId: created.paymentId });
  });

  router.delete('/payments/:id', finance, async (req, res) => {
    const paymentId = id(req.params.id);
    const removed = await transaction(async client => {
      const payment = (
        await client.query(
          `SELECT p."CycleId" AS "cycleId", p."Amount"::float8 AS amount, p."Quarters" AS quarters, p."BudgetTransactionId" AS "budgetId",
              s."Name" AS name, c."IsCurrent" AS "isCurrent"
            FROM "SubscriptionPayments" p JOIN "Students" s ON s."StudentId"=p."StudentId"
            JOIN "Cycles" c ON c."CycleId"=p."CycleId" WHERE p."PaymentId"=$1 FOR UPDATE OF p`,
          [paymentId],
        )
      ).rows[0];
      if (!payment) fail(404, 'الدفعة غير موجودة.');
      if (!payment.isCurrent) fail(403, ARCHIVED_MESSAGE);
      await client.query('DELETE FROM "SubscriptionPayments" WHERE "PaymentId"=$1', [paymentId]);
      // The treasury line goes with it, so the totals stay equal.
      if (payment.budgetId)
        await client.query('DELETE FROM "BudgetTransactions" WHERE "TransactionId"=$1', [payment.budgetId]);
      return payment;
    });
    await audit(req, {
      action: 'subscription.delete',
      targetType: 'subscription',
      targetId: paymentId,
      summary: `حذف اشتراك ${removed.name} (${quarterNames(removed.quarters)}) بمبلغ ${formatAmount(removed.amount)}`,
      details: { amount: removed.amount, quarters: removed.quarters },
    });
    res.sendStatus(204);
  });

  return router;
}
