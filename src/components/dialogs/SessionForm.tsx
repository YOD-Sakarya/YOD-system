import { useState, type FormEvent } from 'react';
import { LoaderCircle, Trash2, Vote } from 'lucide-react';
import { api, json } from '../../lib/api';
import { number } from '../../lib/format';
import { Modal } from '../ui/Modal';
import { errorText, PreviewNote, type DialogProps } from './shared';

/** Create a vote session with 2-10 options and an optional closing time. */
export function SessionForm({ preview, onClose, onSaved }: DialogProps) {
  const [options, setOptions] = useState(['', '']),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/votes', {
        method: 'POST',
        body: json({
          title: values.title,
          description: values.description,
          closeAt: values.closeAt ? new Date(String(values.closeAt)).toISOString() : null,
          options,
        }),
      });
      await onSaved('تم فتح جلسة التصويت.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="جلسة تصويت جديدة" onClose={onClose} busy={busy}>
      <form className="form-stack modal-body" onSubmit={submit}>
        {preview && <PreviewNote />}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          عنوان الجلسة
          <input
            name="title"
            required
            minLength={3}
            maxLength={250}
            autoFocus
            placeholder="ما القرار الذي نريد اتخاذه؟"
          />
        </label>
        <label>
          التفاصيل
          <textarea name="description" rows={3} maxLength={4000} required />
        </label>
        <fieldset className="option-fields">
          <legend>خيارات التصويت</legend>
          {options.map((o, i) => (
            <div key={i}>
              <input
                aria-label={`الخيار ${number(i + 1)}`}
                required
                maxLength={200}
                value={o}
                onChange={e => setOptions(options.map((value, j) => (i === j ? e.target.value : value)))}
                placeholder={`الخيار ${number(i + 1)}`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`حذف الخيار ${number(i + 1)}`}
                  onClick={() => setOptions(options.filter((_, j) => i !== j))}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <button type="button" className="text-link" onClick={() => setOptions([...options, ''])}>
              إضافة خيار آخر
            </button>
          )}
        </fieldset>
        <label>
          موعد الإغلاق (اختياري)
          <input name="closeAt" type="datetime-local" />
        </label>
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
          <button className="button primary" disabled={busy || preview}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Vote size={17} />}فتح التصويت
          </button>
        </div>
      </form>
    </Modal>
  );
}
