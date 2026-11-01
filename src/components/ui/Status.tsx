import { Check, CircleX, Clock3, FileText } from 'lucide-react';

/** Coloured status pill for documents and reviews. */
export function Status({ value }: { value: string }) {
  const kind =
    value === 'مقبول' ? 'success' : value === 'مرفوض' ? 'danger' : value === 'قيد المراجعة' ? 'warning' : 'neutral';
  const Icon = kind === 'success' ? Check : kind === 'danger' ? CircleX : kind === 'warning' ? Clock3 : FileText;
  return (
    <span className={`status ${kind}`}>
      <Icon size={13} />
      {value === 'لا يحتاج إلى مراجعة' ? 'مكتمل' : value}
    </span>
  );
}
