import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialFingerprint, requiresPasswordChange } from './security.js';

test('temporary managed credentials remain restricted until the stored credential changes', () => {
  const marker = '!neon-temporary:' + credentialFingerprint('initial-managed-hash');
  assert.equal(requiresPasswordChange(marker, 'initial-managed-hash'), true);
  assert.equal(requiresPasswordChange(marker, null), true);
  assert.equal(requiresPasswordChange(marker, 'replacement-managed-hash'), false);
  assert.equal(requiresPasswordChange('!neon-managed:subject', 'hash'), false);
});

test('developer-issued passwords verify, are restricted, and a normal hash lifts the restriction', async () => {
  const {
    generateTemporaryPassword,
    hashPassword,
    hashTemporaryPassword,
    isPlainTextPassword,
    isTemporaryPassword,
    verifyPassword,
  } = await import('./security.js');
  const temporary = hashTemporaryPassword('Welcome-2026-x');
  assert.equal(isTemporaryPassword(temporary), true);
  assert.equal(verifyPassword('Welcome-2026-x', temporary), true);
  assert.equal(verifyPassword('wrong-password', temporary), false);
  assert.equal(isPlainTextPassword(temporary), false);
  assert.equal(isTemporaryPassword(hashPassword('Chosen-by-member-1')), false);
  const generated = generateTemporaryPassword();
  assert.match(generated, /^[A-Za-z2-9]{12}$/);
  assert.notEqual(generated, generateTemporaryPassword());
});
