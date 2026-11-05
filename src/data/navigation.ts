import { CalendarDays, ClipboardCheck, Files, LayoutDashboard, Settings2, Users, Vote, Wallet } from 'lucide-react';

/** Sidebar entries; also used to derive the page title from the current path. */
export const navigation = [
  { to: '/', label: 'نظرة عامة', icon: LayoutDashboard },
  { to: '/documents', label: 'المستندات', icon: Files },
  { to: '/reviews', label: 'المراجعات', icon: ClipboardCheck },
  { to: '/votes', label: 'جلسات التصويت', icon: Vote },
  { to: '/calendar', label: 'تقويم الاتحاد', icon: CalendarDays },
  { to: '/committees', label: 'اللجان والصلاحيات', icon: Users },
];

/** Shown only to people who may see the budgets (see canViewBudget). */
export const budgetNavigation = { to: '/budget', label: 'الميزانية', icon: Wallet };

/** Reached from the user card in the sidebar; only used for the page title. */
export const accountNavigation = { to: '/account', label: 'حسابي' };

/** Developer-only entry, appended to the sidebar for the developer role. */
export const adminNavigation = { to: '/admin', label: 'لوحة المطوّر', icon: Settings2 };
