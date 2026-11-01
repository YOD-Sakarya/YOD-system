import { useState, type FormEvent } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { api, json } from '../../lib/api';
import type { Catalog, ManagedUser } from '../../types';

type Props = { user: ManagedUser | null; roles: Catalog['roles']; onClose: () => void; onSaved: () => Promise<void> };

/**
 * Create a user or edit one in place. Editing the name/username/email hands the seat to a new person:
 * the account (and its documents) stays, so previous documents will show the new person's name.
 */
export function UserForm({ user, roles, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = { ...values, roleId: Number(values.roleId), password: values.password || undefined };
    try {
      await api(user ? `/users/${user.userId}` : '/users', { method: user ? 'PUT' : 'POST', body: json(body) });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ المستخدم.');
      setBusy(false);
    }
  }

  return (
    <Modal title={user ? 'تعديل المستخدم' : 'إضافة مستخدم'} onClose={onClose} busy={busy}>
      <form className="form-stack modal-body" onSubmit={submit}>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {user && (
          <p className="form-notice">
            عند تسليم المقعد لشخص جديد غيّر الاسم واسم المستخدم والبريد وأدخل كلمة مرور جديدة. تبقى مستندات هذا الحساب
            السابقة محفوظة وتظهر باسم الشخص الجديد.
          </p>
        )}
        <label>
          الاسم الكامل
          <input name="fullName" required minLength={3} maxLength={150} defaultValue={user?.fullName} autoFocus />
        </label>
        <div className="form-grid">
          <label>
            اسم المستخدم
            <input name="username" required minLength={3} maxLength={100} defaultValue={user?.username} dir="ltr" />
          </label>
          <label>
            الدور
            <select name="roleId" defaultValue={user?.roleId ?? 10}>
              {roles.map(role => (
                <option key={role.roleId} value={role.roleId}>
                  {role.roleName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            البريد الإلكتروني
            <input name="email" type="email" required maxLength={254} defaultValue={user?.email} dir="ltr" />
          </label>
          <label>
            رقم الواتساب
            <input name="phoneWhatsapp" type="tel" maxLength={30} defaultValue={user?.phoneWhatsapp} dir="ltr" />
          </label>
        </div>
        <label>
          {user ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور'}
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required={!user}
            minLength={10}
            maxLength={256}
            placeholder="١٠ أحرف على الأقل"
          />
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
