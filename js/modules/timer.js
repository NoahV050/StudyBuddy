import { advanceStreak, createId, localDateKey, localWeekKey, rolloverDailyState, touch } from './state.js';

export const MODES = { pomo: { seconds: 1500, label: 'Focus' }, short: { seconds: 600, label: 'Korte focus' }, long: { seconds: 3000, label: 'Diepe focus' } };
export function setMode(state, mode) { if (state.timerRunning || !MODES[mode]) return false; state.timerMode = mode; state.timerTotal = MODES[mode].seconds; state.timerSeconds = MODES[mode].seconds; touch(state); return true; }
export function startTimer(state, subject) { if (state.timerRunning) return false; state.timerRunning = true; state.timerSubject = subject || 'Algemeen'; state.timerSessionId = createId('timer'); state.timerEndsAt = Date.now() + state.timerSeconds * 1000; touch(state); return true; }
export function pauseTimer(state) { if (!state.timerRunning) return false; state.timerSeconds = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000)); state.timerRunning = false; state.timerEndsAt = null; touch(state); return true; }
export function resetTimer(state) { state.timerRunning = false; state.timerEndsAt = null; state.timerSessionId = null; state.timerTotal = MODES[state.timerMode].seconds; state.timerSeconds = state.timerTotal; touch(state); }
export function reconcileTimer(state) { if (!state.timerRunning) return { completed: false }; const seconds = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000)); state.timerSeconds = seconds; if (seconds > 0) return { completed: false }; const sessionId = state.timerSessionId; state.timerRunning = false; state.timerEndsAt = null; state.timerSessionId = null; touch(state); return { completed: Boolean(sessionId), sessionId }; }
export function completeTimer(state, sessionId = state.timerSessionId || createId('session'), now = new Date()) {
  const minutes = Math.round(state.timerTotal / 60);
  if (state.studyEvents.some(event => event.id === sessionId)) {
    return { minutes, subject: state.timerSubject, completed: false, sessionId };
  }
  rolloverDailyState(state, now);
  const dayKey = localDateKey(now);
  const weekKey = localWeekKey(now);
  const weekday = now.getDay();
  const label = `${state.timerSubject} · ${minutes} min`;
  const updatedAt = now.toISOString();
  state.studyEvents.push({ id: sessionId, dayKey, weekKey, weekday, minutes, label, updated_at: updatedAt });
  state.sessionLog.unshift({ id: sessionId, label, updated_at: updatedAt });
  state.sessionLog = state.sessionLog.slice(0, 50);
  advanceStreak(state, now);
  rolloverDailyState(state, now);
  touch(state);
  return { minutes, subject: state.timerSubject, completed: true, sessionId };
}
