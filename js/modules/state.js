export const STATE_VERSION = 3;

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localWeekKey(date = new Date()) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return localDateKey(copy);
}

export function previousLocalDateKey(date = new Date()) {
  const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  previous.setDate(previous.getDate() - 1);
  return localDateKey(previous);
}

export function createId(prefix = 'item') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

export function createDefaultState() {
  const now = new Date();
  const dayKey = localDateKey(now);
  const weekKey = localWeekKey(now);
  return {
    version: STATE_VERSION,
    updated_at: now.toISOString(),
    name: 'Student', age: '', studyLevel: 'Middelbare school', profileComplete: false,
    xp: 0, xpBase: 0, xpEvents: [], level: 0, streak: 0, lastStudyDate: null,
    dailyGoalMin: 120, studiedMin: 0, sessionsToday: 0, dayKey,
    weekData: [0, 0, 0, 0, 0, 0, 0], weekKey,
    studyBase: { dayKey, studiedMin: 0, sessionsToday: 0, weekKey, weekData: [0, 0, 0, 0, 0, 0, 0] },
    studyEvents: [],
    tasks: [], notes: [], chatHistory: [], sessionLog: [],
    timerMode: 'pomo', timerSeconds: 1500, timerTotal: 1500,
    timerRunning: false, timerEndsAt: null, timerSessionId: null, timerSubject: 'Wiskunde',
    taskFilter: 'all', theme: 'light'
  };
}

const MODES = { pomo: 1500, short: 600, long: 3000 };
const asArray = value => Array.isArray(value) ? value : [];
const asText = (value, max = 10000) => typeof value === 'string' ? value.slice(0, max) : '';
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const timestamp = value => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

function migrateV1ToV2(state) { return state; }

function migrateV2ToV3(state) {
  const dayKey = asText(state.dayKey, 10) || localDateKey();
  const weekKey = asText(state.weekKey, 10) || localWeekKey();
  const weekData = Array.isArray(state.weekData) && state.weekData.length === 7
    ? state.weekData.map(value => Math.max(0, asNumber(value)))
    : [0, 0, 0, 0, 0, 0, 0];
  return {
    ...state,
    xpBase: Math.max(0, asNumber(state.xpBase, asNumber(state.xp))),
    xpEvents: asArray(state.xpEvents),
    studyBase: state.studyBase && typeof state.studyBase === 'object'
      ? state.studyBase
      : {
          dayKey,
          studiedMin: Math.max(0, asNumber(state.studiedMin)),
          sessionsToday: Math.max(0, asNumber(state.sessionsToday)),
          weekKey,
          weekData
        },
    studyEvents: asArray(state.studyEvents)
  };
}

const MIGRATIONS = { 1: migrateV1ToV2, 2: migrateV2ToV3 };

function migrateState(candidate) {
  let state = { ...candidate };
  let version = Number.isInteger(state.version) && state.version > 0 ? state.version : 1;
  if (version > STATE_VERSION) throw new Error('Deze gegevens zijn gemaakt door een nieuwere versie van Studiemaatje.');
  while (version < STATE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new Error(`Geen migratie beschikbaar voor stateversie ${version}.`);
    state = migrate(state);
    version += 1;
    state.version = version;
  }
  return state;
}

function migrateLegacyItem(item, type) {
  const created = Number(item?.created) || Date.now();
  const createdAt = item?.created_at || new Date(created).toISOString();
  return {
    ...(item && typeof item === 'object' ? item : {}),
    id: asText(item?.id, 80) || createId(type),
    created_at: createdAt,
    updated_at: item?.updated_at || createdAt,
    deleted: Boolean(item?.deleted),
    ...(type === 'task'
      ? { title: asText(item?.title, 300), subject: asText(item?.subject, 80) || 'Algemeen', done: Boolean(item?.done), xpAwarded: Boolean(item?.xpAwarded) }
      : { title: asText(item?.title, 300), body: asText(item?.body) })
  };
}

function migrateSession(item) {
  if (typeof item === 'string') return { id: createId('session'), label: item.slice(0, 300), updated_at: new Date().toISOString() };
  return {
    ...item,
    id: asText(item?.id, 80) || createId('session'),
    label: asText(item?.label, 300),
    updated_at: item?.updated_at || new Date().toISOString()
  };
}

function normalizeXpEvents(events) {
  const byId = new Map();
  asArray(events).forEach(event => {
    const id = asText(event?.id, 160);
    const amount = Math.max(0, asNumber(event?.amount));
    if (!id || !amount) return;
    const current = byId.get(id);
    if (!current) byId.set(id, { id, amount, updated_at: asText(event.updated_at, 40) || new Date().toISOString() });
    else {
      current.amount = Math.max(current.amount, amount);
      if (timestamp(event.updated_at) > timestamp(current.updated_at)) current.updated_at = asText(event.updated_at, 40);
    }
  });
  return [...byId.values()];
}

function normalizeStudyEvents(events) {
  const byId = new Map();
  asArray(events).forEach(event => {
    const id = asText(event?.id, 160);
    const dayKey = asText(event?.dayKey, 10);
    const weekKey = asText(event?.weekKey, 10);
    const minutes = Math.max(0, asNumber(event?.minutes));
    if (!id || !dayKey || !weekKey || !minutes) return;
    const normalized = {
      id,
      dayKey,
      weekKey,
      weekday: Math.max(0, Math.min(6, Math.floor(asNumber(event.weekday)))),
      minutes,
      label: asText(event.label, 300),
      updated_at: asText(event.updated_at, 40) || new Date().toISOString()
    };
    const current = byId.get(id);
    if (!current || timestamp(normalized.updated_at) > timestamp(current.updated_at)) byId.set(id, normalized);
  });
  return [...byId.values()];
}

function normalizeStudyBase(base, state) {
  const weekData = Array.isArray(base?.weekData) && base.weekData.length === 7
    ? base.weekData.map(value => Math.max(0, asNumber(value)))
    : state.weekData;
  return {
    dayKey: asText(base?.dayKey, 10) || state.dayKey,
    studiedMin: Math.max(0, asNumber(base?.studiedMin)),
    sessionsToday: Math.max(0, asNumber(base?.sessionsToday)),
    weekKey: asText(base?.weekKey, 10) || state.weekKey,
    weekData
  };
}

function recalculateStudyTotals(state) {
  const today = state.dayKey;
  const week = state.weekKey;
  const base = state.studyBase;
  const dailyEvents = state.studyEvents.filter(event => event.dayKey === today);
  const weeklyEvents = state.studyEvents.filter(event => event.weekKey === week);
  state.studiedMin = (base.dayKey === today ? base.studiedMin : 0)
    + dailyEvents.reduce((total, event) => total + event.minutes, 0);
  state.sessionsToday = (base.dayKey === today ? base.sessionsToday : 0) + dailyEvents.length;
  state.weekData = base.weekKey === week ? [...base.weekData] : [0, 0, 0, 0, 0, 0, 0];
  weeklyEvents.forEach(event => { state.weekData[event.weekday] += event.minutes; });
}

export function normalizeState(candidate) {
  const input = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const legacy = migrateState(input);
  const next = { ...createDefaultState(), ...legacy };
  next.version = STATE_VERSION;
  next.name = asText(next.name, 80) || 'Student';
  next.age = asText(String(next.age ?? ''), 3);
  next.studyLevel = asText(next.studyLevel, 80) || 'Middelbare school';
  next.xpBase = Math.max(0, asNumber(next.xpBase, asNumber(next.xp)));
  next.xpEvents = normalizeXpEvents(next.xpEvents);
  next.xp = next.xpBase + next.xpEvents.reduce((total, event) => total + event.amount, 0);
  next.level = getLevel(next.xp);
  next.streak = Math.max(0, asNumber(next.streak));
  next.dailyGoalMin = Math.max(5, Math.min(720, asNumber(next.dailyGoalMin, 120) || 120));
  next.dayKey = asText(next.dayKey, 10) || localDateKey();
  next.weekKey = asText(next.weekKey, 10) || localWeekKey();
  next.weekData = Array.isArray(next.weekData) && next.weekData.length === 7
    ? next.weekData.map(value => Math.max(0, asNumber(value)))
    : [0, 0, 0, 0, 0, 0, 0];
  next.studiedMin = Math.max(0, asNumber(next.studiedMin));
  next.sessionsToday = Math.max(0, asNumber(next.sessionsToday));
  next.studyBase = normalizeStudyBase(next.studyBase, next);
  next.studyEvents = normalizeStudyEvents(next.studyEvents);
  next.theme = next.theme === 'dark' ? 'dark' : 'light';
  next.taskFilter = ['all', 'todo', 'done'].includes(next.taskFilter) ? next.taskFilter : 'all';
  next.timerMode = MODES[next.timerMode] ? next.timerMode : 'pomo';
  next.timerTotal = MODES[next.timerMode];
  next.timerSeconds = Math.max(0, Math.min(next.timerTotal, asNumber(next.timerSeconds, next.timerTotal)));
  const hasTimerDeadline = Number.isFinite(Number(next.timerEndsAt)) && Number(next.timerEndsAt) > 0;
  next.timerRunning = Boolean(next.timerRunning && hasTimerDeadline && asText(next.timerSessionId, 160));
  if (!next.timerRunning) { next.timerEndsAt = null; next.timerSessionId = null; }
  next.tasks = asArray(next.tasks).map(item => migrateLegacyItem(item, 'task'));
  next.notes = asArray(next.notes).map(item => migrateLegacyItem(item, 'note'));
  next.chatHistory = asArray(next.chatHistory).map(item => ({
    ...(item && typeof item === 'object' ? item : {}),
    id: asText(item?.id, 80) || createId('chat'),
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: asText(item?.content),
    updated_at: item?.updated_at || new Date().toISOString()
  })).slice(-150);
  next.sessionLog = asArray(next.sessionLog).map(migrateSession).slice(0, 50);
  rolloverDailyState(next);
  return next;
}

export function rolloverDailyState(state, now = new Date()) {
  const today = localDateKey(now);
  const week = localWeekKey(now);
  if (state.dayKey !== today) {
    state.dayKey = today;
    if (state.studyBase.dayKey !== today) {
      state.studyBase.dayKey = today;
      state.studyBase.studiedMin = 0;
      state.studyBase.sessionsToday = 0;
    }
  }
  if (state.weekKey !== week) {
    state.weekKey = week;
    if (state.studyBase.weekKey !== week) {
      state.studyBase.weekKey = week;
      state.studyBase.weekData = [0, 0, 0, 0, 0, 0, 0];
    }
  }
  recalculateStudyTotals(state);
  return state;
}

export function advanceStreak(state, now = new Date()) {
  const today = localDateKey(now);
  const previous = state.lastStudyDate;
  if (previous === today || (previous && previous > today)) return state.streak;
  state.streak = previous === previousLocalDateKey(now) ? state.streak + 1 : 1;
  state.lastStudyDate = today;
  return state.streak;
}

export function getLevel(xp) {
  const thresholds = [0, 200, 500, 1000, 2000, 3500];
  for (let index = thresholds.length - 1; index >= 0; index--) if (xp >= thresholds[index]) return index;
  return 0;
}

export function touch(state) { state.updated_at = new Date().toISOString(); return state; }
