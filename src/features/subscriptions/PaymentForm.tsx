import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { api, json } from '../../lib/api';
import { QUARTER_LABELS, type Student, type SubscriptionPayment } from '../../lib/subscriptions';

type Props = {
  students: Student[];
  payments: SubscriptionPayment[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
};

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const clean = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Records a payment for a new or existing student, covering one to four quarters. */
export function PaymentForm({ students, payments, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [quarters, setQuarters] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = students.find(student => clean(student.name) === clean(name));
  // Quarters this student already paid in the year can no longer be ticked.
  const paid = new Set(payments.filter(p => existing && p.studentId === existing.id).flatMap(p => p.quarters));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quarters.length) return setError('اختر ربعًا واحدًا على الأقل.');
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/subscriptions/payments', {
        method: 'POST',
        body: json({ studentName: name, amount: Number(values.amount), paidAt: values.paidAt, quarters }),
      });
      await onSaved('تم تسجيل الاشتراك وإضافته إلى خزينة الاتحاد.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الاشتراك.');
      setBusy(false);
    }
  }

  return (
    <Modal title="تسجيل اشتراك" onClose={onClose} busy={busy}>
      <form className="form-stack modal-body" onSubmit={submit}>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <label>
          اسم الطالب
          <input
            list="student-names"
            value={name}
            onChange={event => {
              setName(event.target.value);
              setQuarters([]);
            }}
            required
            minLength={2}
            maxLength={150}
            autoFocus
            autoComplete="off"
          />
          <datalist id="student-names">
            {students.map(student => (
              <option key={student.id} value={student.name} />
            ))}
          </datalist>
          <small>
            {name.trim()
              ? existing
                ? 'طالب مسجّل سابقًا.'
                : 'طالب جديد، سيُضاف إلى القائمة.'
              : 'اكتب اسمًا جديدًا أو اختر من المسجّلين.'}
          </small>
        </label>
        <fieldset className="quarter-picker">
          <legend>الأرباع المدفوعة</legend>
          <div className="detail-actions">
            {QUARTER_LABELS.map((label, index) => {
              const quarter = index + 1;
              return (
                <label key={quarter} className="check-row">
                  <input
                    type="checkbox"
                    checked={quarters.includes(quarter)}
                    disabled={paid.has(quarter)}
                    onChange={event =>
                      setQuarters(current =>
                        event.target.checked ? [...current, quarter].sort() : current.filter(item => item !== quarter),
                      )
                    }
                  />
                  {label}
                  {paid.has(quarter) && <small> (مدفوع)</small>}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="form-grid">
          <label>
            المبلغ الإجمالي (₺)
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max="1000000000"
              required
              dir="ltr"
            />
          </label>
          <label>
            تاريخ الدفع
            <input name="paidAt" type="date" required defaultValue={today()} max={today()} />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
            حفظ
          </button>
        </div>
      </form>
    </Modal>
  );
}
