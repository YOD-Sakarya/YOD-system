import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { categoriesFor, FUND_IDS, FUNDS, type Fund, type TransactionKind } from '../../lib/budget';

type Props = {
  fund: Fund;
  kind: TransactionKind;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
};

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Records money coming in or going out, with its date, category and an optional receipt or document. */
export function TransactionForm({ fund: initialFund, kind: initialKind, onClose, onSaved }: Props) {
  const [kind, setKind] = useState(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    // An empty file input still sends an empty part; leave it out.
    const file = form.get('file');
    if (file instanceof File && !file.size) form.delete('file');
    form.set('kind', kind);
    try {
      await api('/budget/transactions', { method: 'POST', body: form });
      await onSaved(kind === 'income' ? 'تم تسجيل الدخل.' : 'تم تسجيل المصروف.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الحركة.');
      setBusy(false);
    }
  }

  return (
    <Modal title={kind === 'income' ? 'إضافة مبلغ (دخل)' : 'خصم مبلغ (مصروف)'} onClose={onClose} busy={busy}>
      <form className="form-stack modal-body" onSubmit={submit}>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="segmented" role="group" aria-label="نوع الحركة">
          <button type="button" className={kind === 'income' ? 'active' : ''} onClick={() => setKind('income')}>
            دخل
          </button>
          <button type="button" className={kind === 'expense' ? 'active' : ''} onClick={() => setKind('expense')}>
            مصروف
          </button>
        </div>
        <div className="form-grid">
          <label>
            الميزانية
            <select name="fund" defaultValue={initialFund}>
              {FUND_IDS.map(id => (
                <option key={id} value={id}>
                  {FUNDS[id]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {kind === 'income' ? 'مصدر الدخل' : 'جهة الصرف'}
            {/* key resets the choice when switching between the income and spending lists */}
            <select name="category" key={kind} defaultValue={categoriesFor(kind)[0]}>
              {categoriesFor(kind).map(category => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            المبلغ (₺)
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max="1000000000"
              required
              dir="ltr"
              autoFocus
            />
          </label>
          <label>
            {kind === 'income' ? 'تاريخ الدخل' : 'تاريخ الصرف'}
            <input name="txDate" type="date" required defaultValue={today()} max={today()} />
          </label>
        </div>
        <label>
          ملاحظة (اختياري)
          <input name="description" maxLength={500} placeholder="مثال: اشتراك شهر نوفمبر" />
        </label>
        <label>
          مرفق: إيصال أو مستند (اختياري)
          <input name="file" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" />
          <small>يراه الرئيس والأمين العام والمسؤول المالي ولجنة الرقابة فقط.</small>
        </label>
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
