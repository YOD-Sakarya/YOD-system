import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
import { Empty } from '../components/ui/Empty';
import { PageHeading } from '../components/ui/PageHeading';
import { PaymentForm } from '../features/subscriptions/PaymentForm';
import { api } from '../lib/api';
import { getAuthHeaders } from '../lib/auth';
import { canManageBudget, money } from '../lib/budget';
import { number } from '../lib/format';
import { matchesText } from '../lib/search';
import { QUARTER_LABELS, quarterNames, type SubscriptionPayment, type SubscriptionsReport } from '../lib/subscriptions';
import type { User } from '../types';

type Props = { user: User; cycleId: number | null; onToast: (message: string) => void };

/** Student subscriptions per quarter. The financial officer records payments; the others who may open it only look. */
export function SubscriptionsPage({ user, cycleId, onToast }: Props) {
  const [report, setReport] = useState<SubscriptionsReport | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const mayEdit = canManageBudget(user) && !!report?.isCurrent;

  const load = useCallback(async () => {
    try {
      setReport(await api<SubscriptionsReport>(cycleId ? `/subscriptions?cycleId=${cycleId}` : '/subscriptions'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الاشتراكات.');
    }
  }, [cycleId]);
  useEffect(() => {
    setReport(null);
    void load();
  }, [load]);

  // One row per student with the quarters they paid this year.
  const rows = useMemo(() => {
    const byStudent = new Map<number, { id: number; name: string; quarters: Set<number>; total: number }>();
    for (const payment of report?.payments ?? []) {
      const row = byStudent.get(payment.studentId) ?? {
        id: payment.studentId,
        name: payment.studentName,
        quarters: new Set<number>(),
        total: 0,
      };
      payment.quarters.forEach(quarter => row.quarters.add(quarter));
      row.total = Math.round((row.total + payment.amount) * 100) / 100;
      byStudent.set(payment.studentId, row);
    }
    return [...byStudent.values()]
      .filter(row => matchesText(row.name, filter))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [report, filter]);
  const total = (report?.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const payments = (report?.payments ?? []).filter(payment => matchesText(payment.studentName, filter));

  async function remove(payment: SubscriptionPayment) {
    setBusy(true);
    try {
      await api(`/subscriptions/payments/${payment.id}`, { method: 'DELETE' });
      setRemoving(null);
      onToast('تم حذف الاشتراك وخصمه من خزينة الاتحاد.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف الاشتراك.');
    } finally {
      setBusy(false);
    }
  }

  /** Downloads the Excel file through an authenticated request, so it works with either sign-in mode. */
  async function exportExcel() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        cycleId ? `/api/subscriptions/export?cycleId=${cycleId}` : '/api/subscriptions/export',
        {
          headers: await getAuthHeaders(),
        },
      );
      if (!response.ok) throw new Error((await response.json()).message);
      const url = URL.createObjectURL(await response.blob());
      const match = (response.headers.get('content-disposition') || '').match(/filename\*=UTF-8''([^;]+)/i);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = match ? decodeURIComponent(match[1]) : 'subscriptions.xlsx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تصدير الملف.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="الاشتراكات"
        description="اشتراكات الطلاب لكل ربع. كل اشتراك يُضاف تلقائيًا إلى خزينة الاتحاد."
        action={
          <div className="detail-actions">
            <button className="button secondary" onClick={() => void exportExcel()} disabled={busy || !report}>
              <Download size={18} />
              تصدير Excel
            </button>
            {mayEdit && (
              <button className="button primary" onClick={() => setAdding(true)}>
                <Plus size={18} />
                تسجيل اشتراك
              </button>
            )}
          </div>
        }
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!report && !error && (
        <div className="table-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          جارٍ تحميل الاشتراكات…
        </div>
      )}
      {report && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>الطلاب المشتركون</h2>
                <p>
                  {number(rows.length)} طالب · إجمالي المحصَّل {money(total)}
                </p>
              </div>
              <label className="table-search">
                <Search size={17} />
                <input
                  aria-label="بحث عن طالب"
                  placeholder="ابحث باسم الطالب…"
                  value={filter}
                  onChange={event => setFilter(event.target.value)}
                />
              </label>
            </div>
            {!rows.length && <Empty title="لا توجد اشتراكات" text="لم يُسجَّل أي اشتراك في هذا العام بعد." />}
            {rows.length > 0 && (
              <div className="table-scroll">
                <table className="document-table">
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      {QUARTER_LABELS.map(label => (
                        <th key={label}>{label}</th>
                      ))}
                      <th>إجمالي المدفوع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        {[1, 2, 3, 4].map(quarter => (
                          <td key={quarter}>
                            {row.quarters.has(quarter) ? (
                              <span className="status success" title="مدفوع">
                                <Check size={14} />
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        ))}
                        <td dir="ltr">{money(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>سجل الدفعات</h2>
                <p>من الأحدث إلى الأقدم.</p>
              </div>
            </div>
            {!payments.length && <Empty title="لا توجد دفعات" text="لا توجد دفعات مطابقة." />}
            {payments.length > 0 && (
              <div className="table-scroll">
                <table className="document-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الطالب</th>
                      <th>الأرباع</th>
                      <th>المبلغ</th>
                      <th>سجّلها</th>
                      <th>
                        <span className="sr-only">حذف</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(payment => (
                      <tr key={payment.id}>
                        <td dir="ltr">{payment.paidAt}</td>
                        <td>{payment.studentName}</td>
                        <td>{quarterNames(payment.quarters)}</td>
                        <td dir="ltr">{money(payment.amount)}</td>
                        <td>{payment.createdByName}</td>
                        <td>
                          {mayEdit &&
                            (removing === payment.id ? (
                              <button
                                className="button danger-solid"
                                disabled={busy}
                                onClick={() => void remove(payment)}
                              >
                                تأكيد الحذف
                              </button>
                            ) : (
                              <button
                                className="icon-button danger-icon"
                                aria-label="حذف الدفعة"
                                title="حذف الدفعة"
                                onClick={() => setRemoving(payment.id)}
                              >
                                <Trash2 size={17} />
                              </button>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {adding && report && (
        <PaymentForm
          students={report.students}
          payments={report.payments}
          onClose={() => setAdding(false)}
          onSaved={async message => {
            setAdding(false);
            onToast(message);
            await load();
          }}
        />
      )}
    </>
  );
}
