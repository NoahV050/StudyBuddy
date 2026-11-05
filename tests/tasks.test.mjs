import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../js/modules/state.js';
import { awardXp } from '../js/modules/gamification.js';
import { addTask, toggleTask } from '../js/modules/tasks.js';

test('awards XP once for creating and completing the same task', () => {
  const state = createDefaultState();
  const task = addTask(state, 'Lees hoofdstuk 3');
  awardXp(state, 10, `task:create:${task.id}`);
  const firstCompletion = toggleTask(state, task.id);
  if (firstCompletion.award) awardXp(state, firstCompletion.award, `task:complete:${task.id}`);
  toggleTask(state, task.id);
  const secondCompletion = toggleTask(state, task.id);
  if (secondCompletion.award) awardXp(state, secondCompletion.award, `task:complete:${task.id}`);

  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].done, true);
  assert.equal(state.xp, 30);
});
