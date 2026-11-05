import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export type Actor = {
  userId: number;
  roleId: number;
  fullName: string;
  roleName: string;
  mustChangePassword?: boolean;
};

/** Temporary managed credentials block workspace access until Neon stores a different password hash. */
export function requiresPasswordChange(marker: string, managedHash: string | null): boolean {
  const prefix = '!neon-temporary:';
  return (
    marker.startsWith(prefix) && (!managedHash || marker.slice(prefix.length) === credentialFingerprint(managedHash))
  );
}

export const credentialFingerprint = (hash: string) => createHash('sha256').update(hash).digest('hex');
/** The developer administers the whole system: users, cycles, deletions and storage. */
export const DEVELOPER_ROLE_ID = 11;
export const isDeveloper = (user: Actor) => user.roleId === DEVELOPER_ROLE_ID;
/** Visitor from the General Union (مراقب من الاتحاد العام): sees what members see plus the budgets, changes nothing. */
export const OBSERVER_ROLE_ID = 14;
export const isObserver = (user: Pick<Actor, 'roleId'>) => user.roleId === OBSERVER_ROLE_ID;
/** Only these roles' reviews count towards a proposal's outcome. */
export const canReview = (user: Actor) => [1, 3, 4].includes(user.roleId);
export const canManageVotes = (user: Actor) => [1, 3].includes(user.roleId) || isDeveloper(user);
export const canEditDocument = (user: Actor, ownerId: number) =>
  user.userId === ownerId || canReview(user) || isDeveloper(user);
/**
 * The union's budgets are visible to the president (1), secretary general (3), financial officer (4), the oversight
 * committee and the developer. Only the financial officer records money in or out.
 */
export const FINANCE_ROLE_ID = 4;
export const BUDGET_VIEWER_ROLE_IDS = [1, 3, FINANCE_ROLE_ID, 10, 12, 13, OBSERVER_ROLE_ID];
export const canViewBudget = (user: Actor) => BUDGET_VIEWER_ROLE_IDS.includes(user.roleId) || isDeveloper(user);
// TESTING ONLY (branch test/dev-adjust-everything): the developer may also add and delete. Never merge to main.
export const canManageBudget = (user: Actor) => user.roleId === FINANCE_ROLE_ID || isDeveloper(user);
/** Deleting vote sessions is reserved for the developer. */
export const canDelete = isDeveloper;
/**
 * The developer can delete any document. Its creator can delete it too, but only until the others have
 * accepted it and only while it belongs to the current cycle; after that only the developer can.
 */
export const canDeleteDocument = (user: Actor, doc: { ownerId: number; status: string; inCurrentCycle: boolean }) =>
  isDeveloper(user) || (user.userId === doc.ownerId && doc.status !== STATUS_APPROVED && doc.inCurrentCycle);
/**
 * Fingerprint of a stored password hash. It is embedded in session cookies, so changing a user's
 * password (for example when the seat is handed to a new person) signs out every existing session.
 */
export const sessionVersion = (passwordHash: string) =>
  createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
/** Oversight committee: chair (10), deputy chair (12) and rapporteur (13). */
export const OVERSIGHT_ROLE_IDS = [10, 12, 13];
export const PROPOSAL_TYPE_ID = 1;
export const STATUS_APPROVED = 'مقبول';
export const isOversightRole = (roleId: number) => OVERSIGHT_ROLE_IDS.includes(roleId);

/** A vote session is either a meeting vote (everyone votes) or a decision vote (oversight members only watch). */
export const VOTE_KIND_MEETING = 'اجتماع';
export const VOTE_KIND_DECISION = 'قرار';
export const canCastVote = (user: Actor, kind: string) =>
  !isObserver(user) && (kind !== VOTE_KIND_DECISION || !isOversightRole(user.roleId));

/**
 * Roles whose acceptance a document needs before it is final:
 * - proposals: president, secretary general and financial officer;
 * - documents uploaded by an oversight member: the other two oversight members
 *   (the uploader's own acceptance is implied, so all three have accepted);
 * - everything else needs no review.
 */
export function requiredReviewerRoles(docTypeId: number, ownerRoleId: number): number[] {
  if (docTypeId === PROPOSAL_TYPE_ID) return [1, 3, 4];
  if (isOversightRole(ownerRoleId)) return OVERSIGHT_ROLE_IDS.filter(role => role !== ownerRoleId);
  return [];
}

/** Roles that review something (proposals or oversight documents); everyone else is turned away before any lookup. */
export const canReviewAny = (user: Actor) => canReview(user) || isOversightRole(user.roleId);

/** Pending until every required role has reviewed; accepted only if all of them accepted. */
export function reviewStatus(reviews: { role: number; decision: string }[], required: number[] = [1, 3, 4]) {
  if (!required.every(role => reviews.some(review => review.role === role))) return 'قيد المراجعة';
  return reviews.filter(review => required.includes(review.role)).every(review => review.decision === STATUS_APPROVED)
    ? STATUS_APPROVED
    : 'مرفوض';
}

/**
 * Documents uploaded by oversight members stay private to the oversight committee (and the developer)
 * until all three have accepted them; after that everyone can see them.
 */
export const isRestrictedDocument = (ownerRoleId: number, status: string) =>
  isOversightRole(ownerRoleId) && status !== STATUS_APPROVED;
export const canSeeRestrictedDocuments = (user: Actor) => isDeveloper(user) || isOversightRole(user.roleId);
export const canViewDocument = (user: Actor, ownerRoleId: number, status: string) =>
  !isRestrictedDocument(ownerRoleId, status) || canSeeRestrictedDocuments(user);
export function voteDecision(options: { text: string; count: number }[]) {
  const ranked = [...options].sort((a, b) => b.count - a.count);
  if (!ranked[0]?.count) return 'لا يوجد قرار';
  return ranked[0].count === ranked[1]?.count ? 'تعادل' : ranked[0].text;
}
/** A password the developer handed out: it works for sign-in but the member must replace it before using the workspace. */
export const TEMPORARY_PASSWORD_PREFIX = '!temporary:';
export const isTemporaryPassword = (stored: string) => stored.startsWith(TEMPORARY_PASSWORD_PREFIX);

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
/** Hashes a developer-issued password. Choosing a new password writes a plain hash, which ends the restriction. */
export const hashTemporaryPassword = (password: string) => TEMPORARY_PASSWORD_PREFIX + hashPassword(password);

/** Readable random password (no look-alike characters) for the developer's "reset password" button. */
export function generateTemporaryPassword(length = 12) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(length), byte => alphabet[byte % alphabet.length]).join('');
}

export function verifyPassword(password: string, storedHash: string) {
  const stored = isTemporaryPassword(storedHash) ? storedHash.slice(TEMPORARY_PASSWORD_PREFIX.length) : storedHash;
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
export const isPlainTextPassword = (stored: string) =>
  !stored.startsWith('scrypt:') && !stored.startsWith('!neon-') && !isTemporaryPassword(stored);
