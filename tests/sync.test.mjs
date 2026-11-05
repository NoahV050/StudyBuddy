import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, localDateKey, localWeekKey, normalizeState } from '../js/modules/state.js';
import { mergeState } from '../js/modules/auth.js';

test('merges independent XP and study events without losing either device', () => {
  const dayKey = localDateKey();
  const weekKey = localWeekKey();
  const local = createDefaultState();
  const remote = createDefaultState();
  local.xpEvents = [{ id: 'task:local', amount: 10, updated_at: '2026-01-01T10:00:00.000Z' }];
  remote.xpEvents = [{ id: 'task:remote', amount: 20, updated_at: '2026-01-01T10:00:00.000Z' }];
  local.studyEvents = [{ id: 'session-local', dayKey, weekKey, weekday: new Date().getDay(), minutes: 25, label: 'Wiskunde · 25 min' }];
  remote.studyEvents = [{ id: 'session-remote', dayKey, weekKey, weekday: new Date().getDay(), minutes: 50, label: 'Nederlands · 50 min' }];

  const merged = mergeState(local, remote);

  assert.equal(merged.xp, 30);
  assert.equal(merged.studiedMin, 75);
  assert.equal(merged.sessionsToday, 2);
  assert.equal(merged.studyEvents.length, 2);
});

test('deduplicates the same timer completion synced from two tabs', () => {
  const dayKey = localDateKey();
  const weekKey = localWeekKey();
  const local = createDefaultState();
  const remote = createDefaultState();
  const event = { id: 'same-session', dayKey, weekKey, weekday: new Date().getDay(), minutes: 25, label: 'Wiskunde · 25 min' };
  local.studyEvents = [event];
  remote.studyEvents = [{ ...event }];
  local.xpEvents = [{ id: 'timer:same-session', amount: 50 }];
  remote.xpEvents = [{ id: 'timer:same-session', amount: 50 }];

  const merged = mergeState(local, remote);

  assert.equal(merged.xp, 50);
  assert.equal(merged.studiedMin, 25);
  assert.equal(merged.sessionsToday, 1);
  assert.equal(merged.studyEvents.length, 1);
});

test('prefers a tombstone over a same-time item update', () => {
  const local = createDefaultState();
  const remote = createDefaultState();
  local.tasks = [{ id: 'task-1', title: 'Taak', updated_at: '2026-01-01T10:00:00.000Z', deleted: false }];
  remote.tasks = [{ id: 'task-1', title: 'Taak', updated_at: '2026-01-01T10:00:00.000Z', deleted: true }];

  const merged = normalizeState(mergeState(local, remote));

  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].deleted, true);
});
