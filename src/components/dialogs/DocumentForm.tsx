import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api';
import { isDeveloper } from '../../lib/roles';
import type { Catalog, Document, User } from '../../types';
import { Modal } from '../ui/Modal';
import { errorText, PreviewNote, type DialogProps } from './shared';

/** Create or edit a document. Only types permitted for the owner's role are offered. */
export function DocumentForm({
  document: doc,
  user,
  catalog,
  preview,
  onClose,
  onSaved,
}: DialogProps & { document: Document | null; user: User; catalog: Catalog }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [filename, setFilename] = useState('');
  // The developer may create any document type; other roles only the types granted to their role.
  const types = isDeveloper(user)
    ? catalog.types
    : catalog.types.filter(t =>
        catalog.permissions.some(p => p.roleId === (doc?.roleId || user.roleId) && p.docTypeId === t.docTypeId),
      );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    setBusy(true);
    setError('');
    const body = new FormData(event.currentTarget);
    const file = body.get('file');
    if (file instanceof File && !file.size) body.delete('file');
    if (file instanceof File && file.size > 100 * 1024 * 1024) {
      setError('الحد الأقصى للملف ١٠٠ ميجابايت.');
      setBusy(false);
      return;
    }
    try {
      await api(doc ? `/documents/${doc.docId}` : '/documents', { method: doc ? 'PUT' : 'POST', body });
      await onSaved(doc ? 'تم تحديث المستند وإعادة فتح المراجعة.' : 'تمت إضافة المستند.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={doc ? 'تعديل المستند' : 'إضافة مستند'} onClose={onClose} busy={busy}>
      <form className="form-stack modal-body" onSubmit={submit}>
        {preview && <PreviewNote />}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {!types.length ? (
          <p className="form-notice">دورك الحالي لا يملك صلاحية إضافة مستندات.</p>
        ) : (
          <>
            <label>
              عنوان المستند
              <input
                name="title"
                required
                minLength={2}
                maxLength={250}
                defaultValue={doc?.title}
                placeholder="مثال: تصور الملتقى الطلابي"
                autoFocus
              />
            </label>
            <div className="form-grid">
              <label>
                نوع المستند
                <select name="docTypeId" defaultValue={doc?.docTypeId || types[0]?.docTypeId}>
                  {types.map(t => (
                    <option key={t.docTypeId} value={t.docTypeId}>
                      {t.typeName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                الربع
                <select name="quarterId" defaultValue={doc?.quarterId || Math.floor(new Date().getMonth() / 3) + 1}>
                  {catalog.quarters.map(q => (
                    <option key={q.quarterId} value={q.quarterId}>
                      {q.quarterName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              تاريخ الفعالية
              <input type="date" name="eventDate" required defaultValue={doc?.eventDate.slice(0, 10)} />
            </label>
            <label className="upload-zone">
              <UploadCloud size={30} />
              <strong>{filename || (doc ? 'اختر ملفًا جديدًا لاستبدال المرفق' : 'اختر ملف المستند')}</strong>
              <span>الحد الأقصى ١٠٠ ميجابايت</span>
              <input
                type="file"
                name="file"
                required={!doc}
                onChange={e => setFilename(e.target.files?.[0]?.name || '')}
              />
            </label>
            {doc && (
              <p className="muted small-text">عند تعديل المستند، تُمسح المراجعات السابقة ليُراجع الإصدار الجديد.</p>
            )}
          </>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
          <button className="button primary" disabled={busy || preview || !types.length}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
            {doc ? 'حفظ التعديلات' : 'إضافة المستند'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
