import { number } from '../../lib/format';
import { reviewerRolesFor } from '../../lib/roles';
import type { Document } from '../../types';

/** One dot per required reviewer showing who has reviewed; documents that need no review show a dash. */
export function ReviewProgress({ doc }: { doc: Document }) {
  const required = reviewerRolesFor(doc);
  if (!required.length) return <span className="muted">—</span>;
  const count = required.filter(role => doc.reviews.some(r => r.roleId === role)).length;
  return (
    <span
      className="review-progress"
      aria-label={`اكتملت ${number(count)} من ${number(required.length)} مراجعات`}
      title="المراجعات المطلوبة لاعتماد المستند"
    >
      <span aria-hidden="true">
        {required.map(role => (
          <i key={role} className={doc.reviews.some(r => r.roleId === role) ? 'done' : ''} />
        ))}
      </span>
      <small aria-hidden="true">
        {number(count)} / {number(required.length)}
      </small>
    </span>
  );
}
