import { dueFlashcards, getStudyStats, getTodayPlan } from './learning.js';
import { getChallenges } from './challenges.js';
import { localDateKey } from './state.js';
import { byId } from './ui.js';

function fillSubjectSelect(select, subjects, selectedName) {
  const active = subjects.filter(subject => !subject.deleted);
  const selectedSubject = active.find(subject => subject.name === selectedName);
  select.replaceChildren();
  active.forEach(subject => {
    const option = document.createElement('option');
    option.value = subject.name;
    option.textContent = subject.name;
    select.append(option);
  });
  if (active.some(subject => subject.name === selectedName)) select.value = selectedName;
  return selectedSubject || active[0];
}

export function renderLearning(state, selectedSubjectId, revealed) {
  const selects = ['learn-subject-select', 'focus-subject', 'ai-subject', 'task-subject']
    .map(byId)
    .filter(Boolean);
  const activeSubjects = state.subjects.filter(subject => !subject.deleted);
  const selectedSubject = activeSubjects.find(subject => subject.id === selectedSubjectId) || activeSubjects[0];
  selects.forEach(select => {
    const selectedName = {
      'learn-subject-select': selectedSubject?.name,
      'focus-subject': state.timerSubject,
      'ai-subject': state.tutorSubject,
      'task-subject': state.taskSubject
    }[select.id];
    fillSubjectSelect(select, activeSubjects, selectedName || selectedSubject?.name);
  });
  const taskSelect = byId('focus-task');
  if (taskSelect) {
    taskSelect.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Geen taak gekoppeld';
    taskSelect.append(none);
    state.tasks.filter(task => !task.deleted && !task.done).forEach(task => {
      const option = document.createElement('option');
      option.value = task.id;
      option.textContent = task.title;
      taskSelect.append(option);
    });
    taskSelect.value = state.timerTaskId || '';
  }

  const subjectList = byId('subjects-list');
  subjectList.replaceChildren();
  activeSubjects.forEach(subject => {
    const row = document.createElement('div');
    row.className = 'subject-row';
    const swatch = document.createElement('span');
    swatch.className = 'subject-swatch';
    swatch.style.backgroundColor = subject.color;
    const info = document.createElement('div');
    info.className = 'subject-info';
    const title = document.createElement('strong');
    title.textContent = subject.name;
    const meta = document.createElement('span');
    meta.textContent = `${subject.goalMin} min doel${subject.examDate ? ` · toets ${subject.examDate}` : ''}`;
    info.append(title, meta);
    row.append(swatch, info);
    subjectList.append(row);
  });

  const stats = getStudyStats(state, 7);
  byId('learning-week-total').textContent = `${Math.floor(stats.totalMinutes / 60)}u ${stats.totalMinutes % 60}m deze week`;
  const statsList = byId('subject-stats');
  statsList.replaceChildren();
  stats.subjectTotals.slice(0, 5).forEach(item => {
    const row = document.createElement('div');
    row.className = 'learning-stat';
    const name = document.createElement('span');
    name.textContent = item.subject;
    const value = document.createElement('strong');
    value.textContent = `${item.minutes} min`;
    row.append(name, value);
    statsList.append(row);
  });
  if (!stats.subjectTotals.length) statsList.textContent = 'Je sessiestatistieken verschijnen hier.';

  const challengeList = byId('challenge-list');
  challengeList.replaceChildren();
  getChallenges(state).forEach(challenge => {
    const row = document.createElement('div');
    row.className = 'challenge-item';
    const heading = document.createElement('div');
    heading.className = 'challenge-heading';
    const title = document.createElement('strong');
    title.textContent = `${challenge.periodLabel} · ${challenge.title}`;
    const progressText = document.createElement('span');
    progressText.textContent = `${challenge.progress}/${challenge.target} ${challenge.unit}`;
    heading.append(title, progressText);
    const progress = document.createElement('div');
    progress.className = 'challenge-progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', `${challenge.periodLabel}: ${challenge.title}`);
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', String(challenge.target));
    progress.setAttribute('aria-valuenow', String(challenge.progress));
    const fill = document.createElement('span');
    fill.style.width = `${Math.round(challenge.progress / challenge.target * 100)}%`;
    progress.append(fill);
    row.append(heading, progress);
    if (challenge.progress >= challenge.target || challenge.claimed) {
      const claim = document.createElement('button');
      claim.type = 'button';
      claim.className = 'btn btn-sm challenge-claim';
      claim.textContent = challenge.claimed ? 'XP ontvangen' : `Ontvang ${challenge.reward} XP`;
      claim.disabled = challenge.claimed;
      claim.setAttribute('aria-label', `${challenge.claimed ? 'XP al ontvangen' : 'Ontvang'} voor ${challenge.periodLabel.toLocaleLowerCase('nl')} ${challenge.title}`);
      if (!challenge.claimed) claim.addEventListener('click', () => window.claimChallenge(challenge.period, challenge.id));
      row.append(claim);
    }
    challengeList.append(row);
  });

  const planList = byId('today-plan-list');
  planList.replaceChildren();
  const todayPlan = getTodayPlan(state);
  if (!todayPlan.length) {
    planList.textContent = 'Je planning is leeg. Voeg een taak of toetsplan toe.';
  } else {
    todayPlan.forEach(item => {
      const row = document.createElement('div');
      row.className = 'learning-stat';
      const label = document.createElement('span');
      label.textContent = item.label;
      row.append(label);
      if (item.type === 'plan') {
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'btn btn-sm';
        done.textContent = 'Klaar';
        done.setAttribute('data-plan-id', item.id);
        done.addEventListener('click', () => window.completePlannedItem(item.id));
        row.append(done);
      }
      planList.append(row);
    });
  }

  const scheduleList = byId('study-schedule-list');
  scheduleList.replaceChildren();
  const upcoming = state.studyPlan
    .filter(item => !item.deleted && !item.done && item.date > localDateKey())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);
  if (!upcoming.length) {
    scheduleList.textContent = 'Je hebt nog geen toekomstige studiesessies gepland.';
  } else {
    upcoming.forEach(item => {
      const row = document.createElement('div');
      row.className = 'learning-stat';
      const label = document.createElement('span');
      const subject = activeSubjects.find(candidate => candidate.id === item.subjectId);
      label.textContent = `${item.date} · ${subject?.name || 'Vak'} · ${item.label}`;
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'btn btn-sm';
      done.textContent = 'Klaar';
      done.addEventListener('click', () => window.completePlannedItem(item.id));
      row.append(label, done);
      scheduleList.append(row);
    });
  }

  const cards = dueFlashcards(state, selectedSubject?.id);
  const front = byId('flashcard-front');
  const back = byId('flashcard-back');
  const reveal = byId('flashcard-reveal');
  const actions = byId('flashcard-actions');
  const count = byId('flashcard-due-count');
  count.textContent = `${cards.length} klaar om te herhalen`;
  const card = cards[0];
  if (!card) {
    front.textContent = 'Geen kaartjes die vandaag herhaald moeten worden.';
    back.textContent = '';
    reveal.hidden = true;
    actions.hidden = true;
  } else {
    front.textContent = card.front;
    front.dataset.cardId = card.id;
    back.textContent = card.back;
    back.hidden = !revealed;
    reveal.hidden = revealed;
    actions.hidden = !revealed;
  }
}
