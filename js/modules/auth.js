import { normalizeState, touch } from './state.js';
import { remotePayload } from './storage.js';

const newer = (left, right) => new Date(left?.updated_at || 0) >= new Date(right?.updated_at || 0) ? left : right;
function mergeItems(local = [], remote = []) {
  const byId = new Map();
  [...local, ...remote].forEach(item => { if (!item?.id) return; byId.set(item.id, newer(byId.get(item.id), item)); });
  return [...byId.values()].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

export function mergeState(localState, remoteState) {
  const local = normalizeState(localState); const remote = normalizeState(remoteState);
  const freshest = newer(local, remote);
  const merged = normalizeState({ ...freshest,
    tasks: mergeItems(local.tasks, remote.tasks), notes: mergeItems(local.notes, remote.notes),
    chatHistory: mergeItems(local.chatHistory, remote.chatHistory).slice(-100), sessionLog: mergeItems(local.sessionLog, remote.sessionLog).slice(0, 50),
    xp: Math.max(local.xp, remote.xp), streak: Math.max(local.streak, remote.streak),
    studiedMin: local.dayKey === remote.dayKey ? Math.max(local.studiedMin, remote.studiedMin) : freshest.studiedMin,
    sessionsToday: local.dayKey === remote.dayKey ? Math.max(local.sessionsToday, remote.sessionsToday) : freshest.sessionsToday,
    weekData: local.weekKey === remote.weekKey ? local.weekData.map((value, index) => Math.max(value || 0, remote.weekData[index] || 0)) : freshest.weekData
  });
  touch(merged); return merged;
}

export function createAuthService({ config, onState, getState, loadLocal, saveLocal, guestState }) {
  let client = null; let user = null; let saveTimer = null; let hydrating = false;
  const configured = () => Boolean(config?.url && config?.anonKey && window.supabase?.createClient);
  const status = (mode, message) => onState({ mode, message, user });
  async function saveRemote() {
    if (!client || !user || hydrating) return;
    status('syncing', 'Je voortgang wordt opgeslagen…');
    const { error } = await client.from('profiles').upsert({ user_id: user.id, state: remotePayload(getState()), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    status(error ? 'error' : 'connected', error?.message || 'Je voortgang is gesynchroniseerd.');
  }
  function scheduleSave() { if (!client || !user || hydrating) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveRemote().catch(() => status('error', 'Synchroniseren mislukt.')); }, 600); }
  async function adopt(nextUser) {
    user = nextUser; hydrating = true; status('syncing', 'Je opgeslagen voortgang wordt geladen…');
    try {
      const { data, error } = await client.from('profiles').select('state').eq('user_id', user.id).maybeSingle(); if (error && error.code !== 'PGRST116') throw error;
      const local = loadLocal(user); const remote = data?.state;
      const next = remote && local ? mergeState(local, remote) : normalizeState(remote || local || guestState());
      saveLocal(user, next); onState({ state: next }); await saveRemote(); status('connected', 'Je voortgang is gesynchroniseerd.');
    } catch (error) { const fallback = loadLocal(user) || guestState(); onState({ state: fallback }); status('error', error.message || 'Cloudgegevens konden niet worden geladen.'); }
    finally { hydrating = false; }
  }
  async function init() {
    if (!configured()) { status('guest', 'Je gegevens staan alleen op dit apparaat.'); return; }
    client = window.supabase.createClient(config.url, config.anonKey);
    client.auth.onAuthStateChange((_event, session) => { if (session?.user) adopt(session.user); else { user = null; onState({ state: guestState() }); status('guest', 'Je gegevens staan alleen op dit apparaat.'); } });
    const { data } = await client.auth.getSession(); if (data.session?.user) await adopt(data.session.user); else status('guest', 'Je gegevens staan alleen op dit apparaat.');
  }
  async function signIn(email, password) { if (!client) throw new Error('Cloudsynchronisatie is niet geconfigureerd.'); const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; }
  async function signUp(email, password) { if (!client) throw new Error('Cloudsynchronisatie is niet geconfigureerd.'); const { data, error } = await client.auth.signUp({ email, password }); if (error) throw error; return Boolean(data.session); }
  async function signOut() { if (client) await client.auth.signOut(); }
  return { init, signIn, signUp, signOut, scheduleSave, configured, get user() { return user; } };
}
