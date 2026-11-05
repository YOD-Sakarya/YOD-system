import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { Empty } from '../../components/ui/Empty';
import { api } from '../../lib/api';
import type { AuditLog } from '../../types';

/** Event families the developer can filter by (the server matches `family` and `family.*`). */
const families = [
  { id: '', label: 'كل الأحداث' },
  { id: 'auth', label: 'تسجيل الدخول' },
  { id: 'account', label: 'الحساب الشخصي' },
  { id: 'user', label: 'إدارة المستخدمين' },
  { id: 'document', label: 'المستندات' },
  { id: 'review', label: 'المراجعات' },
  { id: 'vote', label: 'التصويت' },
  { id: 'budget', label: 'الميزانية' },
  { id: 'subscription', label: 'الاشتراكات' },
  { id: 'cycle', label: 'الأعوام' },
];
const labels: Record<string, string> = {
  'auth.login': 'دخول',
  'auth.login_failed': 'دخول فاشل',
  'account.password': 'تغيير كلمة المرور',
  'account.email': 'تغيير البريد',
  'account.username': 'تغيير اسم المستخدم',
  'user.create': 'إنشاء مستخدم',
  'user.update': 'تعديل مستخدم',
  'user.reset_password': 'إعادة تعيين كلمة المرور',
  'document.create': 'رفع مستند',
  'document.update': 'تعديل مستند',
  'document.delete': 'حذف مستند',
  'document.view': 'عرض مستند',
  'document.download': 'تنزيل مستند',
  'review.submit': 'مراجعة',
  'vote.create': 'إنشاء جلسة',
  'vote.cast': 'تصويت',
  'vote.close': 'إغلاق جلسة',
  'vote.delete': 'حذف جلسة',
  'budget.add': 'إضافة مالية',
  'budget.delete': 'حذف حركة مالية',
  'budget.attachment': 'مرفق مالي',
  'subscription.add': 'تسجيل اشتراك',
  'subscription.delete': 'حذف اشتراك',
  'cycle.create': 'بدء عام',
  'cycle.delete': 'حذف عام',
};
/** Destructive or suspicious events are highlighted so they stand out in a long list. */
const alerts = new Set([
  'auth.login_failed',
  'document.delete',
  'vote.delete',
  'cycle.delete',
  'budget.delete',
  'subscription.delete',
]);
const stamp = (value: string) =>
  new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'arab' }).format(
    new Date(value),
  );
const PAGE = 50;

/** Activity log: who did what and when, newest first, with filters and "load more". */
export function LogsPanel() {
  const [items, setItems] = useState<AuditLog[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [family, setFamily] = useState('');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(
    async (before?: number) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ limit: String(PAGE) });
        if (before) params.set('before', String(before));
        if (family) params.set('action', family);
        if (search) params.set('q', search);
        const page = await api<{ items: AuditLog[]; hasMore: boolean }>(`/logs?${params}`);
        setItems(current => (before && current ? [...current, ...page.items] : page.items));
        setHasMore(page.hasMore);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذر تحميل السجل.');
      } finally {
        setLoading(false);
      }
    },
    [family, search],
  );
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>سجل النشاط</h2>
          <p>
            من فعل ماذا ومتى، من الأحدث إلى الأقدم. يُحذف السجل تلقائيًا بعد أسبوع، ولا تُسجَّل كلمات المرور ولا
            اختيارات المصوّتين.
          </p>
        </div>
        <label className="table-search">
          <Search size={17} />
          <input
            aria-label="بحث في السجل"
            placeholder="ابحث بالاسم أو النص…"
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => event.key === 'Enter' && setSearch(text.trim())}
            onBlur={() => setSearch(text.trim())}
          />
        </label>
        <select aria-label="نوع الحدث" value={family} onChange={event => setFamily(event.target.value)}>
          {families.map(item => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button className="button secondary" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle size={17} className="spin" /> : <RefreshCw size={17} />}
          تحديث
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!items && !error && (
        <div className="table-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          جارٍ تحميل السجل…
        </div>
      )}
      {items && !items.length && <Empty title="لا توجد أحداث" text="لا توجد سجلات مطابقة للتصفية الحالية." />}
      {items && items.length > 0 && (
        <div className="table-scroll">
          <table className="document-table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المستخدم</th>
                <th>الحدث</th>
                <th>التفاصيل</th>
                <th>العنوان</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>{stamp(item.createdAt)}</td>
                  <td>
                    <strong>{item.actorName}</strong>
                    {item.actorRole && <small style={{ display: 'block' }}>{item.actorRole}</small>}
                  </td>
                  <td>
                    <span className={`tag ${alerts.has(item.action) ? 'red' : ''}`}>
                      {labels[item.action] ?? item.action}
                    </span>
                  </td>
                  <td>{item.summary}</td>
                  <td dir="ltr">{item.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && items && (
        <button className="button secondary" disabled={loading} onClick={() => void load(items[items.length - 1].id)}>
          {loading ? <LoaderCircle size={17} className="spin" /> : null}
          عرض المزيد
        </button>
      )}
    </section>
  );
}
