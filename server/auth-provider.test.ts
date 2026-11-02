import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthProvider } from './auth-provider.js';

test('the old login stays the default, so deploying never switches members to Better Auth by itself', () => {
  assert.equal(resolveAuthProvider(undefined), 'legacy');
  assert.equal(resolveAuthProvider(''), 'legacy');
  assert.equal(resolveAuthProvider('legacy'), 'legacy');
});

test('Better Auth needs an explicit setting and invalid providers fail closed', () => {
  assert.equal(resolveAuthProvider('neon'), 'neon');
  assert.throws(() => resolveAuthProvider('better-auth'), /AUTH_PROVIDER/);
});
