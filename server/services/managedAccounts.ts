import { config } from '../config.js';
import { HttpError } from '../http/errors.js';
import { query } from '../db.js';
import { credentialFingerprint } from '../security.js';

export type ManagedAccounts = {
  provision: (email: string, name: string) => Promise<{ subject: string; marker: string }>;
  remove: (subject: string) => Promise<void>;
  sendActivation: (email: string) => Promise<void>;
};

/** Uses the official management API for identities; passwords are chosen by members through Neon OTP. */
export function createManagedAccounts(databaseQuery = query, request: typeof fetch = fetch): ManagedAccounts {
  function managementUrl(subject?: string) {
    if (!config.neonApiKey || !config.neonProjectId || !config.neonBranchId)
      throw new HttpError(503, 'يلزم إعداد NEON_API_KEY وNEON_PROJECT_ID وNEON_BRANCH_ID لإدارة حسابات الدخول.');
    return `https://console.neon.tech/api/v2/projects/${encodeURIComponent(config.neonProjectId)}/branches/${encodeURIComponent(config.neonBranchId)}/auth/users${subject ? '/' + encodeURIComponent(subject) : ''}`;
  }
  async function management(method: 'POST' | 'DELETE', subject?: string, body?: unknown) {
    const url = managementUrl(subject);
    try {
      const response = await request(url, {
        method,
        headers: { Authorization: `Bearer ${config.neonApiKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12000),
      });
      if (method === 'DELETE' && response.status === 404) return null;
      if (!response.ok) throw new Error();
      return method === 'DELETE' || response.status === 204 ? null : await response.json();
    } catch {
      throw new HttpError(502, 'تعذر تحديث حساب الدخول لدى Neon. تحقق من إعدادات الخدمة وحاول مجددًا.');
    }
  }
  return {
    async provision(email, name) {
      // Check configuration even for an existing identity: replacement also needs deletion access.
      managementUrl();
      const [existing] = await databaseQuery('SELECT id FROM neon_auth."user" WHERE lower(email)=lower($1)', [email]);
      let subject = existing?.id;
      if (subject) {
        const revoked = await databaseQuery('SELECT 1 FROM "AuthRevocations" WHERE "Provider"=$1 AND "Subject"=$2', [
          `neon:${config.neonAuthUrl}`,
          subject,
        ]);
        if (revoked.length) {
          await management('DELETE', subject);
          subject = undefined;
        }
      }
      subject ||= (await management('POST', undefined, { email, name }))?.id;
      if (typeof subject !== 'string' || !subject) throw new HttpError(502, 'تعذر إنشاء هوية الدخول. حاول مجددًا.');
      const [credential] = await databaseQuery(
        'SELECT password FROM neon_auth.account WHERE "userId"=$1 AND "providerId"=$2',
        [subject, 'credential'],
      );
      return { subject, marker: '!neon-temporary:' + credentialFingerprint(credential?.password || '') };
    },
    async remove(subject) {
      await management('DELETE', subject);
    },
    async sendActivation(email) {
      try {
        const response = await request(config.neonAuthUrl + '/email-otp/request-password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: config.origin },
          body: JSON.stringify({ email }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error();
      } catch {
        throw new HttpError(502, 'تعذر إرسال رمز التفعيل. أعد الإرسال من إدارة المستخدمين.');
      }
    },
  };
}
