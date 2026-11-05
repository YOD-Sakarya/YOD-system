/** Mirrors server/services/subscriptions.ts. */
export const QUARTER_LABELS = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'];
export const quarterNames = (quarters: number[]) => quarters.map(quarter => QUARTER_LABELS[quarter - 1]).join('، ');

export type Student = { id: number; name: string };
export type SubscriptionPayment = {
  id: number;
  studentId: number;
  studentName: string;
  amount: number;
  quarters: number[];
  paidAt: string;
  createdByName: string;
};
export type SubscriptionsReport = {
  cycleId: number;
  isCurrent: boolean;
  students: Student[];
  payments: SubscriptionPayment[];
};
