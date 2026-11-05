import { createId, touch } from './state.js';
const now = () => new Date().toISOString();

export function saveNote(state, id, title, body) {
  const cleanTitle = String(title || '').trim().slice(0, 300) || 'Zonder titel';
  const cleanBody = String(body || '').trim().slice(0, 10000);
  let item = id ? state.notes.find(note => note.id === id && !note.deleted) : null;
  const isNew = !item;
  if (!item) { item = { id: createId('note'), created_at: now(), deleted: false }; state.notes.unshift(item); }
  Object.assign(item, { title: cleanTitle, body: cleanBody, updated_at: now() }); touch(state);
  return { item, isNew };
}

export function deleteNote(state, id) {
  const item = state.notes.find(note => note.id === id); if (!item) return false;
  item.deleted = true; item.updated_at = now(); touch(state); return true;
}
