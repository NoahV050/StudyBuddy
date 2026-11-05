export const STATE_VERSION = 2;

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

export function createId(prefix = 'item') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

export function createDefaultState() {
  const now = new Date();
  return {
    version: STATE_VERSION,
    updated_at: new Date().toISOString(),
    name: 'Student', age: '', studyLevel: 'Middelbare school', profileComplete: false,
    xp: 0, level: 0, streak: 0, lastStudyDate: null,
    dailyGoalMin: 120, studiedMin: 0, sessionsToday: 0, dayKey: localDateKey(now),
    weekData: [0, 0, 0, 0, 0, 0, 0], weekKey: localWeekKey(now),
    tasks: [], notes: [], chatHistory: [], sessionLog: [],
    timerMode: 'pomo', timerSeconds: 1500, timerTotal: 1500,
    timerRunning: false, timerEndsAt: null, timerSessionId: null, timerSubject: 'Wiskunde',
    taskFilter: 'all', theme: 'light'
  };
}

const MODES = { pomo: 1500, short: 600, long: 3000 };
const asArray = value => Array.isArray(value) ? value : [];
const asText = (value, max = 10000) => typeof value === 'string' ? value.slice(0, max) : '';

function migrateLegacyItem(item, type) {
  const created = Number(item?.created) || Date.now();
  return {
    id: asText(item?.id, 80) || createId(type),
    created_at: item?.created_at || new Date(created).toISOString(),
    updated_at: item?.updated_at || new Date(created).toISOString(),
    deleted: Boolean(item?.deleted),
    ...(type === 'task'
      ? { title: asText(item?.title, 300), subject: asText(item?.subject, 80) || 'Algemeen', done: Boolean(item?.done), xpAwarded: Boolean(item?.xpAwarded) }
      : { title: asText(item?.title, 300), body: asText(item?.body), })
  };
}

function migrateSession(item) {
  if (typeof item === 'string') return { id: createId('session'), label: item.slice(0, 300), updated_at: new Date().toISOString() };
  return { id: asText(item?.id, 80) || createId('session'), label: asText(item?.label, 300), updated_at: item?.updated_at || new Date().toISOString() };
}

export function normalizeState(candidate) {
  const legacy = candidate && typeof candidate === 'object' ? candidate : {};
  const next = { ...createDefaultState(), ...legacy };
  next.version = STATE_VERSION;
  next.xp = Math.max(0, Number(next.xp) || 0);
  next.level = getLevel(next.xp);
  next.streak = Math.max(0, Number(next.streak) || 0);
  next.dailyGoalMin = Math.max(5, Math.min(720, Number(next.dailyGoalMin) || 120));
  next.studiedMin = Math.max(0, Number(next.studiedMin) || 0);
  next.sessionsToday = Math.max(0, Number(next.sessionsToday) || 0);
  next.theme = next.theme === 'dark' ? 'dark' : 'light';
  next.taskFilter = ['all', 'todo', 'done'].includes(next.taskFilter) ? next.taskFilter : 'all';
  next.timerMode = MODES[next.timerMode] ? next.timerMode : 'pomo';
  next.timerTotal = MODES[next.timerMode];
  next.timerSeconds = Math.max(0, Math.min(next.timerTotal, Number(next.timerSeconds) || next.timerTotal));
  next.timerRunning = Boolean(next.timerRunning && Number(next.timerEndsAt) > Date.now());
  if (!next.timerRunning) { next.timerEndsAt = null; next.timerSessionId = null; }
  next.tasks = asArray(next.tasks).map(item => migrateLegacyItem(item, 'task'));
  next.notes = asArray(next.notes).map(item => migrateLegacyItem(item, 'note'));
  next.chatHistory = asArray(next.chatHistory).map(item => ({ id: asText(item?.id, 80) || createId('chat'), role: item?.role === 'assistant' ? 'assistant' : 'user', content: asText(item?.content), updated_at: item?.updated_at || new Date().toISOString() })).slice(-100);
  next.sessionLog = asArray(next.sessionLog).map(migrateSession).slice(0, 50);
  rolloverDailyState(next);
  return next;
}

export function rolloverDailyState(state, now = new Date()) {
  const today = localDateKey(now);
  if (state.dayKey !== today) { state.dayKey = today; state.studiedMin = 0; state.sessionsToday = 0; }
  const week = localWeekKey(now);
  if (state.weekKey !== week) { state.weekKey = week; state.weekData = [0, 0, 0, 0, 0, 0, 0]; }
  if (!Array.isArray(state.weekData) || state.weekData.length !== 7) state.weekData = [0, 0, 0, 0, 0, 0, 0];
  return state;
}

export function getLevel(xp) {
  const thresholds = [0, 200, 500, 1000, 2000, 3500];
  for (let index = thresholds.length - 1; index >= 0; index--) if (xp >= thresholds[index]) return index;
  return 0;
}

export function touch(state) { state.updated_at = new Date().toISOString(); return state; }
