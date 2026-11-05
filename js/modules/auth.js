import { normalizeState, touch } from './state.js';
import { remotePayload } from './storage.js';

const updatedAt = item => {
  const parsed = Date.parse(item?.updated_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
};
const latestTimestamp = (first, second) => {
  const firstTime = Date.parse(first || '');
  const secondTime = Date.parse(second || '');
  return Number.isFinite(firstTime) && firstTime >= (Number.isFinite(secondTime) ? secondTime : 0)
    ? first
    : Number.isFinite(secondTime) ? second : '';
};

function preferredItem(current, incoming) {
  const currentTime = updatedAt(current);
  const incomingTime = updatedAt(incoming);
  if (incomingTime !== currentTime) return incomingTime > currentTime ? incoming : current;
  if (Boolean(incoming.deleted) !== Boolean(current.deleted)) return incoming.deleted ? incoming : current;
  return current;
}

function mergeItems(local = [], remote = []) {
  const byId = new Map();
  [...remote, ...local].forEach(item => {
    if (!item?.id) return;
    byId.set(item.id, byId.has(item.id) ? preferredItem(byId.get(item.id), item) : item);
  });
  return [...byId.values()].sort((a, b) => updatedAt(b) - updatedAt(a));
}

function mergeXpEvents(local = [], remote = []) {
  const byId = new Map();
  [...remote, ...local].forEach(event => {
    if (!event?.id) return;
    const current = byId.get(event.id);
    if (!current || Number(event.amount) > Number(current.amount)) byId.set(event.id, event);
  });
  return [...byId.values()];
}

function mergeStudyBase(local, remote, freshest, sameDay, sameWeek) {
  const base = { ...freshest.studyBase };
  if (sameDay) {
    base.dayKey = local.dayKey;
    base.studiedMin = Math.max(local.studyBase.studiedMin, remote.studyBase.studiedMin);
    base.sessionsToday = Math.max(local.studyBase.sessionsToday, remote.studyBase.sessionsToday);
  }
  if (sameWeek) {
    base.weekKey = local.weekKey;
    base.weekData = local.studyBase.weekData.map((value, index) =>
      Math.max(value || 0, remote.studyBase.weekData[index] || 0)
    );
  }
  return base;
}

export function mergeState(localState, remoteState) {
  const local = normalizeState(localState);
  const remote = normalizeState(remoteState);
  const freshest = updatedAt(local) >= updatedAt(remote) ? local : remote;
  const sameDay = local.dayKey === remote.dayKey;
  const sameWeek = local.weekKey === remote.weekKey;
  const merged = normalizeState({
    ...freshest,
    tasks: mergeItems(local.tasks, remote.tasks),
    notes: mergeItems(local.notes, remote.notes),
    subjects: mergeItems(local.subjects, remote.subjects),
    flashcards: mergeItems(local.flashcards, remote.flashcards),
    studyPlan: mergeItems(local.studyPlan, remote.studyPlan),
    chatHistory: mergeItems(local.chatHistory, remote.chatHistory).slice(0, 150),
    sessionLog: mergeItems(local.sessionLog, remote.sessionLog).slice(0, 50),
    xpBase: Math.max(local.xpBase, remote.xpBase),
    xpEvents: mergeXpEvents(local.xpEvents, remote.xpEvents),
    streak: Math.max(local.streak, remote.streak),
    streakFreezeCount: Math.min(local.streakFreezeCount, remote.streakFreezeCount),
    streakFreezeUsedAt: latestTimestamp(local.streakFreezeUsedAt, remote.streakFreezeUsedAt),
    studyBase: mergeStudyBase(local, remote, freshest, sameDay, sameWeek),
    studyEvents: mergeItems(local.studyEvents, remote.studyEvents)
  });
  touch(merged);
  return merged;
}

export function createAuthService({ config, onState, getState, loadLocal, saveLocal, guestState }) {
  let client = null;
  let user = null;
  let saveTimer = null;
  let hydrating = false;
  let authRevision = 0;
  let saveQueue = Promise.resolve();

  const configured = () => Boolean(config?.url && config?.anonKey && window.supabase?.createClient);
  const status = (mode, message) => onState({ mode, message, user });

  async function readRemote(targetUser) {
    const { data, error } = await client
      .from('profiles')
      .select('state, updated_at')
      .eq('user_id', targetUser.id)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  async function writeRemote(targetUser) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (user?.id !== targetUser.id) return;
      const remote = await readRemote(targetUser);
      if (user?.id !== targetUser.id) return;
      const merged = remote?.state
        ? mergeState(getState(), remote.state)
        : normalizeState(getState());
      const currentUserState = getState();
      saveLocal(targetUser, merged);
      if (user?.id === targetUser.id && currentUserState !== merged) onState({ state: merged });

      const nextUpdatedAt = new Date(Math.max(Date.now(), updatedAt(remote) + 1)).toISOString();
      const row = {
        user_id: targetUser.id,
        state: remotePayload(merged),
        updated_at: nextUpdatedAt
      };

      if (remote) {
        let update = client.from('profiles').update(row).eq('user_id', targetUser.id);
        update = remote.updated_at == null
          ? update.is('updated_at', null)
          : update.eq('updated_at', remote.updated_at);
        const { data, error } = await update.select('user_id').maybeSingle();
        if (error) throw error;
        if (data) return;
      } else {
        const { error } = await client.from('profiles').insert(row);
        if (!error) return;
        if (error.code !== '23505') throw error;
      }
    }
    throw new Error('Synchronisatieconflict: probeer het over enkele seconden opnieuw.');
  }

  function saveRemote() {
    if (!client || !user || hydrating) return Promise.resolve();
    if (navigator.onLine === false) {
      status('offline', 'Offline: wijzigingen staan op dit apparaat en worden later gesynchroniseerd.');
      return Promise.resolve();
    }
    const targetUser = user;
    status('syncing', 'Je voortgang wordt opgeslagen…');
    const operation = () => writeRemote(targetUser).then(
      () => {
        if (user?.id === targetUser.id) status('connected', 'Je voortgang is gesynchroniseerd.');
      }
    );
    saveQueue = saveQueue.then(operation, operation);
    return saveQueue;
  }

  function scheduleSave() {
    if (!client || !user || hydrating) return;
    clearTimeout(saveTimer);
    if (navigator.onLine === false) {
      status('offline', 'Offline: wijzigingen staan op dit apparaat en worden later gesynchroniseerd.');
      return;
    }
    saveTimer = setTimeout(() => {
      saveRemote().catch(() => {
        status('error', 'Synchroniseren is niet gelukt. Je wijzigingen blijven op dit apparaat bewaard.');
      });
    }, 600);
  }

  async function adopt(nextUser) {
    const revision = ++authRevision;
    user = nextUser;
    hydrating = true;
    status('syncing', 'Je opgeslagen voortgang wordt geladen…');
    try {
      const remote = await readRemote(nextUser);
      if (revision !== authRevision) return;
      const local = loadLocal(nextUser);
      const next = remote?.state && local
        ? mergeState(local, remote.state)
        : normalizeState(remote?.state || local || guestState());
      saveLocal(nextUser, next);
      onState({ state: next });
    } catch (error) {
      if (revision !== authRevision) return;
      onState({ state: loadLocal(nextUser) || guestState() });
      status('error', 'Cloudgegevens konden niet worden geladen. Je lokale gegevens blijven beschikbaar.');
      return;
    } finally {
      if (revision === authRevision) hydrating = false;
    }
    if (revision !== authRevision) return;
    try {
      await saveRemote();
    } catch {
      status('error', 'Synchroniseren is niet gelukt. Je wijzigingen blijven op dit apparaat bewaard.');
    }
  }

  async function init() {
    if (!configured()) {
      status('guest', 'Je gegevens staan alleen op dit apparaat.');
      return;
    }
    client = window.supabase.createClient(config.url, config.anonKey);
    client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        adopt(session.user);
      } else {
        authRevision += 1;
        hydrating = false;
        user = null;
        onState({ state: guestState() });
        status('guest', 'Je gegevens staan alleen op dit apparaat.');
      }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session?.user) await adopt(data.session.user);
    else status('guest', 'Je gegevens staan alleen op dit apparaat.');
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Cloudsynchronisatie is niet geconfigureerd.');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email, password) {
    if (!client) throw new Error('Cloudsynchronisatie is niet geconfigureerd.');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return Boolean(data.session);
  }

  async function signOut() {
    if (client) {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    }
  }

  return { init, signIn, signUp, signOut, scheduleSave, configured, get user() { return user; } };
}
