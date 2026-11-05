import { normalizeState } from './state.js';

const keyFor = user => user?.id ? `sb_state_user_${user.id}` : 'sb_state_guest';
const clone = value => JSON.parse(JSON.stringify(value));

export function loadState(user) {
  try { const raw = localStorage.getItem(keyFor(user)); return raw ? normalizeState(JSON.parse(raw)) : null; }
  catch { return null; }
}

export function saveState(user, state) {
  const payload = clone(state);
  delete payload.timerInterval;
  try { localStorage.setItem(keyFor(user), JSON.stringify(payload)); return true; } catch { return false; }
}

export function remotePayload(state) {
  const payload = clone(state);
  delete payload.apiKey;
  delete payload.timerInterval;
  return payload;
}

export function hasMeaningfulProgress(state) {
  return Boolean(state && (state.xp || state.streak || state.studiedMin || state.sessionsToday || state.tasks?.length || state.notes?.length || state.chatHistory?.length || state.profileComplete));
}
