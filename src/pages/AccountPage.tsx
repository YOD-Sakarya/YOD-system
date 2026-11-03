import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, LoaderCircle } from 'lucide-react';
import { PageHeading } from '../components/ui/PageHeading';
import { api, json } from '../lib/api';

type Profile = {
  fullName: string;
  username: string;
  email: string;
  phoneWhatsapp: string;
  canChangeCredentials: boolean;
};
type Feedback = { kind: 'ok' | 'error'; text: string } | null;

/** One small form: runs `send`, shows the outcome, and clears the password fields on success. */
function useAccountForm(send: (values: Record<string, FormDataEntryValue>) => Promise<string>) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setFeedback(null);
    try {
      const text = await send(Object.fromEntries(new FormData(form)));
      setFeedback({ kind: 'ok', text });
      form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach(input => (input.value = ''));
    } catch (e) {
      setFeedback({ kind: 'error', text: e instanceof Error ? e.message : 'تعذر حفظ التغيير.' });
    } finally {
      setBusy(false);
    }
  }
  return { busy, feedback, submit };
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.kind === 'ok' ? (
    <p role="status" className="form-notice">
      {feedback.text}
    </p>
  ) : (
    <p role="alert" className="form-error">
      {feedback.text}
    </p>
  );
}

/** Every user can change their own username, email and password here (the role is managed by the developer). */
export function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const { hash } = useLocation();

  useEffect(() => {
    api<Profile>('/account')
      .then(setProfile)
      .catch(e => setError(e instanceof Error ? e.message : 'تعذر تحميل الحساب.'));
  }, []);

  // Search results can open this page at a section (#email, #password): scroll there once the forms exist.
  useEffect(() => {
    if (profile && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [profile, hash]);

  const emailForm = useAccountForm(async values => {
    const result = await api<{ message: string; email: string }>('/account/email', {
      method: 'PUT',
      body: json(values),
    });
    setProfile(current => (current ? { ...current, email: result.email } : current));
    return result.message;
  });
  const usernameForm = useAccountForm(async values => {
    const result = await api<{ message: string; username: string }>('/account/username', {
      method: 'PUT',
      body: json(values),
    });
    setProfile(current => (current ? { ...current, username: result.username } : current));
    return result.message;
  });
  const passwordForm = useAccountForm(async values => {
    if (values.newPassword !== values.confirmPassword) throw new Error('كلمتا المرور الجديدتان غير متطابقتين.');
    const result = await api<{ message: string }>('/account/password', {
      method: 'PUT',
      body: json({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    });
    return result.message;
  });

  return (
    <>
      <PageHeading title="حسابي" description="غيّر اسم المستخدم أو البريد الإلكتروني أو كلمة المرور متى شئت." />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!profile && !error && (
        <div className="table-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          جارٍ تحميل حسابك…
        </div>
      )}
      {profile && (
        <div className="account-grid">
          <section className="panel account-card">
            <h2>{profile.fullName}</h2>
            <dl className="details-grid">
              <div>
                <dt>اسم المستخدم</dt>
                <dd dir="ltr">{profile.username}</dd>
              </div>
              <div>
                <dt>البريد الإلكتروني</dt>
                <dd dir="ltr">{profile.email}</dd>
              </div>
            </dl>
            <p className="muted small-text">يمكنك تسجيل الدخول باسم المستخدم أو بالبريد الإلكتروني.</p>
          </section>

          {!profile.canChangeCredentials ? (
            <section className="panel account-card">
              <p className="form-notice">
                تُدار كلمة المرور والبريد عبر خدمة تسجيل الدخول. لتغيير كلمة المرور استخدم «نسيت كلمة المرور» في صفحة
                الدخول.
              </p>
            </section>
          ) : (
            <>
              <section className="panel account-card" id="username">
                <h2>تغيير اسم المستخدم</h2>
                <form className="form-stack" onSubmit={usernameForm.submit}>
                  <FeedbackLine feedback={usernameForm.feedback} />
                  <label>
                    اسم المستخدم الجديد
                    <input
                      name="username"
                      required
                      minLength={3}
                      maxLength={100}
                      pattern="[\p{L}\p{N}._\-]+"
                      defaultValue={profile.username}
                      dir="ltr"
                      autoComplete="username"
                    />
                  </label>
                  <p className="muted small-text">
                    أحرف وأرقام و . _ - فقط، بدون مسافات أو @. مستنداتك وأصواتك تبقى كما هي.
                  </p>
                  <label>
                    كلمة المرور الحالية
                    <input name="currentPassword" type="password" required autoComplete="current-password" />
                  </label>
                  <button className="button primary" disabled={usernameForm.busy}>
                    {usernameForm.busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
                    حفظ اسم المستخدم
                  </button>
                </form>
              </section>

              <section className="panel account-card" id="email">
                <h2>تغيير البريد الإلكتروني</h2>
                <form className="form-stack" onSubmit={emailForm.submit}>
                  <FeedbackLine feedback={emailForm.feedback} />
                  <label>
                    البريد الإلكتروني الجديد
                    <input name="email" type="email" required maxLength={254} defaultValue={profile.email} dir="ltr" />
                  </label>
                  <label>
                    كلمة المرور الحالية
                    <input name="currentPassword" type="password" required autoComplete="current-password" />
                  </label>
                  <button className="button primary" disabled={emailForm.busy}>
                    {emailForm.busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
                    حفظ البريد
                  </button>
                </form>
              </section>

              <section className="panel account-card" id="password">
                <h2>تغيير كلمة المرور</h2>
                <form className="form-stack" onSubmit={passwordForm.submit}>
                  <FeedbackLine feedback={passwordForm.feedback} />
                  <label>
                    كلمة المرور الحالية
                    <input name="currentPassword" type="password" required autoComplete="current-password" />
                  </label>
                  <label>
                    كلمة المرور الجديدة
                    <input
                      name="newPassword"
                      type="password"
                      required
                      minLength={10}
                      maxLength={256}
                      autoComplete="new-password"
                      placeholder="١٠ أحرف على الأقل"
                    />
                  </label>
                  <label>
                    تأكيد كلمة المرور الجديدة
                    <input
                      name="confirmPassword"
                      type="password"
                      required
                      minLength={10}
                      maxLength={256}
                      autoComplete="new-password"
                    />
                  </label>
                  <p className="muted small-text">
                    بعد التغيير تنتهي جلساتك على الأجهزة الأخرى وتبقى هذه الجلسة مفتوحة.
                  </p>
                  <button className="button primary" disabled={passwordForm.busy}>
                    {passwordForm.busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
                    حفظ كلمة المرور
                  </button>
                </form>
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
