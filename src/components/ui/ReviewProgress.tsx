import { number } from '../../lib/format';
import { REVIEWER_ROLE_IDS, PROPOSAL_TYPE_ID } from '../../lib/roles';
import type { Document } from '../../types';

/** Three dots showing how many of the required reviewers (president, secretary general, financial officer)
 * have reviewed a proposal; other document types need no review. */
export function ReviewProgress({ doc }: { doc: Document }) {
  if (doc.docTypeId !== PROPOSAL_TYPE_ID) return <span className="muted">—</span>;
  const count = REVIEWER_ROLE_IDS.filter(role => doc.reviews.some(r => r.roleId === role)).length;
  return (
    <span
      className="review-progress"
      aria-label={`اكتملت ${number(count)} من ٣ مراجعات`}
      title="مراجعة الرئيس والأمين العام والمسؤول المالي"
    >
      <span aria-hidden="true">
        {REVIEWER_ROLE_IDS.map(role => (
          <i key={role} className={doc.reviews.some(r => r.roleId === role) ? 'done' : ''} />
        ))}
      </span>
      <small aria-hidden="true">{number(count)} / ٣</small>
    </span>
  );
}
