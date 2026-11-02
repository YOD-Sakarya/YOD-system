import type { Document } from '../types';

export const PROPOSAL_TYPE_ID = 1;
/** The developer administers users, cycles, deletions and storage. */
export const DEVELOPER_ROLE_ID = 11;
export const isDeveloper = (user: { roleId: number }) => user.roleId === DEVELOPER_ROLE_ID;
/** President, secretary general and financial officer review proposals. */
export const REVIEWER_ROLE_IDS = [1, 3, 4];
/** Oversight committee: chair, deputy chair and rapporteur. They review each other's uploads. */
export const OVERSIGHT_ROLE_IDS = [10, 12, 13];
export const isOversight = (user: { roleId: number }) => OVERSIGHT_ROLE_IDS.includes(user.roleId);
/** Oversight members watch decision votes; meeting votes are open to everyone (mirrors the server rule). */
export const canVoteOn = (user: { roleId: number }, kind: string) => kind !== 'قرار' || !isOversight(user);
/** President and secretary general (and the developer) manage vote sessions. */
export const VOTE_MANAGER_ROLE_IDS = [1, 3, DEVELOPER_ROLE_ID];
/** Every role except the developer works in a committee space. */
export const isCommitteeRole = (role: { roleId: number }) => role.roleId !== DEVELOPER_ROLE_ID;

/** Role names used in review rows, whatever the catalog language or wording. */
export const REVIEWER_TITLES: Record<number, string> = {
  1: 'رئيس الهيئة التنفيذية',
  3: 'أمين عام',
  4: 'مسؤول مالي',
  10: 'رئيس لجنة الرقابة',
  12: 'نائب رئيس لجنة الرقابة',
  13: 'المقرر',
};

/**
 * Roles whose acceptance a document needs (mirrors the server rule): proposals go to leadership,
 * documents uploaded by an oversight member go to the other two oversight members.
 */
export function reviewerRolesFor(doc: Pick<Document, 'docTypeId' | 'roleId'>): number[] {
  if (doc.docTypeId === PROPOSAL_TYPE_ID) return REVIEWER_ROLE_IDS;
  if (OVERSIGHT_ROLE_IDS.includes(doc.roleId)) return OVERSIGHT_ROLE_IDS.filter(role => role !== doc.roleId);
  return [];
}
