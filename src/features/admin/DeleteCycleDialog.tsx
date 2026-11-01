import { useState, type FormEvent } from 'react';
import { LoaderCircle, Trash2, TriangleAlert } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { api, json } from '../../lib/api';
import { number } from '../../lib/format';
import type { Cycle } from '../../types';

export type DeletedCycleSummary = {
  name: string;
  documents: number;
  votes: number;
  filesRemoved: number;
  filesFailed: number;
};

type Props = {
  cycle: Cycle;
  onClose: () => void;
  onDeleted: (summary: DeletedCycleSummary) => Promise<void>;
};

/**
 * Irreversible: deletes a year with its documents, votes and uploaded files. The developer must type the
 * year's exact name before the delete button is enabled, so it cannot happen by a stray click.
 */
export function DeleteCycleDialog({ cycle, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = typed.trim() === cycle.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError('');
    try {
      const summary = await api<DeletedCycleSummary>(`/cycles/${cycle.cycleId}`, {
        method: 'DELETE',
        body: json({ confirm: typed.trim() }),
      });
      await onDeleted(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف العام.');
      setBusy(false);
    }
  }

  return (
    <Modal title={`حذف عام ${cycle.name}`} onClose={onClose} busy={busy}>
      <form className="form-stack modal-body" onSubmit={submit}>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="danger-zone" role="alert">
          <TriangleAlert size={22} />
          <div>
            <strong>تحذير: لا يمكن التراجع عن هذا الإجراء</strong>
            <ul>
              <li>
                سيُحذف <b>{number(cycle.documentCount)}</b> مستند مع مراجعاتها.
              </li>
              <li>
                ستُحذف <b>{number(cycle.voteCount)}</b> جلسة تصويت مع أصواتها.
              </li>
              <li>ستُحذف ملفات هذه المستندات نهائيًا من التخزين السحابي.</li>
              {cycle.isCurrent && <li>هذا هو العام الحالي: سيصبح أحدث عام متبقٍّ هو الحالي.</li>}
            </ul>
          </div>
        </div>
        <label>
          للتأكيد اكتب اسم العام: <b dir="ltr">{cycle.name}</b>
          <input
            value={typed}
            onChange={event => setTyped(event.target.value)}
            dir="ltr"
            autoComplete="off"
            autoFocus
            placeholder={cycle.name}
            aria-invalid={typed.length > 0 && !matches}
          />
        </label>
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
          <button className="button danger-solid" disabled={!matches || busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <Trash2 size={17} />}
            حذف العام نهائيًا
          </button>
        </div>
      </form>
    </Modal>
  );
}
