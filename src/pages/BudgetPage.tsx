import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Eye, LoaderCircle, Minus, Paperclip, Plus, Trash2 } from 'lucide-react';
import { Empty } from '../components/ui/Empty';
import { PageHeading } from '../components/ui/PageHeading';
import { TransactionForm } from '../features/budget/TransactionForm';
import { api } from '../lib/api';
import { getAuthHeaders, getAuthSettings } from '../lib/auth';
import {
  canManageBudget,
  FUND_IDS,
  FUNDS,
  money,
  type BudgetReport,
  type BudgetTransaction,
  type Fund,
  type TransactionKind,
} from '../lib/budget';
import type { User } from '../types';

type Props = { user: User; cycleId: number | null; onToast: (message: string) => void };

/**
 * The union's two budgets for the year being browsed. The financial officer adds or subtracts money (with an optional
 * receipt); everyone else who may open this page, the developer included, only looks.
 */
export function BudgetPage({ user, cycleId, onToast }: Props) {
  const [report, setReport] = useState<BudgetReport | null>(null);
  const [error, setError] = useState('');
  const [fund, setFund] = useState<Fund>('union');
  const [adding, setAdding] = useState<TransactionKind | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const mayEdit = canManageBudget(user) && !!report?.isCurrent;

  const load = useCallback(async () => {
    try {
      setReport(await api<BudgetReport>(cycleId ? `/budget?cycleId=${cycleId}` : '/budget'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل الميزانية.');
    }
  }, [cycleId]);
  useEffect(() => {
    setReport(null);
    void load();
  }, [load]);

  async function remove(transaction: BudgetTransaction) {
    setBusy(true);
    try {
      await api(`/budget/transactions/${transaction.id}`, { method: 'DELETE' });
      setRemoving(null);
      onToast('تم حذف الحركة.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف الحركة.');
    } finally {
      setBusy(false);
    }
  }

  /** Receipts are served by the API only to people who may see the budget, so they open through a request. */
  async function openAttachment(transaction: BudgetTransaction, mode: 'view' | 'download') {
    const url = `/api/budget/transactions/${transaction.id}/${mode}`;
    // Cookie sign-in: the new tab loads the file straight from the server.
    if ((await getAuthSettings()).provider === 'legacy') {
      window.open(url, '_blank');
      return;
    }
    const tab = mode === 'view' ? window.open('', '_blank') : null;
    try {
      const response = await fetch(url, { headers: await getAuthHeaders() });
      if (!response.ok) throw new Error((await response.json()).message);
      const blobUrl = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = blobUrl;
      else {
        const link = window.document.createElement('a');
        link.href = blobUrl;
        link.download = `مرفق-${transaction.txDate}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'تعذر فتح المرفق.');
    }
  }

  const summary = report?.funds.find(item => item.fund === fund);
  const rows = report?.transactions.filter(item => item.fund === fund) ?? [];
  // Deleting a line changes the balance: spell out by how much before the financial officer confirms.
  const pending = rows.find(item => item.id === removing);
  const balanceAfter =
    pending && summary
      ? Math.round((summary.balance + (pending.kind === 'income' ? -pending.amount : pending.amount)) * 100) / 100
      : 0;

  return (
    <>
      <PageHeading
        title="الميزانية"
        description={
          report
            ? `ميزانيتا الاتحاد في عام ${report.cycleName}. يراها الرئيس والأمين العام والمسؤول المالي ولجنة الرقابة فقط.`
            : 'ميزانيتا الاتحاد.'
        }
        action={
          mayEdit && (
            <div className="detail-actions">
              <button className="button primary" onClick={() => setAdding('income')}>
                <Plus size={18} />
                إضافة مبلغ
              </button>
              <button className="button secondary" onClick={() => setAdding('expense')}>
                <Minus size={18} />
                خصم مبلغ
              </button>
            </div>
          )
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
          جارٍ تحميل الميزانية…
        </div>
      )}
      {report && (
        <>
          <div className="segmented" role="tablist">
            {FUND_IDS.map(id => {
              const item = report.funds.find(entry => entry.fund === id);
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={fund === id}
                  className={fund === id ? 'active' : ''}
                  onClick={() => setFund(id)}
                >
                  {FUNDS[id]} {item && <b>{money(item.balance)}</b>}
                </button>
              );
            })}
          </div>
          {summary && (
            <div className="stats-grid">
              {[
                { icon: Paperclip, className: 'blue', value: summary.opening, label: 'الرصيد الافتتاحي' },
                { icon: ArrowUpCircle, className: 'green', value: summary.income, label: 'إجمالي الدخل' },
                { icon: ArrowDownCircle, className: 'red', value: summary.expense, label: 'إجمالي المصروف' },
                { icon: Eye, className: 'amber', value: summary.balance, label: 'الرصيد المتبقي' },
              ].map(tile => (
                <div className="stat" key={tile.label}>
                  <span className={`stat-icon ${tile.className}`}>
                    <tile.icon size={20} />
                  </span>
                  <span className="stat-value money-value">{money(tile.value)}</span>
                  <strong>{tile.label}</strong>
                  <small>{FUNDS[fund]}</small>
                </div>
              ))}
            </div>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>حركات {FUNDS[fund]}</h2>
                <p>من الأحدث إلى الأقدم، مع تاريخ كل حركة.</p>
              </div>
            </div>
            {pending && summary && (
              <div className="delete-confirm" role="alert">
                <strong>هل تريد حذف هذه الحركة؟</strong>
                <p>
                  {pending.kind === 'income'
                    ? `سيُخصم ${money(pending.amount)} من ${FUNDS[pending.fund]} لأنه دخل مسجَّل (${pending.category}).`
                    : `سيُعاد ${money(pending.amount)} إلى ${FUNDS[pending.fund]} لأنه مصروف مسجَّل (${pending.category}).`}{' '}
                  سيتغيّر الرصيد المتبقي من {money(summary.balance)} إلى {money(balanceAfter)}.
                </p>
                <button className="button danger-solid" disabled={busy} onClick={() => void remove(pending)}>
                  نعم، احذف الحركة
                </button>
                <button className="button secondary" disabled={busy} onClick={() => setRemoving(null)}>
                  تراجع
                </button>
              </div>
            )}
            {!rows.length && <Empty title="لا توجد حركات" text="لم تُسجَّل أي حركة في هذه الميزانية بعد." />}
            {rows.length > 0 && (
              <div className="table-scroll">
                <table className="document-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>النوع</th>
                      <th>التصنيف</th>
                      <th>المبلغ</th>
                      <th>ملاحظة</th>
                      <th>سجّلها</th>
                      <th>
                        <span className="sr-only">المرفق</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(item => (
                      <tr key={item.id}>
                        <td>
                          <span dir="ltr">{item.txDate}</span>
                        </td>
                        <td>
                          <span className={`status ${item.kind === 'income' ? 'success' : 'danger'}`}>
                            {item.kind === 'income' ? 'دخل' : 'مصروف'}
                          </span>
                        </td>
                        <td>
                          {item.category}
                          {item.fromSubscription && (
                            <span className="tag" style={{ marginInlineStart: 8 }}>
                              من الاشتراكات
                            </span>
                          )}
                        </td>
                        <td dir="ltr">
                          {item.kind === 'income' ? '+' : '−'} {money(item.amount)}
                        </td>
                        <td>{item.description || '—'}</td>
                        <td>{item.createdByName}</td>
                        <td>
                          <div className="detail-actions">
                            {item.hasAttachment && (
                              <>
                                <button
                                  className="icon-button"
                                  aria-label="عرض المرفق"
                                  title="عرض المرفق"
                                  onClick={() => void openAttachment(item, 'view')}
                                >
                                  <Eye size={17} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label="تنزيل المرفق"
                                  title="تنزيل المرفق"
                                  onClick={() => void openAttachment(item, 'download')}
                                >
                                  <Paperclip size={17} />
                                </button>
                              </>
                            )}
                            {mayEdit && !item.fromSubscription && (
                              <button
                                className="icon-button danger-icon"
                                aria-label="حذف الحركة"
                                title="حذف الحركة"
                                onClick={() => setRemoving(item.id)}
                              >
                                <Trash2 size={17} />
                              </button>
                            )}
                          </div>
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
      {adding && (
        <TransactionForm
          fund={fund}
          kind={adding}
          onClose={() => setAdding(null)}
          onSaved={async message => {
            setAdding(null);
            onToast(message);
            await load();
          }}
        />
      )}
    </>
  );
}
