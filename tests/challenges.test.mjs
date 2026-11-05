import test from 'node:test';
import assert from 'node:assert/strict';
import { claimChallenge, canUseStreakFreeze, getChallenges, useStreakFreeze } from '../js/modules/challenges.js';
import { createDefaultState, localDateKey, localWeekKey, normalizeState } from '../js/modules/state.js';
import { mergeState } from '../js/modules/auth.js';

test('creates day and week challenges from study, tasks, and card reviews', () => {
  const state = createDefaultState();
  const now = new Date(2026, 0, 7, 12);
  const dayKey = localDateKey(now);
  const weekKey = localWeekKey(now);
  state.studyEvents.push({ id: 'study-1', dayKey, weekKey, minutes: 25 });
  state.tasks.push(
    { id: 'task-1', done: true, completed_at: now.toISOString() },
    { id: 'task-2', done: true, completed_at: now.toISOString() }
  );
  state.flashcards.push(
    { id: 'card-1', lastReviewedAt: now.toISOString() },
    { id: 'card-2', lastReviewedAt: now.toISOString() },
    { id: 'card-3', lastReviewedAt: now.toISOString() }
  );

  const challenges = getChallenges(state, now);
  assert.equal(challenges.find(item => item.period === 'daily' && item.id === 'focus').progress, 25);
  assert.equal(challenges.find(item => item.period === 'daily' && item.id === 'tasks').progress, 2);
  assert.equal(challenges.find(item => item.period === 'daily' && item.id === 'cards').progress, 3);
  assert.equal(challenges.find(item => item.period === 'weekly' && item.id === 'focus').progress, 25);
});

test('challenge rewards are opt-in and cannot be claimed twice', () => {
  const state = createDefaultState();
  const now = new Date(2026, 0, 7, 12);
  state.studyEvents.push({
    id: 'study-1',
    dayKey: localDateKey(now),
    weekKey: localWeekKey(now),
    minutes: 25
  });

  assert.equal(claimChallenge(state, 'daily', 'focus', now), true);
  assert.equal(claimChallenge(state, 'daily', 'focus', now), false);
  assert.equal(state.xp, 10);
  assert.equal(claimChallenge(state, 'weekly', 'tasks', now), false);
});

test('a streak freeze can cover only one missed day and is consumed once', () => {
  const state = createDefaultState();
  const today = new Date(2026, 0, 10, 12);
  state.streak = 4;
  state.lastStudyDate = '2026-01-08';

  assert.equal(canUseStreakFreeze(state, today), true);
  assert.equal(useStreakFreeze(state, today), true);
  assert.equal(state.streak, 4);
  assert.equal(state.lastStudyDate, localDateKey(today));
  assert.equal(state.streakFreezeCount, 0);
  assert.equal(useStreakFreeze(state, today), false);
});

test('migrates existing version 4 accounts with one streak freeze', () => {
  const state = normalizeState({ version: 4, name: 'Noor', streak: 2 });
  assert.equal(state.version, 5);
  assert.equal(state.streakFreezeCount, 1);
});

test('sync does not restore a streak freeze already spent on another device', () => {
  const local = createDefaultState();
  const remote = createDefaultState();
  local.streakFreezeCount = 0;
  local.streakFreezeUsedAt = '2026-01-08T10:00:00.000Z';

  const merged = mergeState(local, remote);

  assert.equal(merged.streakFreezeCount, 0);
  assert.equal(merged.streakFreezeUsedAt, local.streakFreezeUsedAt);
});
