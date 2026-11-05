import { createId, touch } from './state.js';
const now = () => new Date().toISOString();

export function addTask(state, title, subject = 'Algemeen', dueDate = '') {
  const clean = String(title || '').trim().slice(0, 300); if (!clean) return null;
  const item = { id: createId('task'), title: clean, subject, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : '', done: false, xpAwarded: false, deleted: false, created_at: now(), updated_at: now() };
  state.tasks.unshift(item); touch(state); return item;
}

export function toggleTask(state, id) {
  const item = state.tasks.find(task => task.id === id && !task.deleted); if (!item) return { item: null, award: 0 };
  item.done = !item.done; item.updated_at = now();
  const award = item.done && !item.xpAwarded ? 20 : 0;
  if (award) item.xpAwarded = true; touch(state); return { item, award };
}

export function deleteTask(state, id) {
  const item = state.tasks.find(task => task.id === id); if (!item) return false;
  item.deleted = true; item.updated_at = now(); touch(state); return true;
}
