import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, normalizeState } from '../js/modules/state.js';
import { awardXp } from '../js/modules/gamification.js';
import { createAuthService } from '../js/modules/auth.js';

test('retries a concurrent profile update and merges both devices', async () => {
  let localState = createDefaultState();
  awardXp(localState, 10, 'task:local');
  let competitorState = createDefaultState();
  awardXp(competitorState, 20, 'task:remote');
  let row = {
    user_id: 'student-1',
    state: createDefaultState(),
    updated_at: '2026-01-01T10:00:00.000Z'
  };
  let updateAttempts = 0;

  const client = {
    auth: {
      onAuthStateChange() {},
      async getSession() { return { data: { session: { user: { id: 'student-1' } } }, error: null }; }
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return { async maybeSingle() { return { data: row, error: null }; } };
            }
          };
        },
        update(values) {
          const conditions = [];
          const query = {
            eq(column, value) { conditions.push([column, value]); return query; },
            is(column, value) { conditions.push([column, value]); return query; },
            select() { return query; },
            async maybeSingle() {
              updateAttempts += 1;
              if (updateAttempts === 1) {
                row = { ...row, state: competitorState, updated_at: '2026-01-01T10:00:01.000Z' };
              }
              const expected = conditions.find(([column]) => column === 'updated_at')?.[1];
              if (row.updated_at !== expected) return { data: null, error: null };
              row = { ...row, ...values };
              return { data: { user_id: row.user_id }, error: null };
            }
          };
          return query;
        }
      };
    }
  };
  globalThis.window = { supabase: { createClient: () => client } };
  const service = createAuthService({
    config: { url: 'https://example.test', anonKey: 'public-key' },
    onState(update) { if (update.state) localState = normalizeState(update.state); },
    getState: () => localState,
    loadLocal: () => localState,
    saveLocal(_user, state) { localState = state; return true; },
    guestState: createDefaultState
  });

  await service.init();

  assert.equal(updateAttempts, 2);
  assert.equal(row.state.xp, 30);
  assert.deepEqual(row.state.xpEvents.map(event => event.id).sort(), ['task:local', 'task:remote']);
});
