import { createId, localDateKey, touch } from './state.js';

export const DEFAULT_SUBJECTS = [
  ['Wiskunde', '#6750A4'],
  ['Natuurkunde', '#2F6F8F'],
  ['Geschiedenis', '#A64D32'],
  ['Nederlands', '#32745A']
];

const nowIso = () => new Date().toISOString();
const asText = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());

export function addSubject(state, name, { color = '#6750A4', goalMin = 60 } = {}) {
  const cleanName = asText(name, 80);
  if (!cleanName) return null;
  const existing = state.subjects.find(subject => !subject.deleted && subject.name.toLocaleLowerCase('nl') === cleanName.toLocaleLowerCase('nl'));
  if (existing) return existing;
  const timestamp = nowIso();
  const subject = {
    id: createId('subject'),
    name: cleanName,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#6750A4',
    goalMin: Math.max(5, Math.min(720, Number(goalMin) || 60)),
    examDate: '',
    created_at: timestamp,
    updated_at: timestamp,
    deleted: false
  };
  state.subjects.unshift(subject);
  touch(state);
  return subject;
}

export function updateSubject(state, id, updates = {}) {
  const subject = state.subjects.find(item => item.id === id && !item.deleted);
  if (!subject) return null;
  if (typeof updates.name === 'string' && updates.name.trim()) subject.name = asText(updates.name, 80);
  if (typeof updates.color === 'string' && /^#[0-9a-f]{6}$/i.test(updates.color)) subject.color = updates.color;
  if (updates.goalMin !== undefined) subject.goalMin = Math.max(5, Math.min(720, Number(updates.goalMin) || 60));
  if (updates.examDate !== undefined) subject.examDate = isDateKey(updates.examDate) ? updates.examDate : '';
  subject.updated_at = nowIso();
  touch(state);
  return subject;
}

export function addFlashcard(state, subjectId, front, back) {
  const subject = state.subjects.find(item => item.id === subjectId && !item.deleted);
  const cleanFront = asText(front, 1000);
  const cleanBack = asText(back, 3000);
  if (!subject || !cleanFront || !cleanBack) return null;
  const timestamp = nowIso();
  const card = {
    id: createId('card'),
    subjectId,
    front: cleanFront,
    back: cleanBack,
    dueDate: localDateKey(),
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
    created_at: timestamp,
    updated_at: timestamp,
    deleted: false
  };
  state.flashcards.unshift(card);
  touch(state);
  return card;
}

export function dueFlashcards(state, subjectId = '', now = new Date(), limit = 20) {
  const today = localDateKey(now);
  return state.flashcards
    .filter(card => !card.deleted && (!subjectId || card.subjectId === subjectId) && card.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.created_at.localeCompare(b.created_at))
    .slice(0, Math.max(0, limit));
}

export function reviewFlashcard(state, cardId, quality, now = new Date()) {
  const card = state.flashcards.find(item => item.id === cardId && !item.deleted);
  if (!card) return null;
  const score = Math.max(0, Math.min(5, Math.floor(Number(quality))));
  const gap = 5 - score;
  card.easeFactor = Math.max(1.3, card.easeFactor + (0.1 - gap * (0.08 + gap * 0.02)));
  if (score < 3) {
    card.repetitions = 0;
    card.intervalDays = 1;
    card.lapses += 1;
  } else {
    card.repetitions += 1;
    card.intervalDays = card.repetitions === 1 ? 1 : card.repetitions === 2 ? 6 : Math.round(card.intervalDays * card.easeFactor);
  }
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  due.setDate(due.getDate() + card.intervalDays);
  card.dueDate = localDateKey(due);
  card.updated_at = nowIso();
  touch(state);
  return card;
}

export function createExamPlan(state, subjectId, examDate, topics = '', now = new Date()) {
  const subject = state.subjects.find(item => item.id === subjectId && !item.deleted);
  if (!subject || !isDateKey(examDate)) return [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exam = new Date(`${examDate}T12:00:00`);
  const daysUntil = Math.round(
    (Date.UTC(exam.getFullYear(), exam.getMonth(), exam.getDate())
      - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000
  );
  if (daysUntil < 1 || daysUntil > 365) return [];
  const topicList = String(topics || '').split(/\r?\n/).map(topic => asText(topic, 120)).filter(Boolean);
  const sessions = Math.min(daysUntil, 30, Math.max(topicList.length, Math.ceil(daysUntil / 2)));
  const plan = [];
  for (let index = 0; index < sessions; index += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() + Math.floor(((index + 1) * daysUntil) / (sessions + 1)));
    const topic = topicList[index % Math.max(1, topicList.length)];
    plan.push({
      id: createId('plan'),
      subjectId,
      date: localDateKey(date),
      label: topic ? `Herhaal: ${topic}` : 'Herhaal de kern en maak oefenvragen',
      done: false,
      created_at: nowIso(),
      updated_at: nowIso(),
      deleted: false
    });
  }
  state.studyPlan = [...plan, ...state.studyPlan];
  updateSubject(state, subjectId, { examDate });
  touch(state);
  return plan;
}

export function getTodayPlan(state, now = new Date()) {
  const today = localDateKey(now);
  const tasks = state.tasks
    .filter(task => !task.deleted && !task.done && (!task.dueDate || task.dueDate <= today))
    .map(task => ({ id: task.id, label: task.title, type: 'task', date: task.dueDate || today }));
  const planned = state.studyPlan
    .filter(item => !item.deleted && !item.done && item.date <= today)
    .map(item => ({ id: item.id, label: item.label, type: 'plan', date: item.date }));
  return [...planned, ...tasks].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}

export function completePlanItem(state, id, now = new Date()) {
  const item = state.studyPlan.find(candidate => candidate.id === id && !candidate.deleted);
  if (!item) return false;
  item.done = true;
  item.updated_at = now.toISOString();
  touch(state);
  return true;
}

export function getStudyStats(state, days = 7, now = new Date()) {
  const totalsByDay = new Map();
  const totalsBySubject = new Map();
  const todayKey = localDateKey(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.max(0, days - 1));
  const startKey = localDateKey(start);
  const events = state.studyEvents.filter(event => {
    return event.dayKey >= startKey && event.dayKey <= todayKey;
  });
  events.forEach(event => {
    totalsByDay.set(event.dayKey, (totalsByDay.get(event.dayKey) || 0) + event.minutes);
    const labelSubject = event.subject || event.label.split(' · ')[0] || 'Algemeen';
    totalsBySubject.set(labelSubject, (totalsBySubject.get(labelSubject) || 0) + event.minutes);
  });
  const dayTotals = Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - index - 1));
    const key = localDateKey(date);
    return { date: key, minutes: totalsByDay.get(key) || 0 };
  });
  return {
    totalMinutes: dayTotals.reduce((total, day) => total + day.minutes, 0),
    dayTotals,
    subjectTotals: [...totalsBySubject.entries()]
      .map(([subject, minutes]) => ({ subject, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
  };
}
