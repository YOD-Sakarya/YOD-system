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
