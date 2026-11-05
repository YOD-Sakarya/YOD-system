import type { query as databaseQuery } from '../db.js';

/** The two budgets the union keeps. Their ids are stored in the database; the labels are what people read. */
export const FUNDS = { union: 'خزينة الاتحاد', faza: 'صندوق فزعة' } as const;
export type Fund = keyof typeof FUNDS;
export const FUND_IDS = Object.keys(FUNDS) as [Fund, ...Fund[]];

export const INCOME_CATEGORIES = ['اشتراكات', 'إعلانات', 'دعم', 'أخرى'] as const;
export const EXPENSE_CATEGORIES = ['أنشطة', 'مواصلات', 'ضيافة', 'مطبوعات', 'أخرى'] as const;

export const TRANSACTION_KINDS = ['income', 'expense'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const categoriesFor = (kind: TransactionKind): readonly string[] =>
  kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

/** Money is kept with two decimals; sums are rounded back so floating point noise never reaches the screen. */
export const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Budgets are kept per yearly cycle: an opening balance plus dated income and spending entries. */
export const budgetTablesSql = [
  `CREATE TABLE IF NOT EXISTS "BudgetOpening" (
    "CycleId" integer NOT NULL REFERENCES "Cycles"("CycleId"),
    "Fund" text NOT NULL CHECK ("Fund" IN ('union','faza')),
    "Amount" numeric(14,2) NOT NULL,
    PRIMARY KEY ("CycleId","Fund")
  )`,
  `CREATE TABLE IF NOT EXISTS "BudgetTransactions" (
    "TransactionId" serial PRIMARY KEY,
    "CycleId" integer NOT NULL REFERENCES "Cycles"("CycleId"),
    "Fund" text NOT NULL CHECK ("Fund" IN ('union','faza')),
    "Kind" text NOT NULL CHECK ("Kind" IN ('income','expense')),
    "Amount" numeric(14,2) NOT NULL CHECK ("Amount" > 0),
    "Category" text NOT NULL,
    "Description" text NOT NULL DEFAULT '',
    "TxDate" date NOT NULL,
    "FilePath" text,
    "CreatedByUserId" integer NOT NULL REFERENCES "Users"("UserId"),
    "CreatedAt" timestamptz NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS "BudgetTransactions_Cycle" ON "BudgetTransactions" ("CycleId","TxDate" DESC)',
];

/** Opening balance, income, spending and what is left, for both budgets of one cycle. */
export async function budgetSummary(query: typeof databaseQuery, cycleId: number) {
  const rows = await query(
    `SELECT f.fund, COALESCE(o."Amount",0)::float8 AS opening,
        COALESCE(SUM(t."Amount") FILTER (WHERE t."Kind"='income'),0)::float8 AS income,
        COALESCE(SUM(t."Amount") FILTER (WHERE t."Kind"='expense'),0)::float8 AS expense
      FROM (VALUES ('union'),('faza')) AS f(fund)
      LEFT JOIN "BudgetOpening" o ON o."Fund"=f.fund AND o."CycleId"=$1
      LEFT JOIN "BudgetTransactions" t ON t."Fund"=f.fund AND t."CycleId"=$1
      GROUP BY f.fund, o."Amount" ORDER BY f.fund DESC`,
    [cycleId],
  );
  return rows.map(row => {
    const opening = roundMoney(Number(row.opening));
    const income = roundMoney(Number(row.income));
    const expense = roundMoney(Number(row.expense));
    return {
      fund: row.fund as Fund,
      label: FUNDS[row.fund as Fund],
      opening,
      income,
      expense,
      balance: roundMoney(opening + income - expense),
    };
  });
}
