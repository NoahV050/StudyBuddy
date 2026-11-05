export const STATE_VERSION = 5;

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
    streakFreezeCount: 1, streakFreezeUsedAt: '',
    dailyGoalMin: 120, studiedMin: 0, sessionsToday: 0, dayKey,
    weekData: [0, 0, 0, 0, 0, 0, 0], weekKey,
    studyBase: { dayKey, studiedMin: 0, sessionsToday: 0, weekKey, weekData: [0, 0, 0, 0, 0, 0, 0] },
    studyEvents: [],
    tasks: [], notes: [], chatHistory: [], sessionLog: [],
    subjects: [
      { id: 'subject-wiskunde', name: 'Wiskunde', color: '#6750A4', goalMin: 60, examDate: '', deleted: false },
      { id: 'subject-natuurkunde', name: 'Natuurkunde', color: '#2F6F8F', goalMin: 60, examDate: '', deleted: false },
      { id: 'subject-geschiedenis', name: 'Geschiedenis', color: '#A64D32', goalMin: 60, examDate: '', deleted: false },
      { id: 'subject-nederlands', name: 'Nederlands', color: '#32745A', goalMin: 60, examDate: '', deleted: false }
    ],
    flashcards: [], studyPlan: [],
    tutorSubject: 'Wiskunde', tutorMode: 'uitleggen', taskSubject: 'Wiskunde',
    timerMode: 'pomo', timerSeconds: 1500, timerTotal: 1500, timerCustomSeconds: 1500,
    timerRunning: false, timerEndsAt: null, timerSessionId: null, timerSubject: 'Wiskunde', timerTaskId: '',
    taskFilter: 'all', theme: 'light'
  };
}

const MODES = { pomo: 1500, short: 600, long: 3000, custom: 1500 };
const asArray = value => Array.isArray(value) ? value : [];
const asText = (value, max = 10000) => typeof value === 'string' ? value.slice(0, max) : '';
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const timestamp = value => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

function migrateV1ToV2(state) {
  return {
    ...state,
    tutorSubject: asText(state.tutorSubject, 80) || 'Wiskunde',
    tutorMode: asText(state.tutorMode, 40) || 'uitleggen'
  };
}

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

function migrateV3ToV4(state) {
  const subjects = Array.isArray(state.subjects) ? state.subjects : createDefaultState().subjects;
  return {
    ...state,
    xpBase: Number.isFinite(Number(state.xpBase)) ? Number(state.xpBase) : Math.max(0, Number(state.xp) || 0),
    xpEvents: Array.isArray(state.xpEvents) ? state.xpEvents : [],
    subjects,
    flashcards: Array.isArray(state.flashcards) ? state.flashcards : [],
    studyPlan: Array.isArray(state.studyPlan) ? state.studyPlan : [],
    timerCustomSeconds: Math.max(300, Math.min(10800, Number(state.timerCustomSeconds) || 1500)),
    timerTaskId: typeof state.timerTaskId === 'string' ? state.timerTaskId : ''
  };
}

function migrateV4ToV5(state) {
  return {
    ...state,
    streakFreezeCount: Number.isFinite(Number(state.streakFreezeCount))
      ? Math.max(0, Math.floor(Number(state.streakFreezeCount)))
      : 1,
    streakFreezeUsedAt: asText(state.streakFreezeUsedAt, 40)
  };
}

const MIGRATIONS = { 1: migrateV1ToV2, 2: migrateV2ToV3, 3: migrateV3ToV4, 4: migrateV4ToV5 };

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
      ? { title: asText(item?.title, 300), subject: asText(item?.subject, 80) || 'Algemeen', dueDate: /^\d{4}-\d{2}-\d{2}$/.test(item?.dueDate || '') ? item.dueDate : '', done: Boolean(item?.done), completed_at: asText(item?.completed_at, 40), xpAwarded: Boolean(item?.xpAwarded) }
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
      subject: asText(event.subject, 80),
      taskId: asText(event.taskId, 80),
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

function normalizeSubjects(subjects) {
  const byId = new Map();
  asArray(subjects).forEach(item => {
    if (!item || typeof item !== 'object') return;
    const name = asText(item.name, 80);
    if (!name) return;
    const id = asText(item.id, 80) || createId('subject');
    byId.set(id, {
      ...item,
      id,
      name,
      color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#6750A4',
      goalMin: Math.max(5, Math.min(720, asNumber(item.goalMin, 60) || 60)),
      examDate: /^\d{4}-\d{2}-\d{2}$/.test(item.examDate || '') ? item.examDate : '',
      created_at: asText(item.created_at, 40) || new Date().toISOString(),
      updated_at: asText(item.updated_at, 40) || new Date().toISOString(),
      deleted: Boolean(item.deleted)
    });
  });
  return [...byId.values()];
}

function normalizeFlashcards(cards) {
  return asArray(cards).filter(item => item && typeof item === 'object').map(item => ({
    ...item,
    id: asText(item.id, 80) || createId('card'),
    subjectId: asText(item.subjectId, 80),
    front: asText(item.front, 1000),
    back: asText(item.back, 3000),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate || '') ? item.dueDate : localDateKey(),
    intervalDays: Math.max(0, asNumber(item.intervalDays)),
    easeFactor: Math.max(1.3, Math.min(3.5, asNumber(item.easeFactor, 2.5))),
    repetitions: Math.max(0, asNumber(item.repetitions)),
    lapses: Math.max(0, asNumber(item.lapses)),
    created_at: asText(item.created_at, 40) || new Date().toISOString(),
    updated_at: asText(item.updated_at, 40) || new Date().toISOString(),
    lastReviewedAt: asText(item.lastReviewedAt, 40),
    deleted: Boolean(item.deleted)
  })).filter(item => item.front && item.back);
}

function normalizeStudyPlan(items) {
  return asArray(items).filter(item => item && typeof item === 'object').map(item => ({
    ...item,
    id: asText(item.id, 80) || createId('plan'),
    subjectId: asText(item.subjectId, 80),
    date: /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : localDateKey(),
    label: asText(item.label, 300),
    done: Boolean(item.done),
    created_at: asText(item.created_at, 40) || new Date().toISOString(),
    updated_at: asText(item.updated_at, 40) || new Date().toISOString(),
    deleted: Boolean(item.deleted)
  })).filter(item => item.label);
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
  next.streakFreezeCount = Math.max(0, Math.floor(asNumber(next.streakFreezeCount, 1)));
  next.streakFreezeUsedAt = asText(next.streakFreezeUsedAt, 40);
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
  next.timerCustomSeconds = Math.max(300, Math.min(10800, asNumber(next.timerCustomSeconds, 1500)));
  next.timerTotal = next.timerMode === 'custom' ? next.timerCustomSeconds : MODES[next.timerMode];
  next.timerSeconds = Math.max(0, Math.min(next.timerTotal, asNumber(next.timerSeconds, next.timerTotal)));
  const hasTimerDeadline = Number.isFinite(Number(next.timerEndsAt)) && Number(next.timerEndsAt) > 0;
  next.timerRunning = Boolean(next.timerRunning && hasTimerDeadline && asText(next.timerSessionId, 160));
  if (!next.timerRunning) { next.timerEndsAt = null; next.timerSessionId = null; next.timerTaskId = ''; }
  next.tasks = asArray(next.tasks).map(item => migrateLegacyItem(item, 'task'));
  next.notes = asArray(next.notes).map(item => migrateLegacyItem(item, 'note'));
  next.tutorSubject = asText(next.tutorSubject, 80) || 'Wiskunde';
  next.tutorMode = ['uitleggen', 'overhoren', 'samenvatten', 'huiswerk', 'examen'].includes(next.tutorMode) ? next.tutorMode : 'uitleggen';
  next.chatHistory = asArray(next.chatHistory).map(item => ({
    ...(item && typeof item === 'object' ? item : {}),
    id: asText(item?.id, 80) || createId('chat'),
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: asText(item?.content),
    subject: asText(item?.subject, 80) || 'Algemeen',
    mode: asText(item?.mode, 40) || 'uitleggen',
    updated_at: item?.updated_at || new Date().toISOString()
  })).slice(-150);
  next.sessionLog = asArray(next.sessionLog).map(migrateSession).slice(0, 50);
  next.subjects = normalizeSubjects(next.subjects);
  next.taskSubject = asText(next.taskSubject, 80) || 'Wiskunde';
  next.flashcards = normalizeFlashcards(next.flashcards);
  next.studyPlan = normalizeStudyPlan(next.studyPlan);
  const knownSubjects = new Set(next.subjects.map(subject => subject.name.toLocaleLowerCase('nl')));
  const referencedSubjects = [
    ...next.tasks.map(item => item.subject),
    ...next.sessionLog.map(item => item.label.split(' · ')[0])
  ];
  referencedSubjects.forEach(name => {
    const cleanName = asText(name, 80);
    if (!cleanName || knownSubjects.has(cleanName.toLocaleLowerCase('nl'))) return;
    const id = `subject-${cleanName.toLocaleLowerCase('nl').replace(/[^a-z0-9]+/g, '-')}`;
    next.subjects.push({
      id,
      name: cleanName,
      color: '#6750A4',
      goalMin: 60,
      examDate: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted: false
    });
    knownSubjects.add(cleanName.toLocaleLowerCase('nl'));
  });
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
