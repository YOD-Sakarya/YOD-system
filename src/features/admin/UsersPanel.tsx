import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { LoaderCircle, Mail, Pencil, Plus, Search } from 'lucide-react';
import { Empty } from '../../components/ui/Empty';
import { api } from '../../lib/api';
import { getAuthSettings } from '../../lib/auth';
import { number } from '../../lib/format';
import { emailProblemLabel, emailProblems } from '../../lib/emails';
import { matchesText } from '../../lib/search';
import type { Catalog, ManagedUser } from '../../types';
import { UserForm } from './UserForm';

/** All accounts with their role and document count; the developer adds users or hands a seat to someone new. */
export function UsersPanel({ roles }: { roles: Catalog['roles'] }) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [managedLogin, setManagedLogin] = useState(false);
  const [inviting, setInviting] = useState(false);
  // The workspace search opens this tab with ?q=<name>.
  const [params] = useSearchParams();
  const location = useLocation();
  const [filter, setFilter] = useState(params.get('q') ?? '');
  // `null` closed, `'new'` creating, otherwise the account being edited.
  const [editing, setEditing] = useState<ManagedUser | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api<ManagedUser[]>('/users'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل المستخدمين.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // The invitation button only makes sense when members sign in through Better Auth.
  useEffect(() => {
    getAuthSettings()
      .then(settings => setManagedLogin(settings.provider === 'neon'))
      .catch(() => setManagedLogin(false));
  }, []);

  /** Mails activation codes to seats without a login, a few at a time (press again until none remain). */
  async function invitePending() {
    if (!window.confirm('سيُرسَل رمز التفعيل إلى بريد كل مقعد لم يُفعَّل بعد. هل تريد المتابعة؟')) return;
    setInviting(true);
    setError('');
    try {
      const result = await api<{ message: string; failed: string[]; remaining: number }>('/users/invite-pending', {
        method: 'POST',
      });
      const extra = [
        result.failed.length ? `تعذّر الإرسال إلى: ${result.failed.join('، ')}.` : '',
        result.remaining ? `بقي ${number(result.remaining)} مقعدًا، اضغط الزر مرة أخرى.` : '',
      ];
      setNotice([result.message, ...extra].filter(Boolean).join(' '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إرسال الدعوات.');
    } finally {
      setInviting(false);
    }
  }
  // "Add a user" in the search box links here with ?new=1; location.key changes on every navigation.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('new') === '1') setEditing('new');
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = emailProblems(users || []);
  const visible = (users || []).filter(u =>
    matchesText(`${u.fullName} ${u.username} ${u.email} ${u.roleName}`, filter),
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>المستخدمون</h2>
          <p>أضف مستخدمًا جديدًا أو سلّم المقعد لشخص جديد في أي وقت.</p>
        </div>
        <label className="table-search">
          <Search size={17} />
          <input
            aria-label="تصفية المستخدمين"
            placeholder="ابحث بالاسم أو الدور…"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />
        </label>
        {managedLogin && (
          <button className="button secondary" onClick={invitePending} disabled={inviting}>
            {inviting ? <LoaderCircle size={17} className="spin" /> : <Mail size={17} />}
            إرسال دعوات التفعيل
          </button>
        )}
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={18} />
          إضافة مستخدم
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {problems.size > 0 && (
        <p className="form-notice" role="status">
          {number(problems.size)} من المقاعد تحتاج بريدًا إلكترونيًا حقيقيًا وخاصًا بصاحبها قبل التفعيل عبر Better Auth.
          اضغط تعديل على كل مقعد وأدخل بريد الشخص.
        </p>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {!users && !error && (
        <div className="table-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          جارٍ تحميل المستخدمين…
        </div>
      )}
      {users && !visible.length && <Empty title="لا يوجد مستخدمون" text="لا توجد نتائج مطابقة." />}
      {users && visible.length > 0 && (
        <div className="table-scroll">
          <table className="document-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>اسم المستخدم</th>
                <th>البريد</th>
                <th>الدور</th>
                <th>المستندات</th>
                <th>
                  <span className="sr-only">تعديل</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(u => (
                <tr key={u.userId}>
                  <td>
                    <strong>{u.fullName}</strong>
                  </td>
                  <td dir="ltr">{u.username}</td>
                  <td dir="ltr">
                    {u.email}
                    {problems.has(u.userId) && (
                      <span className="tag red" style={{ marginInlineStart: 8 }}>
                        {emailProblemLabel[problems.get(u.userId)!]}
                      </span>
                    )}
                  </td>
                  <td>{u.roleName}</td>
                  <td>{number(u.documentCount)}</td>
                  <td>
                    <button className="icon-button" aria-label={`تعديل ${u.fullName}`} onClick={() => setEditing(u)}>
                      <Pencil size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={async message => {
            setEditing(null);
            await load();
            setNotice(message || 'تم حفظ المستخدم.');
          }}
        />
      )}
    </section>
  );
}
