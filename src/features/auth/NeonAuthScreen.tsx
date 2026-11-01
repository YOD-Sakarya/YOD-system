import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpLeft,
  ClipboardCheck,
  Eye,
  EyeOff,
  Files,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Vote,
} from 'lucide-react';
import { Brand } from '../../components/ui/Brand';
import { api } from '../../lib/api';
import { getNeonAuth } from '../../lib/auth';
import type { User } from '../../types';
import type { AuthEntryProps } from './AuthEntry';

/** Neon auth flows (sign in, sign up, forgot and reset password), selected by the /auth/* route. */
export function NeonAuthScreen({ onLogin, onPreview, initialError }: Omit<AuthEntryProps, 'legacy'>) {
  const location = useLocation(),
    navigate = useNavigate();
  const path = location.pathname;
  const mode =
    path === '/auth/forgot-password'
      ? 'forgot'
      : path === '/auth/reset-password'
        ? 'reset'
        : path === '/auth/sign-up'
          ? 'register'
          : 'login';
  const [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState(() =>
    mode === 'reset' ? new URLSearchParams(location.search).get('token') || '' : '',
  );
  const [linkError, setLinkError] = useState(() =>
    mode === 'reset' ? new URLSearchParams(location.search).get('error') || '' : '',
  );
  useEffect(() => {
    setError(initialError || '');
    setVisible(false);
    const routeNotice = (location.state as { authNotice?: unknown } | null)?.authNotice;
    setNotice(typeof routeNotice === 'string' ? routeNotice : '');
    if (path === '/auth/reset-password') {
      const params = new URLSearchParams(location.search);
      if (params.has('token') || params.has('error')) {
        setResetToken(params.get('token') || '');
        setLinkError(params.get('error') || '');
        // Remove reset credentials from browser history and referrer strings after capture.
        navigate('/auth/reset-password', { replace: true });
      }
    } else {
      setResetToken('');
      setLinkError('');
    }
    if (path === '/auth/verified') {
      if (new URLSearchParams(location.search).has('error'))
        setError('تعذر تأكيد البريد الإلكتروني. قد يكون الرابط منتهي الصلاحية. أعد إرسال رسالة التأكيد أدناه.');
      else setNotice('يمكنك الآن تسجيل الدخول بعد تأكيد بريدك الإلكتروني.');
    }
  }, [path, location.search, location.state, navigate, initialError]);
  const changeMode = (to: string, authNotice?: string) => {
    setError('');
    setNotice('');
    navigate(to, { state: authNotice ? { authNotice } : null });
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const auth = await getNeonAuth();
      if (mode === 'forgot') {
        const result = await auth.requestPasswordReset({
          email: String(values.email),
          redirectTo: `${window.location.origin}/auth/reset-password`,
        });
        if (result.error) throw new Error('تعذر طلب رابط الاستعادة. حاول مجددًا أو تواصل مع مسؤول الاتحاد.');
        setNotice(
          'إذا كان البريد مسجّلًا، فستصلك رسالة برابط استعادة كلمة المرور. تحقق من صندوق الوارد والبريد غير المرغوب فيه.',
        );
      } else if (mode === 'reset') {
        if (!resetToken || linkError) throw new Error('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.');
        if (values.password !== values.confirmPassword) throw new Error('كلمتا المرور غير متطابقتين.');
        const result = await auth.resetPassword({ newPassword: String(values.password), token: resetToken });
        if (result.error)
          throw new Error(
            'تعذر تحديث كلمة المرور. قد يكون الرابط منتهي الصلاحية أو مستخدمًا من قبل. اطلب رابطًا جديدًا.',
          );
        setResetToken('');
        changeMode('/auth/sign-in', 'تم تحديث كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.');
      } else if (mode === 'register') {
        const result = await auth.signUp.email({
          email: String(values.email),
          password: String(values.password),
          name: String(values.fullName),
          callbackURL: `${window.location.origin}/auth/verified`,
        });
        if (result.error)
          throw new Error(
            'تعذر إنشاء الحساب. تحقق من بريدك وكلمة المرور، أو استخدم استعادة كلمة المرور إذا كان لديك حساب.',
          );
        setNotice('تحقق من بريدك الإلكتروني لتأكيد الحساب، ثم سجّل الدخول. يحصل الحساب الجديد على دور مراقب.');
      } else {
        const result = await auth.signIn.email({ email: String(values.email), password: String(values.password) });
        if (result.error)
          throw new Error(
            result.error.code === 'EMAIL_NOT_VERIFIED'
              ? 'يرجى تأكيد بريدك الإلكتروني أولًا. يمكنك إعادة إرسال رسالة التأكيد أدناه.'
              : 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.',
          );
        if (result.data?.user?.emailVerified === false)
          throw new Error('يرجى تأكيد بريدك الإلكتروني أولًا. يمكنك إعادة إرسال رسالة التأكيد أدناه.');
        const user = await api<User>('/auth/me');
        onLogin(user);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الاتصال بخدمة تسجيل الدخول. حاول مجددًا.');
    } finally {
      setBusy(false);
    }
  }
  async function resendVerification() {
    if (!email) {
      setError('أدخل بريدك الإلكتروني أولًا.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await (
        await getNeonAuth()
      ).sendVerificationEmail({ email, callbackURL: `${window.location.origin}/auth/verified` });
      if (result.error) throw new Error();
      setNotice('إذا كان الحساب يحتاج إلى تأكيد، فستصلك رسالة تأكيد البريد الإلكتروني.');
    } catch {
      setError('تعذر إرسال رسالة التأكيد. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    login: 'مرحبًا بعودتك.',
    register: 'لنبدأ العمل معًا.',
    forgot: 'نسيت كلمة المرور؟',
    reset: 'كلمة مرور جديدة.',
  };
  const descriptions = {
    login: 'سجّل الدخول ببريدك الإلكتروني لمتابعة أعمال الاتحاد.',
    register: 'أنشئ حسابك وأكّد بريدك الإلكتروني للمتابعة.',
    forgot: 'أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة.',
    reset: 'اختر كلمة مرور قوية لحماية حسابك.',
  };
  const invalidReset = mode === 'reset' && (!resetToken || !!linkError);
  return (
    <div className="login-page">
      <section className="login-form-side">
        <Brand />
        <div className="login-form-wrap">
          <span className="login-tag">
            <ShieldCheck size={14} />
            حسابك في الاتحاد
          </span>
          <h1>{titles[mode]}</h1>
          <p>{descriptions[mode]}</p>
          <form key={mode} className="form-stack" onSubmit={submit}>
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
            {mode === 'register' && (
              <p className="form-notice">
                إذا كنت عضوًا في الاتحاد، استخدم بريدك المسجّل سابقًا للحفاظ على دورك ومستنداتك بعد تأكيد البريد
                الإلكتروني.
              </p>
            )}
            {invalidReset && (
              <div className="form-error">رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا للمتابعة.</div>
            )}
            {mode === 'register' && (
              <label>
                الاسم الكامل
                <input name="fullName" autoComplete="name" required minLength={3} maxLength={150} />
              </label>
            )}
            {mode !== 'reset' && (
              <label>
                البريد الإلكتروني
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  maxLength={254}
                />
              </label>
            )}
            {mode !== 'forgot' && !invalidReset && (
              <label>
                {mode === 'reset' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}
                <div className="password-input">
                  <input
                    type={visible ? 'text' : 'password'}
                    name="password"
                    required
                    minLength={mode === 'login' ? 1 : 10}
                    maxLength={128}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            )}
            {mode === 'reset' && !invalidReset && (
              <label>
                تأكيد كلمة المرور
                <input
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
            )}
            {!invalidReset && (
              <button className="button primary full" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : mode === 'forgot' ? (
                  <Mail size={18} />
                ) : (
                  <ArrowLeft size={18} />
                )}
                {mode === 'forgot'
                  ? 'إرسال رابط الاستعادة'
                  : mode === 'reset'
                    ? 'حفظ كلمة المرور'
                    : mode === 'register'
                      ? 'إنشاء حساب'
                      : 'تسجيل الدخول'}
              </button>
            )}
          </form>
          {mode === 'login' && (
            <div className="auth-help">
              <button className="text-link" disabled={busy} onClick={() => changeMode('/auth/forgot-password')}>
                نسيت كلمة المرور؟
              </button>
              <button className="text-link" disabled={busy} onClick={resendVerification}>
                إعادة إرسال تأكيد البريد
              </button>
            </div>
          )}
          {mode === 'login' || mode === 'register' ? (
            <p className="login-switch">
              {mode === 'register' ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}
              <button
                disabled={busy}
                onClick={() => changeMode(mode === 'register' ? '/auth/sign-in' : '/auth/sign-up')}
              >
                {mode === 'register' ? 'تسجيل الدخول' : 'إنشاء حساب مراقب'}
              </button>
            </p>
          ) : (
            <p className="login-switch">
              <button disabled={busy} onClick={() => changeMode('/auth/sign-in')}>
                العودة إلى تسجيل الدخول
              </button>
              {mode === 'reset' && (
                <button disabled={busy} onClick={() => changeMode('/auth/forgot-password')}>
                  طلب رابط جديد
                </button>
              )}
            </p>
          )}
          <div className="login-preview">
            <span>ألقِ نظرة على مساحة العمل</span>
            <button disabled={busy} onClick={onPreview}>
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
