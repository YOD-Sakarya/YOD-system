import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export type Actor = { userId: number; roleId: number; fullName: string; roleName: string };
/** The developer administers the whole system: users, cycles, deletions and storage. */
export const DEVELOPER_ROLE_ID = 11;
export const isDeveloper = (user: Actor) => user.roleId === DEVELOPER_ROLE_ID;
/** Only these roles' reviews count towards a proposal's outcome. */
export const canReview = (user: Actor) => [1, 3, 4].includes(user.roleId);
export const canManageVotes = (user: Actor) => [1, 3].includes(user.roleId) || isDeveloper(user);
export const canEditDocument = (user: Actor, ownerId: number) =>
  user.userId === ownerId || canReview(user) || isDeveloper(user);
/** Deleting documents and vote sessions is reserved for the developer. */
export const canDelete = isDeveloper;
/**
 * Fingerprint of a stored password hash. It is embedded in session cookies, so changing a user's
 * password (for example when the seat is handed to a new person) signs out every existing session.
 */
export const sessionVersion = (passwordHash: string) =>
  createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
export function reviewStatus(reviews: { role: number; decision: string }[]) {
  if (![1, 3, 4].every(role => reviews.some(review => review.role === role))) return 'قيد المراجعة';
  return reviews.filter(review => [1, 3, 4].includes(review.role)).every(review => review.decision === 'مقبول')
    ? 'مقبول'
    : 'مرفوض';
}
export function voteDecision(options: { text: string; count: number }[]) {
  const ranked = [...options].sort((a, b) => b.count - a.count);
  if (!ranked[0]?.count) return 'لا يوجد قرار';
  return ranked[0].count === ranked[1]?.count ? 'تعادل' : ranked[0].text;
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  if (stored.startsWith('scrypt:')) {
    const [, salt, hash] = stored.split(':');
    if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
    return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
  }
  // Transitional support for legacy ASP.NET accounts; no remote data is rewritten at login.
  const actual = Buffer.from(password),
    expected = Buffer.from(stored);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
