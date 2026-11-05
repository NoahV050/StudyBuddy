import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState } from '../js/modules/storage.js';

test('keeps an incompatible local state in a recovery copy', () => {
  const values = new Map([
    ['sb_state_guest', JSON.stringify({ version: 99, name: 'Sam', xp: 123 })]
  ]);
  globalThis.localStorage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); }
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(loadState(null), null);
    assert.equal(values.get('sb_state_guest_recovery_backup'), values.get('sb_state_guest'));
  } finally {
    console.error = originalError;
  }
});
