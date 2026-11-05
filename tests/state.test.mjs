import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceStreak,
  localDateKey,
  localWeekKey,
  normalizeState,
  previousLocalDateKey,
  STATE_VERSION
} from '../js/modules/state.js';

process.env.TZ = 'America/New_York';

test('migrates existing version 2 progress without dropping user content', () => {
  const now = new Date();
  const dayKey = localDateKey(now);
  const weekKey = localWeekKey(now);
  const migrated = normalizeState({
    version: 2,
    name: 'Sam',
    xp: 240,
    dayKey,
    weekKey,
    studiedMin: 35,
    sessionsToday: 2,
    weekData: [0, 10, 25, 0, 0, 0, 0],
    tasks: [{ id: 'task-1', title: 'Hoofdstuk leren', done: true }],
    notes: [{ id: 'note-1', title: 'Biologie', body: 'Celstructuur' }]
  });

  assert.equal(STATE_VERSION, 4);
  assert.equal(migrated.version, STATE_VERSION);
  assert.equal(migrated.name, 'Sam');
  assert.equal(migrated.xp, 240);
  assert.equal(migrated.studiedMin, 35);
  assert.equal(migrated.sessionsToday, 2);
  assert.equal(migrated.tasks[0].title, 'Hoofdstuk leren');
  assert.equal(migrated.notes[0].body, 'Celstructuur');
  assert.deepEqual(migrated.xpEvents, []);
  assert.deepEqual(migrated.studyEvents, []);
});

test('uses local calendar dates across the daylight-saving transition', () => {
  const before = new Date(2026, 2, 8, 12);
  const after = new Date(2026, 2, 9, 12);
  const state = { streak: 3, lastStudyDate: localDateKey(before) };

  assert.equal(previousLocalDateKey(after), localDateKey(before));
  assert.equal(advanceStreak(state, after), 4);
  assert.equal(advanceStreak(state, after), 4);
});

test('does not reduce a streak when the device calendar moves backward', () => {
  const state = { streak: 5, lastStudyDate: '2026-11-06' };

  assert.equal(advanceStreak(state, new Date(2026, 10, 5, 12)), 5);
  assert.equal(state.lastStudyDate, '2026-11-06');
});

test('rejects state created by an unsupported newer version', () => {
  assert.throws(() => normalizeState({ version: STATE_VERSION + 1 }), /nieuwere versie/);
});
