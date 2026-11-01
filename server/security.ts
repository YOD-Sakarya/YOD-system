import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export type Actor = { userId: number; roleId: number; fullName: string; roleName: string };
export const canReview = (user: Actor) => [1, 3, 4].includes(user.roleId);
export const canManageVotes = (user: Actor) => [1, 3].includes(user.roleId);
export const canEditDocument = (user: Actor, ownerId: number) => user.userId === ownerId || canReview(user);
export function reviewStatus(reviews: { role: number; decision: string }[]) {
  if (![1, 3, 4].every(role => reviews.some(review => review.role === role))) return 'قيد المراجعة';
  return reviews.filter(review => [1, 3, 4].includes(review.role)).every(review => review.decision === 'مقبول') ? 'مقبول' : 'مرفوض';
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
  const actual = Buffer.from(password), expected = Buffer.from(stored);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
