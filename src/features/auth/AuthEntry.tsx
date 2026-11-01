import { useEffect, useState, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Brand } from '../../components/ui/Brand';
import { getAuthSettings, type AuthSettings } from '../../lib/auth';
import type { User } from '../../types';
import { NeonAuthScreen } from './NeonAuthScreen';

export type AuthEntryProps = {
  legacy: ReactNode;
  onLogin: (user: User) => void;
  onPreview: () => void;
  initialError?: string;
};
/** Chooses the sign-in screen from the server-advertised auth mode (legacy form or Neon). */
export default function AuthEntry(props: AuthEntryProps) {
  const [settings, setSettings] = useState<AuthSettings | null>(null),
    [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    getAuthSettings()
      .then(s => {
        if (active) setSettings(s);
      })
      .catch(e => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  if (error)
    return (
      <div className="boot">
        <Brand />
        <p role="alert">{error}</p>
        <button className="button primary" onClick={() => setRetry(retry + 1)}>
          إعادة المحاولة
        </button>
        <button className="text-link" onClick={props.onPreview}>
          استكشف التصميم
        </button>
      </div>
    );
  if (!settings)
    return (
      <div className="boot">
        <Brand />
        <LoaderCircle className="spin" />
        <p>جارٍ تجهيز تسجيل الدخول…</p>
      </div>
    );
  return settings.provider === 'legacy' ? (
    props.legacy
  ) : (
    <NeonAuthScreen initialError={props.initialError} onLogin={props.onLogin} onPreview={props.onPreview} />
  );
}
