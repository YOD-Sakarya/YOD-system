import type { StorageReport, Usage, UsageLevel } from '../types';
import { number } from './format';

/** Human-readable size in Arabic digits, e.g. "٣٫٢ ميجابايت". */
export function formatBytes(bytes: number) {
  const units = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat('ar', { numberingSystem: 'arab', maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}

export const levelMessage: Record<UsageLevel, string> = {
  ok: 'المساحة كافية',
  warning: 'المساحة تمتلئ، يُنصح بالتخطيط للتوسعة',
  critical: 'المساحة على وشك الامتلاء!',
  full: 'المساحة ممتلئة! قد تفشل عمليات الرفع',
};

const severity: UsageLevel[] = ['ok', 'warning', 'critical', 'full'];

/** The fuller of the two storage areas decides the alert shown in the top bar. */
export function worstUsage(report: StorageReport | null): (Usage & { label: string }) | null {
  const items = [
    report?.files && { ...report.files, label: 'الملفات' },
    report?.database && { ...report.database, label: 'قاعدة البيانات' },
  ].filter(Boolean) as (Usage & { label: string })[];
  if (!items.length) return null;
  return items.reduce((a, b) =>
    severity.indexOf(b.level) > severity.indexOf(a.level) || b.percent > a.percent ? b : a,
  );
}

export const percentText = (percent: number) => `${number(Math.round(percent))}٪`;
