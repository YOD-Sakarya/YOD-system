import { useState, type FormEvent } from 'react';
import { Check, Download, Eye, FileText, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { api, json } from '../../lib/api';
import { getAuthHeaders, getAuthSettings } from '../../lib/auth';
import { date } from '../../lib/format';
import { canDeleteDocument } from '../../lib/documents';
import { REVIEWER_ROLE_IDS, REVIEWER_TITLES, isDeveloper, reviewerRolesFor } from '../../lib/roles';
import type { Document, User } from '../../types';
import { Modal } from '../ui/Modal';
import { ReviewProgress } from '../ui/ReviewProgress';
import { Status } from '../ui/Status';
import { errorText, PreviewNote, type DialogProps } from './shared';

/** Document details with download, edit/delete (owner or leadership) and the review history/form. */
export function DocumentDialog({
  document: doc,
  user,
  preview,
  archived,
  onClose,
  onSaved,
  onEdit,
}: DialogProps & { document: Document; user: User; archived: boolean; onEdit: (d: Document) => void }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    // Developer only: the reviewer role a decision is recorded for.
    [asRoleId, setAsRoleId] = useState(0);
  const developer = isDeveloper(user);
  // Roles that must review this document (proposals: leadership; oversight uploads: the other oversight members).
  const reviewers = reviewerRolesFor(doc);
  // Finished cycles are read-only for everyone except the developer; only the developer deletes.
  const canEdit =
    (doc.ownerUserId === user.userId || REVIEWER_ROLE_IDS.includes(user.roleId) || developer) &&
    (!archived || developer);
  const actingRole = developer ? asRoleId || reviewers[0] : user.roleId;
  const myReview = developer
    ? doc.reviews.find(r => r.roleId === actingRole)
    : doc.reviews.find(r => r.reviewerId === user.userId);
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/reviews', {
        method: 'POST',
        body: json({ documentId: doc.docId, ...values, ...(developer ? { asRoleId: actingRole } : {}) }),
      });
      await onSaved('تم حفظ المراجعة.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api(`/documents/${doc.docId}`, { method: 'DELETE' });
      await onSaved('تم حذف المستند.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  /** Opens the file in a new tab. The tab is opened first (while the click still counts) and filled once the file arrives. */
  async function view() {
    // Cookie sign-in: the new tab loads the file straight from the server, which phones handle better than a blob.
    if ((await getAuthSettings()).provider === 'legacy') {
      window.open(`/api/documents/${doc.docId}/view`, '_blank');
      return;
    }
    const tab = window.open('', '_blank');
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/documents/${doc.docId}/view`, { headers: await getAuthHeaders() });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message);
      }
      const blob = await response.blob();
      if (!tab) throw new Error('اسمح للموقع بفتح النوافذ المنبثقة لعرض الملف.');
      tab.location.href = URL.createObjectURL(blob);
    } catch (e) {
      tab?.close();
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/documents/${doc.docId}/download`, { headers: await getAuthHeaders() });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message);
      }
      const url = URL.createObjectURL(await response.blob());
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = match ? decodeURIComponent(match[1]) : doc.title;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="تفاصيل المستند" onClose={onClose} wide busy={busy}>
      <div className="modal-body">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {preview && <PreviewNote />}
        <div className="detail-title">
          <span className={`file-icon large file-${doc.docTypeId}`}>
            <FileText size={27} />
          </span>
          <div>
            <h3>{doc.title}</h3>
            <span>
              {doc.typeName} · {doc.roleName}
            </span>
          </div>
          <Status value={doc.status} />
        </div>
        <dl className="details-grid">
          <div>
            <dt>أضيف بواسطة</dt>
            <dd>{doc.ownerName}</dd>
          </div>
          <div>
            <dt>تاريخ الإضافة</dt>
            <dd>{date(doc.createdAt, { year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>تاريخ الفعالية</dt>
            <dd>{date(doc.eventDate, { year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>الفترة</dt>
            <dd>{doc.quarterName}</dd>
          </div>
        </dl>
        <div className="detail-actions">
          <button className="button secondary" onClick={view} disabled={busy || preview}>
            <Eye size={17} />
            عرض الملف
          </button>
          <button className="button secondary" onClick={download} disabled={busy || preview}>
            <Download size={17} />
            تنزيل الملف
          </button>
          {canEdit && (
            <>
              <button className="button secondary" disabled={busy || preview} onClick={() => onEdit(doc)}>
                <Pencil size={16} />
                تعديل
              </button>
              {canDeleteDocument(user, doc, archived) && (
                <button className="button danger-button" disabled={busy || preview} onClick={() => setConfirm(true)}>
                  <Trash2 size={16} />
                  حذف
                </button>
              )}
            </>
          )}
        </div>
        {confirm && (
          <div className="delete-confirm" role="alert">
            <strong>هل تريد حذف «{doc.title}»؟</strong>
            <p>سيُحذف المستند ومراجعاته من مساحة العمل.</p>
            <button className="button danger-solid" disabled={busy} onClick={remove}>
              نعم، حذف المستند
            </button>
            <button className="button secondary" onClick={() => setConfirm(false)}>
              تراجع
            </button>
          </div>
        )}
        {reviewers.length > 0 && (
          <section className="detail-reviews">
            <div className="section-title">
              <h3>سجل المراجعات</h3>
              <ReviewProgress doc={doc} />
            </div>
            {reviewers.map(roleId => {
              const r = doc.reviews.find(rv => rv.roleId === roleId);
              return (
                <div className="review-row" key={roleId}>
                  <span className={`review-check ${r ? 'done' : ''}`}>{r ? <Check size={16} /> : <span />}</span>
                  <div>
                    <strong>{REVIEWER_TITLES[roleId]}</strong>
                    {r ? (
                      <>
                        <small>
                          {r.reviewerName} · {date(r.reviewedAt)}
                        </small>
                        {r.comment && <p>{r.comment}</p>}
                      </>
                    ) : (
                      <small>بانتظار المراجعة</small>
                    )}
                  </div>
                  {r && <Status value={r.decision} />}
                </div>
              );
            })}
            {(developer || (reviewers.includes(user.roleId) && !archived)) && (
              <form key={actingRole} className="review-form form-stack" onSubmit={review}>
                <h3>{developer ? 'قرار المطوّر نيابةً عن دور' : myReview ? 'تحديث مراجعتك' : 'أضف مراجعتك'}</h3>
                {developer && (
                  <label>
                    الدور
                    <select value={actingRole} onChange={event => setAsRoleId(Number(event.target.value))}>
                      {reviewers.map(roleId => (
                        <option key={roleId} value={roleId}>
                          {REVIEWER_TITLES[roleId]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  القرار
                  <select name="decision" defaultValue={myReview?.decision || 'مقبول'}>
                    <option>مقبول</option>
                    <option>مرفوض</option>
                  </select>
                </label>
                <label>
                  ملاحظات المراجعة
                  <textarea
                    name="comment"
                    rows={3}
                    maxLength={4000}
                    defaultValue={myReview?.comment || ''}
                    placeholder="أضف ملاحظات تساعد اللجنة على المتابعة…"
                  />
                </label>
                <button className="button primary" disabled={busy || preview}>
                  {busy && <LoaderCircle className="spin" size={17} />}حفظ المراجعة
                </button>
              </form>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
