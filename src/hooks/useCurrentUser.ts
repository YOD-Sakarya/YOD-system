import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { User } from '../types';

/** Restores the signed-in user from the server session on first load. */
export function useCurrentUser(onError: (message: string) => void) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (window.location.pathname.startsWith('/auth/')) {
      setChecking(false);
      return;
    }
    let active = true;
    api<User>('/auth/me')
      .then(current => {
        if (active) setUser(current);
      })
      .catch(error => {
        const unauthenticated = error instanceof ApiError && error.status === 401;
        if (active && !unauthenticated)
          onError(error instanceof Error ? error.message : 'تعذر الاتصال بالخادم. تأكد من تشغيله وحاول مجددًا.');
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [onError]);
  return { user, setUser, checking };
}
