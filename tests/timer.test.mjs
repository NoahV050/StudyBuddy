import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, localDateKey, localWeekKey, normalizeState } from '../js/modules/state.js';
import { completeTimer, reconcileTimer } from '../js/modules/timer.js';
import { awardXp } from '../js/modules/gamification.js';

test('recovers an expired timer and awards its session exactly once', () => {
  const state = normalizeState({
    ...createDefaultState(),
    timerMode: 'short',
    timerTotal: 600,
    timerSeconds: 0,
    timerRunning: true,
    timerEndsAt: Date.now() - 1000,
    timerSessionId: 'timer-session-1'
  });
  const reconciled = reconcileTimer(state);

  assert.equal(reconciled.completed, true);
  assert.equal(reconciled.sessionId, 'timer-session-1');
  const first = completeTimer(state, reconciled.sessionId);
  const second = completeTimer(state, reconciled.sessionId);
  awardXp(state, first.minutes * 2, `timer:${reconciled.sessionId}`);
  awardXp(state, first.minutes * 2, `timer:${reconciled.sessionId}`);

  assert.equal(first.completed, true);
  assert.equal(second.completed, false);
  assert.equal(state.studiedMin, 10);
  assert.equal(state.sessionsToday, 1);
  assert.equal(state.sessionLog.length, 1);
  assert.equal(state.xp, 20);
});

test('records a session against the completion day after midnight', () => {
  const state = createDefaultState();
  const yesterday = new Date(2026, 4, 1, 12);
  const today = new Date(2026, 4, 2, 0, 1);
  const oldDay = localDateKey(yesterday);
  state.dayKey = oldDay;
  state.studyBase.dayKey = oldDay;
  state.studyBase.studiedMin = 80;
  state.studyBase.sessionsToday = 3;
  state.studiedMin = 80;
  state.sessionsToday = 3;
  state.weekKey = localWeekKey(today);
  state.studyBase.weekKey = state.weekKey;
  state.lastStudyDate = oldDay;
  state.streak = 2;

  completeTimer(state, 'timer-session-midnight', today);

  assert.equal(state.dayKey, localDateKey(today));
  assert.equal(state.studiedMin, 25);
  assert.equal(state.sessionsToday, 1);
  assert.equal(state.streak, 3);
  assert.equal(state.weekData[today.getDay()], 25);
});
