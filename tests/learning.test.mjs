import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, localDateKey, localWeekKey, normalizeState } from '../js/modules/state.js';
import {
  addFlashcard,
  addSubject,
  createExamPlan,
  dueFlashcards,
  getStudyStats,
  reviewFlashcard
} from '../js/modules/learning.js';
import { mergeState } from '../js/modules/auth.js';

test('migrates version 3 users into subjects without dropping their study data', () => {
  const state = normalizeState({
    version: 3,
    name: 'Ravi',
    xp: 125,
    tasks: [{ id: 'legacy-task', title: 'Engels woordjes', subject: 'Engels' }],
    sessionLog: [{ id: 'legacy-session', label: 'Engels · 25 min' }]
  });

  assert.equal(state.version, 6);
  assert.equal(state.name, 'Ravi');
  assert.equal(state.xp, 125);
  assert.ok(state.subjects.some(subject => subject.name === 'Wiskunde'));
  assert.ok(state.subjects.some(subject => subject.name === 'Engels'));
  assert.deepEqual(state.flashcards, []);
  assert.deepEqual(state.studyPlan, []);
});

test('applies SM-2 intervals and schedules a difficult card for tomorrow', () => {
  const state = createDefaultState();
  const subject = state.subjects[0];
  const first = addFlashcard(state, subject.id, 'Wat is 2 + 2?', '4');
  const today = new Date();
  const easy = reviewFlashcard(state, first.id, 5, today);
  assert.equal(easy.repetitions, 1);
  assert.equal(easy.intervalDays, 1);
  assert.equal(easy.dueDate, localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)));

  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  const good = reviewFlashcard(state, first.id, 4, tomorrow);
  assert.equal(good.repetitions, 2);
  assert.equal(good.intervalDays, 6);

  const lapse = reviewFlashcard(state, first.id, 1, tomorrow);
  assert.equal(lapse.repetitions, 0);
  assert.equal(lapse.intervalDays, 1);
  assert.equal(lapse.lapses, 1);
});

test('creates a distributed exam plan and surfaces due items in daily planning', () => {
  const state = createDefaultState();
  const subject = state.subjects[0];
  const now = new Date(2026, 4, 1, 12);
  const examDate = localDateKey(new Date(2026, 4, 8, 12));
  const plan = createExamPlan(state, subject.id, examDate, 'Breuken\nVergelijkingen', now);

  assert.ok(plan.length > 0);
  assert.ok(plan.length <= 7);
  assert.ok(plan.every(item => item.date > localDateKey(now) && item.date < examDate));
  assert.equal(state.subjects.find(item => item.id === subject.id).examDate, examDate);
  assert.equal(createExamPlan(state, subject.id, localDateKey(now), '', now).length, 0);
});

test('tracks recent study time by day and subject', () => {
  const state = createDefaultState();
  const today = new Date();
  const dayKey = localDateKey(today);
  const weekKey = localWeekKey(today);
  state.studyEvents = [
    { id: 'a', dayKey, weekKey, weekday: today.getDay(), minutes: 25, subject: 'Wiskunde' },
    { id: 'b', dayKey, weekKey, weekday: today.getDay(), minutes: 50, subject: 'Nederlands' }
  ];

  const stats = getStudyStats(state, 7, today);

  assert.equal(stats.totalMinutes, 75);
  assert.equal(stats.dayTotals[6].minutes, 75);
  assert.equal(stats.subjectTotals[0].subject, 'Nederlands');
});

test('merges study subjects, cards, and plans from both devices', () => {
  const local = createDefaultState();
  const remote = createDefaultState();
  const subject = addSubject(local, 'Engels');
  const card = addFlashcard(local, subject.id, 'Hello', 'Hallo');
  const plan = createExamPlan(local, subject.id, localDateKey(new Date(Date.now() + 2 * 86_400_000)), '', new Date());
  remote.flashcards.push({ ...card, id: 'remote-card', updated_at: '2026-01-01T10:00:00.000Z' });

  const merged = mergeState(local, remote);

  assert.ok(merged.subjects.some(item => item.name === 'Engels'));
  assert.ok(merged.flashcards.some(item => item.id === card.id));
  assert.ok(merged.flashcards.some(item => item.id === 'remote-card'));
  assert.ok(plan.every(item => merged.studyPlan.some(remoteItem => remoteItem.id === item.id)));
});

test('returns only cards due on the selected local date', () => {
  const state = createDefaultState();
  const subject = state.subjects[0];
  const card = addFlashcard(state, subject.id, 'Vraag', 'Antwoord');
  card.dueDate = '2099-01-01';

  assert.equal(dueFlashcards(state, subject.id).length, 0);
});
