import { awardXp } from './gamification.js';
import { localDateKey, localWeekKey, touch } from './state.js';

const DAILY_GOALS = [
  { id: 'focus', title: 'Focusminuten', target: 25, reward: 10, unit: 'min' },
  { id: 'tasks', title: 'Rond taken af', target: 2, reward: 10, unit: 'taken' },
  { id: 'cards', title: 'Herhaalkaartjes', target: 3, reward: 10, unit: 'kaartjes' }
];
const WEEKLY_GOALS = [
  { id: 'focus', title: 'Focusminuten', target: 120, reward: 25, unit: 'min' },
  { id: 'tasks', title: 'Rond taken af', target: 5, reward: 25, unit: 'taken' },
  { id: 'cards', title: 'Herhaalkaartjes', target: 5, reward: 25, unit: 'kaartjes' }
];

function challengeProgress(state, id, period, now) {
  const today = localDateKey(now);
  const week = localWeekKey(now);
  if (id === 'focus') {
    const events = state.studyEvents.filter(event =>
      period === 'daily' ? event.dayKey === today : event.weekKey === week
    );
    if (period === 'daily') {
      return (state.studyBase.dayKey === today ? state.studyBase.studiedMin : 0)
        + events.reduce((total, event) => total + event.minutes, 0);
    }
    return (state.studyBase.weekKey === week
      ? state.studyBase.weekData.reduce((total, minutes) => total + minutes, 0)
      : 0) + events.reduce((total, event) => total + event.minutes, 0);
  }
  const start = period === 'daily' ? today : week;
  const isInPeriod = value => {
    const time = Date.parse(value || '');
    if (!Number.isFinite(time)) return false;
    const day = localDateKey(new Date(time));
    return day >= start && day <= today;
  };
  if (id === 'tasks') return state.tasks.filter(task => task.done && !task.deleted && isInPeriod(task.completed_at)).length;
  return state.flashcards.filter(card => !card.deleted && isInPeriod(card.lastReviewedAt)).length;
}

export function getChallenges(state, now = new Date()) {
  const periods = [
    { name: 'daily', key: localDateKey(now), label: 'Vandaag', goals: DAILY_GOALS },
    { name: 'weekly', key: localWeekKey(now), label: 'Deze week', goals: WEEKLY_GOALS }
  ];
  return periods.flatMap(period => period.goals.map(goal => {
    const eventId = `challenge:${period.name}:${period.key}:${goal.id}`;
    return {
      ...goal,
      period: period.name,
      periodKey: period.key,
      periodLabel: period.label,
      progress: Math.min(goal.target, challengeProgress(state, goal.id, period.name, now)),
      claimed: state.xpEvents.some(event => event.id === eventId),
      eventId
    };
  }));
}

export function claimChallenge(state, period, id, now = new Date()) {
  const challenge = getChallenges(state, now).find(item => item.period === period && item.id === id);
  if (!challenge || challenge.progress < challenge.target || challenge.claimed) return false;
  return awardXp(state, challenge.reward, challenge.eventId);
}

export function canUseStreakFreeze(state, now = new Date()) {
  if (!state.streakFreezeCount || !state.lastStudyDate) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return state.lastStudyDate === localDateKey(twoDaysAgo);
}

export function useStreakFreeze(state, now = new Date()) {
  if (!canUseStreakFreeze(state, now)) return false;
  state.streakFreezeCount -= 1;
  state.streakFreezeUsedAt = now.toISOString();
  state.lastStudyDate = localDateKey(now);
  touch(state);
  return true;
}
