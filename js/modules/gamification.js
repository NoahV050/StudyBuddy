import { createId, getLevel, touch } from './state.js';

const LEVELS = ['Beginner', 'Gevorderd', 'Ervaren', 'Expert', 'Gespecialiseerd', 'Meester'];
const THRESHOLDS = [0, 200, 500, 1000, 2000, 3500];
export const badges = [
  ['first_session', 'Eerste sessie', '★', state => state.sessionLog.length > 0, 'Rond je eerste focussessie af.'],
  ['streak3', '3 dagen reeks', '🔥', state => state.streak >= 3, 'Studeer op drie opeenvolgende lokale kalenderdagen.'],
  ['xp100', '100 XP', '✦', state => state.xp >= 100, 'Verzamel 100 XP met studeren en oefenen.'],
  ['tasks5', '5 taken klaar', '✓', state => state.tasks.filter(task => task.done && !task.deleted).length >= 5, 'Rond vijf taken af.'],
  ['xp500', '500 XP', '✧', state => state.xp >= 500, 'Verzamel 500 XP met studeren en oefenen.'],
  ['streak7', 'Week reeks', '7', state => state.streak >= 7, 'Studeer op zeven opeenvolgende lokale kalenderdagen.'],
  ['notes3', '3 notities', 'N', state => state.notes.filter(note => !note.deleted).length >= 3, 'Bewaar drie notities.'],
  ['ask_ai', 'AI-student', 'AI', state => state.chatHistory.length > 0, 'Stel je tutor een vraag.']
];
export function awardXp(state, amount, eventId = createId('xp')) {
  const points = Math.max(0, Number(amount) || 0);
  if (!points || state.xpEvents.some(event => event.id === eventId)) return false;
  state.xpEvents.push({ id: eventId, amount: points, updated_at: new Date().toISOString() });
  state.xp = state.xpBase + state.xpEvents.reduce((total, event) => total + event.amount, 0);
  state.level = getLevel(state.xp);
  touch(state);
  return true;
}
export function levelName(xp) { return LEVELS[getLevel(xp)] || 'Meester'; }
export function xpToNext(xp) { const level = getLevel(xp); return level >= THRESHOLDS.length - 1 ? { cur: xp, needed: xp } : { cur: xp - THRESHOLDS[level], needed: THRESHOLDS[level + 1] - THRESHOLDS[level] }; }
