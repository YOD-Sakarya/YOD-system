/** Mirrors server/services/budget.ts and the budget rules in server/security.ts. */
export const FUNDS = { union: 'خزينة الاتحاد', faza: 'صندوق فزعة' } as const;
export type Fund = keyof typeof FUNDS;
export const FUND_IDS = Object.keys(FUNDS) as Fund[];

export const INCOME_CATEGORIES = ['اشتراكات', 'إعلانات', 'دعم', 'أخرى'];
export const EXPENSE_CATEGORIES = ['أنشطة', 'مواصلات', 'ضيافة', 'مطبوعات', 'أخرى'];
export type TransactionKind = 'income' | 'expense';
export const categoriesFor = (kind: TransactionKind) => (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);

const FINANCE_ROLE_ID = 4;
/** President, secretary general, financial officer and the oversight committee (and the developer) see the budgets. */
const BUDGET_VIEWER_ROLE_IDS = [1, 3, FINANCE_ROLE_ID, 10, 12, 13, 11];
export const canViewBudget = (user: { roleId: number }) => BUDGET_VIEWER_ROLE_IDS.includes(user.roleId);
/** Only the financial officer records money in or out; everyone else, the developer included, only looks. */
// TESTING ONLY (branch test/budget-developer-edit): the developer may also add and delete. Never merge to main.
export const canManageBudget = (user: { roleId: number }) => user.roleId === FINANCE_ROLE_ID || user.roleId === 11;

const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Latin digits (easier to read for amounts) with the lira sign; the isolate keeps it in order inside right-to-left text. */
export const money = (value: number) => `\u2066${amountFormat.format(value)} ₺\u2069`;

export type FundSummary = {
  fund: Fund;
  label: string;
  opening: number;
  income: number;
  expense: number;
  balance: number;
};
export type BudgetTransaction = {
  id: number;
  fund: Fund;
  kind: TransactionKind;
  amount: number;
  category: string;
  description: string;
  txDate: string;
  createdAt: string;
  createdByName: string;
  hasAttachment: boolean;
};
export type BudgetReport = {
  cycleId: number;
  cycleName: string;
  isCurrent: boolean;
  funds: FundSummary[];
  transactions: BudgetTransaction[];
};
