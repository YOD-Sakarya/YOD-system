import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeoutSignal } from './timeout.js';

test('timeoutSignal aborts after the delay, with or without AbortSignal.timeout', async () => {
  const native = AbortSignal.timeout;
  try {
    for (const available of [true, false]) {
      if (!available) (AbortSignal as { timeout?: unknown }).timeout = undefined;
      const signal = timeoutSignal(20);
      assert.equal(signal.aborted, false);
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(signal.aborted, true, `aborted (native available: ${available})`);
    }
  } finally {
    AbortSignal.timeout = native;
  }
});
