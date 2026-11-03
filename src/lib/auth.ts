import { createInternalNeonAuth, type VanillaBetterAuthClient } from '@neon/auth';
import { BetterAuthVanillaAdapter } from '@neon/auth/vanilla/adapters';
import { timeoutSignal } from './timeout';

/** Server-advertised sign-in mode: legacy cookie login or Neon managed auth. */
export type AuthSettings = { provider: 'legacy' | 'neon'; authUrl: string | null };
let settingsPromise: Promise<AuthSettings> | undefined;
let client: { adapter: VanillaBetterAuthClient; getJWTToken: () => Promise<string | null> } | undefined;
let tokenPromise: Promise<string | null> | undefined;
/** Fetches and validates the auth settings once; a failed request is not cached so it can be retried. */
export function getAuthSettings(): Promise<AuthSettings> {
  if (!settingsPromise)
    settingsPromise = fetch('/api/auth/config', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: timeoutSignal(15000),
    })
      .then(async response => {
        if (!response.ok) throw new Error('تعذر تحميل إعدادات تسجيل الدخول. تأكد من تشغيل الخادم.');
        const settings = (await response.json()) as AuthSettings | null;
        if (!settings || !['legacy', 'neon'].includes(settings.provider))
          throw new Error('إعدادات تسجيل الدخول غير صالحة.');
        if (settings.provider === 'neon' && !settings.authUrl)
          throw new Error('خدمة تسجيل الدخول غير جاهزة. تواصل مع مسؤول الاتحاد.');
        if (settings.provider === 'neon') {
          const url = new URL(settings.authUrl!);
          if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
            throw new Error('عنوان خدمة تسجيل الدخول غير صالح.');
        }
        return settings;
      })
      .catch(error => {
        settingsPromise = undefined;
        throw error;
      });
  return settingsPromise;
}
/** Lazily creates the Neon auth client (only valid when the server runs in neon mode). */
async function getManagedAuth() {
  const settings = await getAuthSettings();
  if (settings.provider !== 'neon' || !settings.authUrl) throw new Error('تسجيل الدخول عبر Neon غير مفعّل.');
  // This exported SDK constructor retains getJWTToken alongside the Better Auth API.
  // The public createAuthClient() returns only the adapter, whose type has no token() method.
  if (!client)
    client = createInternalNeonAuth(settings.authUrl, {
      adapter: BetterAuthVanillaAdapter({ fetchOptions: { credentials: 'include' } }),
    });
  return client;
}
/** Better Auth client used by the sign-in, sign-up and password-reset screens. */
export async function getNeonAuth() {
  return (await getManagedAuth()).adapter;
}
/** Bearer header for API calls in neon mode; empty in legacy mode where the session cookie is used. */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const settings = await getAuthSettings();
  if (settings.provider !== 'neon') return {};
  const auth = await getManagedAuth();
  tokenPromise ||= auth.getJWTToken().finally(() => {
    tokenPromise = undefined;
  });
  const token = await tokenPromise;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
/** Ends the Neon session (no-op in legacy mode). */
export async function signOutNeon() {
  if ((await getAuthSettings()).provider !== 'neon') return;
  const result = await (await getNeonAuth()).signOut();
  if (result.error) throw new Error('تعذر تسجيل الخروج من Neon. حاول مجددًا.');
}

/**
 * Asks the server to send an activation code to the seat that owns this email. The server creates the member's
 * Better Auth login first when it does not exist yet, and answers the same way for every address.
 */
export async function requestActivation(email: string) {
  let response: Response;
  try {
    response = await fetch('/api/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: email.trim() }),
      signal: timeoutSignal(30000),
    });
  } catch {
    throw new Error('تعذر الاتصال بالخادم. حاول مرة أخرى.');
  }
  if (response.status === 429) throw new Error('محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.');
  if (!response.ok) throw new Error('تعذر إرسال رمز التفعيل. حاول مجددًا.');
}
