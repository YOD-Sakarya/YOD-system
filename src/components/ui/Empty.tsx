import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

/** Placeholder for lists with nothing to show. */
export function Empty({
  title = 'لا توجد مستندات بعد',
  text = 'ستظهر المستندات هنا عند إضافتها.',
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Inbox size={30} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
