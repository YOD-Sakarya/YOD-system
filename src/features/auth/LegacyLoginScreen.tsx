import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpLeft, ClipboardCheck, Eye, EyeOff, Files, LoaderCircle, Vote } from 'lucide-react';
import { Brand } from '../../components/ui/Brand';
import { api, json } from '../../lib/api';
import type { User } from '../../types';

/** Username/password sign-in. Accounts are created by the developer, so there is no sign-up form. */
export function LegacyLoginScreen({
  onLogin,
  onPreview,
  error: initialError,
}: {
  onLogin: (u: User) => void;
  onPreview: () => void;
  error: string;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      onLogin(await api<User>('/auth/login', { method: 'POST', body: json(fields) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-form-side">
        <Brand />
        <div className="login-form-wrap">
          <span className="login-tag">
            <span />
            مساحة عمل الهيئة التنفيذية
          </span>
          <h1>مرحبًا بعودتك.</h1>
          <p>كل ما تحتاجه لخدمة طلابنا، في مساحة واحدة.</p>
          <form onSubmit={submit} className="form-stack">
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            <label>
              اسم المستخدم
              <input name="username" autoComplete="username" required maxLength={100} placeholder="أدخل اسم المستخدم" />
            </label>
            <label>
              كلمة المرور
              <div className="password-input">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  placeholder="أدخل كلمة المرور"
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <ArrowLeft size={18} />}
              تسجيل الدخول
            </button>
          </form>
          <div className="login-preview">
            <span>ألقِ نظرة على مساحة العمل</span>
            <button onClick={onPreview}>
              استكشف التصميم <ArrowUpLeft size={17} />
            </button>
          </div>
        </div>
        <footer>اتحاد الطلاب اليمنيين في سكاريا</footer>
      </section>
      <section className="login-story">
        <div className="story-lines" aria-hidden="true" />
        <div className="story-content">
          <h2>
            جهودنا تلتقي.
            <br />
            وأثرنا يكبر.
          </h2>
          <p>من الفكرة إلى التنفيذ، نُنظّم عملنا ونوثّق إنجازاتنا ونصنع القرارات معًا.</p>
          <div className="story-features">
            <span>
              <Files size={18} />
              وثائق منظّمة
            </span>
            <span>
              <ClipboardCheck size={18} />
              مراجعات واضحة
            </span>
            <span>
              <Vote size={18} />
              قرارات مشتركة
            </span>
          </div>
        </div>
        <span className="story-bottom">للطلاب، وبالطلاب.</span>
      </section>
    </div>
  );
}
