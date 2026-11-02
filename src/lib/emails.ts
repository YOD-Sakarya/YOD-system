import type { ManagedUser } from '../types';

/** Same list as the server: documentation/test domains (RFC 2606) can never receive an activation code. */
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$/i;

export type EmailProblem = 'invalid' | 'placeholder' | 'shared';

export const emailProblemLabel: Record<EmailProblem, string> = {
  invalid: 'بريد غير صالح',
  placeholder: 'بريد تجريبي',
  shared: 'بريد مشترك',
};

/** For each seat that cannot be activated by email, why. Shared addresses cannot be linked to one person. */
export function emailProblems(users: ManagedUser[]): Map<number, EmailProblem> {
  const counts = new Map<string, number>();
  for (const u of users) counts.set(u.email.trim().toLowerCase(), (counts.get(u.email.trim().toLowerCase()) ?? 0) + 1);
  const problems = new Map<number, EmailProblem>();
  for (const u of users) {
    const email = u.email.trim().toLowerCase();
    const domain = email.split('@')[1] ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.set(u.userId, 'invalid');
    else if (RESERVED_DOMAIN.test(domain)) problems.set(u.userId, 'placeholder');
    else if ((counts.get(email) ?? 0) > 1) problems.set(u.userId, 'shared');
  }
  return problems;
}
