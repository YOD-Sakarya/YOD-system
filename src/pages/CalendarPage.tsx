import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Empty } from '../components/ui/Empty';
import { PageHeading } from '../components/ui/PageHeading';
import { matchesDocument } from '../lib/documents';
import { date, number } from '../lib/format';
import type { Data, Document } from '../types';

/** Month grid of document event dates plus an agenda list for the same month. */
export function CalendarPage({
  data,
  query,
  onDocument,
}: {
  data: Data;
  query: string;
  onDocument: (d: Document) => void;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const today = new Date(),
    count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    offset = month.getDay();
  const docs = data.documents.filter(
    d =>
      matchesDocument(d, query) &&
      new Date(d.eventDate).getMonth() === month.getMonth() &&
      new Date(d.eventDate).getFullYear() === month.getFullYear(),
  );
  return (
    <>
      <PageHeading title="تقويم الاتحاد" description="نظرة على مواعيد الفعاليات والأعمال المرتبطة بالمستندات." />
      <section className="panel calendar-panel">
        <div className="panel-heading">
          <h2>{date(month.toISOString(), { month: 'long', year: 'numeric', day: undefined })}</h2>
          <div className="calendar-controls">
            <button
              className="button secondary small-button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              الشهر السابق
            </button>
            <button
              className="button secondary small-button"
              onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            >
              اليوم
            </button>
            <button
              className="button secondary small-button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              الشهر التالي
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(day => (
            <div className="calendar-weekday" key={day}>
              {day}
            </div>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <div className="calendar-day outside" key={`blank-${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => (
            <div
              key={i}
              className={`calendar-day ${today.getDate() === i + 1 && today.getMonth() === month.getMonth() && today.getFullYear() === month.getFullYear() ? 'today' : ''}`}
            >
              <span className="day-number">{number(i + 1)}</span>
              {docs
                .filter(d => new Date(d.eventDate).getDate() === i + 1)
                .map(d => (
                  <button key={d.docId} onClick={() => onDocument(d)}>
                    {d.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </section>
      <section className="panel calendar-agenda">
        <div className="panel-heading">
          <h2>
            مواعيد هذا الشهر <span className="count-badge">{number(docs.length)}</span>
          </h2>
        </div>
        {docs.length ? (
          docs
            .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
            .map(d => (
              <button key={d.docId} className="agenda-item" onClick={() => onDocument(d)}>
                <span className="date-tile">
                  <strong>{number(new Date(d.eventDate).getDate())}</strong>
                  <small>{date(d.eventDate, { weekday: 'short', day: undefined, month: undefined })}</small>
                </span>
                <span>
                  <strong>{d.title}</strong>
                  <small>{d.roleName}</small>
                </span>
                <ChevronLeft size={16} />
              </button>
            ))
        ) : (
          <Empty title="لا توجد مواعيد هذا الشهر" text="المستندات التي تحمل تاريخ فعالية ستظهر هنا." />
        )}
      </section>
    </>
  );
}
