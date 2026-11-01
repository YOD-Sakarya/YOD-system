import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Pencil, Plus } from 'lucide-react';
import { Empty } from '../../components/ui/Empty';
import { api } from '../../lib/api';
import { number } from '../../lib/format';
import type { Catalog, ManagedUser } from '../../types';
import { UserForm } from './UserForm';

/** All accounts with their role and document count; the developer adds users or hands a seat to someone new. */
export function UsersPanel({ roles, query }: { roles: Catalog['roles']; query: string }) {
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState('');
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

  const visible = (users || []).filter(u =>
    `${u.fullName} ${u.username} ${u.email} ${u.roleName}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>المستخدمون</h2>
          <p>أضف مستخدمًا جديدًا أو سلّم المقعد لشخص جديد في أي وقت.</p>
        </div>
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
                  <td dir="ltr">{u.email}</td>
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
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </section>
  );
}
