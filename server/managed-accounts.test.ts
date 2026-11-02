import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.js';
import type { query } from './db.js';
import { createManagedAccounts } from './services/managedAccounts.js';
import { requiresPasswordChange } from './security.js';

test('managed provisioning creates a passwordless identity and sends an OTP without exposing credentials', async () => {
  const before = {
    neonApiKey: config.neonApiKey,
    neonProjectId: config.neonProjectId,
    neonBranchId: config.neonBranchId,
  };
  Object.assign(config, { neonApiKey: 'test-key', neonProjectId: 'test-project', neonBranchId: 'test-branch' });
  const calls: { url: string; body: unknown; method: string | undefined }[] = [];
  const request = (async (url, options) => {
    calls.push({
      url: String(url),
      body: options?.body ? JSON.parse(String(options.body)) : null,
      method: options?.method,
    });
    return new Response(JSON.stringify({ id: 'new-subject' }), { status: 201 });
  }) as typeof fetch;
  try {
    const service = createManagedAccounts((async () => []) as unknown as typeof query, request);
    const identity = await service.provision('new@example.com', 'New member');
    assert.equal(identity.subject, 'new-subject');
    assert.equal(requiresPasswordChange(identity.marker, null), true);
    assert.deepEqual(calls[0].body, { email: 'new@example.com', name: 'New member' });
    assert.match(calls[0].url, /projects\/test-project\/branches\/test-branch\/auth\/users$/);
    await service.sendActivation('new@example.com');
    assert.match(calls[1].url, /email-otp\/request-password-reset$/);
    assert.deepEqual(calls[1].body, { email: 'new@example.com' });
    await service.remove('old-subject');
    assert.equal(calls[2].method, 'DELETE');
    assert.match(calls[2].url, /auth\/users\/old-subject$/);
  } finally {
    Object.assign(config, before);
  }
});

test('management failures are safe and do not send activation or leak provider errors', async () => {
  const before = {
    neonApiKey: config.neonApiKey,
    neonProjectId: config.neonProjectId,
    neonBranchId: config.neonBranchId,
  };
  Object.assign(config, { neonApiKey: 'secret-test-key', neonProjectId: 'project', neonBranchId: 'branch' });
  try {
    let calls = 0;
    const service = createManagedAccounts(
      (async () => []) as unknown as typeof query,
      (async () => {
        calls++;
        return new Response('secret-provider-details', { status: 403 });
      }) as typeof fetch,
    );
    await assert.rejects(service.provision('new@example.com', 'New member'), error => {
      assert.doesNotMatch(String(error), /secret/);
      return true;
    });
    assert.equal(calls, 1);
  } finally {
    Object.assign(config, before);
  }
});
