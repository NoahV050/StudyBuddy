import { normalizeState } from './state.js';

const keyFor = user => user?.id ? `sb_state_user_${user.id}` : 'sb_state_guest';
const clone = value => JSON.parse(JSON.stringify(value));

export function loadState(user) {
  const key = keyFor(user);
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch (error) {
    console.error('Studiemaatje kon lokale gegevens niet lezen.', error);
    return null;
  }
  if (!raw) return null;
  try {
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    try {
      localStorage.setItem(`${key}_recovery_backup`, raw);
    } catch (backupError) {
      console.error('Studiemaatje kon geen herstelkopie van de lokale gegevens maken.', backupError);
    }
    console.error('Studiemaatje heeft ongeldige of nieuwere lokale gegevens bewaard voor herstel.', error);
    return null;
  }
}

export function saveState(user, state) {
  const payload = clone(state);
  delete payload.timerInterval;
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Studiemaatje kon wijzigingen niet lokaal opslaan.', error);
    return false;
  }
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
