import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditDocument,
  canManageVotes,
  canReview,
  hashPassword,
  verifyPassword,
  reviewStatus,
  voteDecision,
  type Actor,
} from './security.js';

const user = (roleId: number): Actor => ({ userId: 27, roleId, fullName: 'Test member', roleName: 'Test role' });
test('committee members can edit only their documents; review leadership can edit across committees', () => {
  assert.equal(canEditDocument(user(7), 27), true);
  assert.equal(canEditDocument(user(7), 28), false);
  for (const role of [1, 3, 4]) assert.equal(canEditDocument(user(role), 28), true);
  assert.equal(canEditDocument(user(10), 28), false);
});
test('review and vote management roles stay distinct', () => {
  for (const role of [1, 3, 4]) assert.equal(canReview(user(role)), true);
  for (const role of [2, 5, 6, 7, 8, 9, 10]) assert.equal(canReview(user(role)), false);
  assert.equal(canManageVotes(user(1)), true);
  assert.equal(canManageVotes(user(3)), true);
  assert.equal(canManageVotes(user(4)), false);
});
test('new password hashes are salted and reject incorrect passwords', () => {
  const first = hashPassword('a secure password');
  assert.notEqual(first, hashPassword('a secure password'));
  assert.equal(verifyPassword('a secure password', first), true);
  assert.equal(verifyPassword('another password', first), false);
  assert.equal(verifyPassword('password', 'scrypt:broken:invalid'), false);
});
test('existing plaintext accounts work during transition without rewriting their records', () => {
  assert.equal(verifyPassword('legacy-password', 'legacy-password'), true);
  assert.equal(verifyPassword('different', 'legacy-password'), false);
});
test('proposal acceptance requires all three distinct reviewer roles', () => {
  assert.equal(
    reviewStatus([
      { role: 1, decision: 'مقبول' },
      { role: 1, decision: 'مقبول' },
      { role: 3, decision: 'مقبول' },
    ]),
    'قيد المراجعة',
  );
  assert.equal(reviewStatus([1, 3, 4].map(role => ({ role, decision: 'مقبول' }))), 'مقبول');
  assert.equal(
    reviewStatus([
      { role: 1, decision: 'مقبول' },
      { role: 3, decision: 'مرفوض' },
      { role: 4, decision: 'مقبول' },
    ]),
    'مرفوض',
  );
});
test('vote outcomes distinguish ties, empty ballots, and the actual winner', () => {
  assert.equal(voteDecision([]), 'لا يوجد قرار');
  assert.equal(
    voteDecision([
      { text: 'A', count: 0 },
      { text: 'B', count: 0 },
    ]),
    'لا يوجد قرار',
  );
  assert.equal(
    voteDecision([
      { text: 'A', count: 2 },
      { text: 'B', count: 2 },
    ]),
    'تعادل',
  );
  assert.equal(
    voteDecision([
      { text: 'A', count: 2 },
      { text: 'B', count: 7 },
    ]),
    'B',
  );
});

// ---- Oversight committee: chair 10, deputy 12, rapporteur 13 ----
import {
  canSeeRestrictedDocuments,
  canViewDocument,
  isRestrictedDocument,
  requiredReviewerRoles,
  reviewStatus as oversightReviewStatus,
} from './security.js';
const member = (roleId: number): Actor => ({ userId: roleId, roleId, fullName: 'x', roleName: 'x' });

test('a document uploaded by an oversight member needs the OTHER two oversight members', () => {
  assert.deepEqual(requiredReviewerRoles(2, 10), [12, 13]);
  assert.deepEqual(requiredReviewerRoles(2, 12), [10, 13]);
  assert.deepEqual(requiredReviewerRoles(2, 13), [10, 12]);
  assert.deepEqual(requiredReviewerRoles(2, 7), [], 'committee documents need no review');
  assert.deepEqual(requiredReviewerRoles(1, 7), [1, 3, 4], 'proposals still go to leadership');
});

test('it stays pending until both others reviewed, and is accepted only if both accept', () => {
  const required = [12, 13];
  assert.equal(oversightReviewStatus([], required), 'قيد المراجعة');
  assert.equal(oversightReviewStatus([{ role: 12, decision: 'مقبول' }], required), 'قيد المراجعة');
  assert.equal(
    oversightReviewStatus(
      [
        { role: 12, decision: 'مقبول' },
        { role: 13, decision: 'مقبول' },
      ],
      required,
    ),
    'مقبول',
  );
  assert.equal(
    oversightReviewStatus(
      [
        { role: 12, decision: 'مقبول' },
        { role: 13, decision: 'مرفوض' },
      ],
      required,
    ),
    'مرفوض',
  );
});

test('until accepted, only the oversight committee and the developer can see the document', () => {
  assert.equal(isRestrictedDocument(10, 'قيد المراجعة'), true);
  assert.equal(isRestrictedDocument(10, 'مرفوض'), true);
  assert.equal(isRestrictedDocument(10, 'مقبول'), false);
  assert.equal(isRestrictedDocument(7, 'قيد المراجعة'), false, 'other committees are not restricted');
  for (const roleId of [10, 12, 13, 11]) assert.equal(canViewDocument(member(roleId), 10, 'قيد المراجعة'), true);
  for (const roleId of [1, 2, 3, 4, 7, 9]) {
    assert.equal(canViewDocument(member(roleId), 10, 'قيد المراجعة'), false, `role ${roleId} must not see it`);
    assert.equal(canViewDocument(member(roleId), 10, 'مقبول'), true, `role ${roleId} sees it once accepted`);
  }
  assert.equal(canSeeRestrictedDocuments(member(1)), false);
});

test('only legacy plain-text passwords are flagged for hashing (hashes and Better Auth markers are left alone)', async () => {
  const { isPlainTextPassword, hashPassword: hash } = await import('./security.js');
  assert.equal(isPlainTextPassword('Some old password'), true);
  assert.equal(isPlainTextPassword('123456'), true);
  assert.equal(isPlainTextPassword(hash('anything long enough')), false);
  assert.equal(isPlainTextPassword('!neon-managed:abc'), false);
  assert.equal(isPlainTextPassword('!neon-temporary:abc'), false);
});
