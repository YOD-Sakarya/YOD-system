import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { api, json } from '../../lib/api';
import { number } from '../../lib/format';
import type { Cycle } from '../../types';
import { DeleteCycleDialog, type DeletedCycleSummary } from './DeleteCycleDialog';

type Props = { cycles: Cycle[]; onChanged: () => Promise<void> };

/** Lists every cycle and starts a new one. Starting a cycle archives the previous year; nothing is deleted. */
export function CyclesPanel({ cycles, onChanged }: Props) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Cycle | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = cycles.find(c => c.isCurrent);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/cycles', { method: 'POST', body: json(values) });
      await onChanged();
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء العام الجديد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>الأعوام</h2>
          <p>عند بدء عام جديد يصبح العام السابق أرشيفًا للقراءة فقط، دون حذف أي مستند.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          بدء عام جديد
        </button>
      </div>
      <div className="table-scroll">
        <table className="document-table">
          <thead>
            <tr>
              <th>العام</th>
              <th>البداية</th>
              <th>النهاية</th>
              <th>المستندات</th>
              <th>جلسات التصويت</th>
              <th>الحالة</th>
              <th>
                <span className="sr-only">حذف</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cycles.map(c => (
              <tr key={c.cycleId}>
                <td>
                  <strong>{c.name}</strong>
                </td>
                <td dir="ltr">{c.startDate}</td>
                <td dir="ltr">{c.endDate ?? '—'}</td>
                <td>{number(c.documentCount)}</td>
                <td>{number(c.voteCount)}</td>
                <td>
                  <span className={`status ${c.isCurrent ? 'success' : 'neutral'}`}>
                    {c.isCurrent ? 'الحالي' : 'أرشيف'}
                  </span>
                </td>
                <td>
                  <button
                    className="icon-button danger-icon"
                    aria-label={`حذف عام ${c.name}`}
                    title="حذف العام"
                    disabled={cycles.length < 2}
                    onClick={() => setDeleting(c)}
                  >
                    <Trash2 size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      {deleting && (
        <DeleteCycleDialog
          cycle={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async (summary: DeletedCycleSummary) => {
            setDeleting(null);
            await onChanged();
            setNotice(
              `تم حذف عام ${summary.name}: ${number(summary.documents)} مستند و${number(summary.votes)} جلسة تصويت و${number(summary.filesRemoved)} ملف.` +
                (summary.filesFailed ? ` تعذر حذف ${number(summary.filesFailed)} ملف من التخزين السحابي.` : ''),
            );
          }}
        />
      )}
      {creating && (
        <Modal title="بدء عام جديد" onClose={() => setCreating(false)} busy={busy}>
          <form className="form-stack modal-body" onSubmit={submit}>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <p className="form-notice">
              سيُؤرشف عام {current?.name ?? 'الحالي'}: يبقى كل شيء ظاهرًا للقراءة، وتُرفع المستندات الجديدة في العام
              الجديد.
            </p>
            <div className="form-grid">
              <label>
                اسم العام
                <input name="name" required minLength={3} maxLength={40} placeholder="2027/2028" dir="ltr" autoFocus />
              </label>
              <label>
                تاريخ البداية
                <input name="startDate" type="date" required />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="button secondary" disabled={busy} onClick={() => setCreating(false)}>
                إلغاء
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
                بدء العام الجديد
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
