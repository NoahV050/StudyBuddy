import { getLevel, touch } from './state.js';

const LEVELS = ['Beginner', 'Gevorderd', 'Ervaren', 'Expert', 'Gespecialiseerd', 'Meester'];
const THRESHOLDS = [0, 200, 500, 1000, 2000, 3500];
export const badges = [
  ['first_session', 'Eerste sessie', '★', state => state.sessionLog.length > 0], ['streak3', '3 dagen reeks', '🔥', state => state.streak >= 3],
  ['xp100', '100 XP', '✦', state => state.xp >= 100], ['tasks5', '5 taken klaar', '✓', state => state.tasks.filter(task => task.done).length >= 5],
  ['xp500', '500 XP', '✧', state => state.xp >= 500], ['streak7', 'Week reeks', '7', state => state.streak >= 7],
  ['notes3', '3 notities', 'N', state => state.notes.filter(note => !note.deleted).length >= 3], ['ask_ai', 'AI-student', 'AI', state => state.chatHistory.length > 0]
];
export function awardXp(state, amount) { state.xp += Math.max(0, amount); state.level = getLevel(state.xp); touch(state); }
export function levelName(xp) { return LEVELS[getLevel(xp)] || 'Meester'; }
export function xpToNext(xp) { const level = getLevel(xp); return level >= THRESHOLDS.length - 1 ? { cur: xp, needed: xp } : { cur: xp - THRESHOLDS[level], needed: THRESHOLDS[level + 1] - THRESHOLDS[level] }; }
