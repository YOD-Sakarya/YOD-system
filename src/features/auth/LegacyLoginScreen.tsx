import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpLeft, ClipboardCheck, Eye, EyeOff, Files, LoaderCircle, Vote } from 'lucide-react';
import { Brand } from '../../components/ui/Brand';
import { api, json } from '../../lib/api';
import type { User } from '../../types';

/** Username/password sign-in and observer registration against the Express API. */
export function LegacyLoginScreen({
  onLogin,
  onPreview,
  error: initialError,
}: {
  onLogin: (u: User) => void;
  onPreview: () => void;
  error: string;
}) {
  const [register, setRegister] = useState(false),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError),
    [notice, setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (register) {
        await api('/auth/register', { method: 'POST', body: json(fields) });
        setRegister(false);
        setNotice('تم إنشاء حسابك بدور مراقب. سجّل الدخول للمتابعة.');
      } else onLogin(await api<User>('/auth/login', { method: 'POST', body: json(fields) }));
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
          <h1>{register ? 'لنبدأ العمل معًا.' : 'مرحبًا بعودتك.'}</h1>
          <p>{register ? 'أنشئ حساب مراقب لمتابعة أعمال الاتحاد.' : 'كل ما تحتاجه لخدمة طلابنا، في مساحة واحدة.'}</p>
          <form key={String(register)} onSubmit={submit} className="form-stack">
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="form-notice">
                {notice}
              </div>
            )}
            {register && (
              <label>
                الاسم الكامل
                <input name="fullName" autoComplete="name" required minLength={3} maxLength={150} />
              </label>
            )}
            <label>
              اسم المستخدم
              <input
                name="username"
                autoComplete="username"
                required
                minLength={register ? 3 : 1}
                maxLength={100}
                placeholder="أدخل اسم المستخدم"
              />
            </label>
            {register && (
              <div className="form-grid">
                <label>
                  البريد الإلكتروني
                  <input name="email" type="email" autoComplete="email" required dir="ltr" />
                </label>
                <label>
                  رقم الواتساب
                  <input name="phoneWhatsapp" type="tel" autoComplete="tel" maxLength={30} dir="ltr" />
                </label>
              </div>
            )}
            <label>
              كلمة المرور
              <div className="password-input">
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  required
                  minLength={register ? 10 : 1}
                  maxLength={256}
                  placeholder={register ? '١٠ أحرف على الأقل' : 'أدخل كلمة المرور'}
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
              {register ? 'إنشاء حساب' : 'تسجيل الدخول'}
            </button>
          </form>
          <p className="login-switch">
            {register ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
                setNotice('');
              }}
            >
              {register ? 'تسجيل الدخول' : 'إنشاء حساب مراقب'}
            </button>
          </p>
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
