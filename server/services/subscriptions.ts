/** The four quarters of a yearly cycle; payments cover one to four of them. */
export const QUARTER_LABELS = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'] as const;
export const quarterNames = (quarters: number[]) => quarters.map(quarter => QUARTER_LABELS[quarter - 1]).join('، ');

/**
 * Students who pay a subscription, and their payments. Every payment is also an income line of the union treasury
 * (BudgetTransactionId), so the money is typed once and the two always agree.
 */
export const subscriptionTablesSql = [
  `CREATE TABLE IF NOT EXISTS "Students" (
    "StudentId" serial PRIMARY KEY,
    "Name" text NOT NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT NOW()
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "Students_Name" ON "Students" (lower(btrim("Name")))',
  `CREATE TABLE IF NOT EXISTS "SubscriptionPayments" (
    "PaymentId" serial PRIMARY KEY,
    "CycleId" integer NOT NULL REFERENCES "Cycles"("CycleId"),
    "StudentId" integer NOT NULL REFERENCES "Students"("StudentId"),
    "Amount" numeric(14,2) NOT NULL CHECK ("Amount" > 0),
    "Quarters" integer[] NOT NULL CHECK (cardinality("Quarters") BETWEEN 1 AND 4 AND "Quarters" <@ ARRAY[1,2,3,4]),
    "PaidAt" date NOT NULL,
    "BudgetTransactionId" integer REFERENCES "BudgetTransactions"("TransactionId") ON DELETE SET NULL,
    "CreatedByUserId" integer NOT NULL REFERENCES "Users"("UserId"),
    "CreatedAt" timestamptz NOT NULL DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS "SubscriptionPayments_Cycle" ON "SubscriptionPayments" ("CycleId","StudentId")',
];
