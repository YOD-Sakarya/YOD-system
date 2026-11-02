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
