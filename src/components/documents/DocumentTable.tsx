import { ChevronLeft, Files, LoaderCircle } from 'lucide-react';
import { date } from '../../lib/format';
import type { Document } from '../../types';
import { Empty } from '../ui/Empty';
import { ReviewProgress } from '../ui/ReviewProgress';
import { Status } from '../ui/Status';

/** Document list; `compact` hides the event-date column for the overview panel. */
export function DocumentTable({
  documents,
  onSelect,
  loading = false,
  compact = false,
}: {
  documents: Document[];
  onSelect: (d: Document) => void;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading)
    return (
      <div className="table-loading" role="status">
        <LoaderCircle className="spin" size={24} />
        جارٍ تحميل المستندات…
      </div>
    );
  if (!documents.length) return <Empty />;
  return (
    <div className="table-scroll">
      {/* On phones the "cards" modifier turns each row into a stacked card (see styles/responsive.css). */}
      <table className="document-table cards">
        <thead>
          <tr>
            <th>المستند</th>
            <th>اللجنة</th>
            {!compact && <th>تاريخ الفعالية</th>}
            <th>الحالة</th>
            <th>المراجعة</th>
            <th>
              <span className="sr-only">التفاصيل</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map(d => (
            <tr key={d.docId}>
              <td className="col-title">
                <button className="document-title" onClick={() => onSelect(d)}>
                  <span className={`file-icon file-${d.docTypeId}`}>
                    <Files size={19} />
                  </span>
                  <span>
                    <strong>{d.title}</strong>
                    <small>
                      {d.typeName} <span className="dot-separator" />
                      {date(d.createdAt)}
                    </small>
                  </span>
                </button>
              </td>
              <td className="col-committee">
                <span className="committee-cell">
                  <i className={`committee-dot dot-${d.roleId % 4}`} />
                  {d.roleName}
                </span>
              </td>
              {!compact && <td className="nowrap col-date">{date(d.eventDate, { year: 'numeric' })}</td>}
              <td className="col-status">
                <Status value={d.status} />
              </td>
              <td className="col-progress">
                <ReviewProgress doc={d} />
              </td>
              <td className="col-open">
                <button className="icon-button" aria-label={`تفاصيل ${d.title}`} onClick={() => onSelect(d)}>
                  <ChevronLeft size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
