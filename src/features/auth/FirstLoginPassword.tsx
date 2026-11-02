import { useState, type FormEvent } from 'react';
import { Brand } from '../../components/ui/Brand';
import { getAuthSettings, getNeonAuth } from '../../lib/auth';
import { api, json } from '../../lib/api';
import type { User } from '../../types';

/**
 * A temporary password (issued by the developer) grants access only to this form. In the default login the server stores
 * the new password itself; in Better Auth mode the change goes to Neon and the server verifies it afterwards.
 */
export function FirstLoginPassword({
  onComplete,
  onLogout,
}: {
  onComplete: (user: User) => void;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const currentPassword = String(values.get('currentPassword'));
    const newPassword = String(values.get('newPassword'));
    if (newPassword !== values.get('confirmPassword')) return setError('كلمتا المرور غير متطابقتين.');
    if (currentPassword === newPassword) return setError('اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة.');
    setBusy(true);
    setError('');
    try {
      if ((await getAuthSettings()).provider === 'neon') {
        const result = await (
          await getNeonAuth()
        ).changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
        if (result.error) throw new Error('تعذر تغيير كلمة المرور. تأكد من كلمة المرور المؤقتة وحاول مجددًا.');
      } else {
        await api('/account/password', { method: 'PUT', body: json({ currentPassword, newPassword }) });
      }
      const user = await api<User>('/auth/me');
      if (user.mustChangePassword) throw new Error('لم يكتمل تحديث كلمة المرور. حاول مجددًا.');
      onComplete(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الاتصال بخدمة تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="boot">
      <Brand />
      <h1>تغيير كلمة المرور المؤقتة</h1>
      <p>قبل استخدام مساحة العمل، اختر كلمة مرور جديدة لحسابك.</p>
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          كلمة المرور المؤقتة
          <input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
        </label>
        <label>
          كلمة المرور الجديدة
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
        </label>
        <label>
          تأكيد كلمة المرور
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ ومتابعة'}
        </button>
      </form>
      <button className="text-link" disabled={busy} onClick={() => void onLogout()}>
        تسجيل الخروج
      </button>
    </div>
  );
}
