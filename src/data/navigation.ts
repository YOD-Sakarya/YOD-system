import { CalendarDays, ClipboardCheck, Files, LayoutDashboard, Users, Vote } from 'lucide-react';

/** Sidebar entries; also used to derive the page title from the current path. */
export const navigation = [
  { to: '/', label: 'نظرة عامة', icon: LayoutDashboard },
  { to: '/documents', label: 'المستندات', icon: Files },
  { to: '/reviews', label: 'المراجعات', icon: ClipboardCheck },
  { to: '/votes', label: 'جلسات التصويت', icon: Vote },
  { to: '/calendar', label: 'تقويم الاتحاد', icon: CalendarDays },
  { to: '/committees', label: 'اللجان والصلاحيات', icon: Users },
];
