import { badges, xpToNext } from './gamification.js';
import { rolloverDailyState } from './state.js';
import { MODES } from './timer.js';

export const byId = id => document.getElementById(id);
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export function renderEmptyState(element, text) {
  element.replaceChildren();
  const message = document.createElement('div');
  message.className = 'empty-state';
  message.textContent = text;
  element.append(message);
}

export function renderTimer(state) {
  byId('timer-display').textContent = formatTime(state.timerSeconds);
  byId('timer-mode-lbl').textContent = MODES[state.timerMode].label;
  byId('timer-arc').style.strokeDashoffset = 515 * (1 - state.timerSeconds / state.timerTotal);
  byId('btn-start').textContent = state.timerRunning ? 'Pauzeer' : state.timerSeconds === state.timerTotal ? 'Start' : 'Hervat';
  Object.keys(MODES).forEach(mode => {
    const button = byId(`mode-${mode}`);
    if (!button) return;
    button.style.background = mode === state.timerMode ? '#534AB7' : '';
    button.style.color = mode === state.timerMode ? '#fff' : '';
  });
}

export function renderTasks(state, toggleTask, deleteTask) {
  const list = byId('task-list');
  const tasks = state.tasks.filter(task =>
    !task.deleted && (state.taskFilter === 'all' || (state.taskFilter === 'done' ? task.done : !task.done))
  );
  if (!tasks.length) return renderEmptyState(list, 'Geen taken hier');
  list.replaceChildren();
  tasks.forEach(task => {
    const row = document.createElement('div');
    row.className = 'task-item';
    const toggle = document.createElement('button');
    toggle.className = `task-check${task.done ? ' done' : ''}`;
    toggle.type = 'button';
    toggle.ariaLabel = task.done ? 'Markeer als niet afgerond' : 'Markeer als afgerond';
    toggle.addEventListener('click', () => toggleTask(task.id));
    const title = document.createElement('div');
    title.className = `task-text${task.done ? ' done' : ''}`;
    title.textContent = task.title;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.textContent = '×';
    remove.ariaLabel = `Verwijder ${task.title}`;
    remove.addEventListener('click', () => deleteTask(task.id));
    row.append(toggle, title, remove);
    list.append(row);
  });
}

export function renderNotes(state, openNoteEditor) {
  const list = byId('notes-list');
  const notes = state.notes.filter(note => !note.deleted);
  if (!notes.length) return renderEmptyState(list, 'Nog geen notities. Tik op “Nieuwe notitie” om te beginnen.');
  list.replaceChildren();
  notes.forEach(note => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'note-card';
    const title = document.createElement('div');
    title.className = 'note-title';
    title.textContent = note.title;
    const preview = document.createElement('div');
    preview.className = 'note-preview';
    preview.textContent = note.body || 'Lege notitie';
    card.append(title, preview);
    card.addEventListener('click', () => openNoteEditor(note.id));
    list.append(card);
  });
}

export function addBubble(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = String(text || '');
  byId('chat-area').append(bubble);
  byId('chat-area').scrollTop = byId('chat-area').scrollHeight;
  return bubble;
}

export function renderChat(state) {
  const area = byId('chat-area');
  area.replaceChildren();
  if (!state.chatHistory.length) return addBubble('ai', 'Hoi! Ik ben je Studiemaatje tutor. Stel gerust een vraag; ik help je stap voor stap.');
  state.chatHistory.forEach(item => addBubble(item.role === 'assistant' ? 'ai' : 'user', item.content));
}

export function renderSessionLog(state) {
  const element = byId('sessions-log');
  element.replaceChildren();
  if (!state.sessionLog?.length) {
    element.textContent = 'Nog geen sessies';
    return;
  }
  state.sessionLog.forEach(session => {
    const item = document.createElement('div');
    item.textContent = session.label;
    element.append(item);
  });
}

export function renderHome(state) {
  rolloverDailyState(state);
  const hour = new Date().getHours();
  byId('greeting').textContent = `${hour < 12 ? 'Goedemorgen' : hour < 17 ? 'Goedemiddag' : 'Goedenavond'}, ${(state.name || 'Student').split(' ')[0]}`;
  byId('home-sub').textContent = state.streak ? `Dag ${state.streak} reeks — ga zo door!` : 'Start vandaag je eerste sessie!';
  byId('streak-num').textContent = state.streak;
  byId('xp-display').textContent = state.xp;
  byId('level-display').textContent = state.studyLevel;
  byId('sessions-today').textContent = state.sessionsToday;
  byId('tasks-done').textContent = state.tasks.filter(task => task.done && !task.deleted).length;
  const percent = Math.min(100, Math.round(state.studiedMin / state.dailyGoalMin * 100));
  byId('goal-bar').style.width = `${percent}%`;
  byId('goal-progress-txt').textContent = `${Math.floor(state.studiedMin / 60) ? `${Math.floor(state.studiedMin / 60)}h ` : ''}${state.studiedMin % 60}m / ${Math.floor(state.dailyGoalMin / 60)}h`;
  const target = byId('upcoming-tasks');
  target.replaceChildren();
  const upcoming = state.tasks.filter(task => !task.deleted && !task.done).slice(0, 3);
  if (!upcoming.length) {
    target.textContent = 'Nog geen taken';
    return;
  }
  upcoming.forEach(task => {
    const row = document.createElement('div');
    row.className = 'task-item';
    row.textContent = task.title;
    target.append(row);
  });
}

export function renderAuth(sync) {
  const loggedIn = Boolean(sync.user);
  byId('auth-status-pill').textContent = sync.mode === 'error' ? 'Sync fout' : loggedIn ? 'Verbonden' : 'Uitgelogd';
  byId('auth-status-pill').className = `pill ${sync.mode === 'error' ? 'pill-coral' : loggedIn ? 'pill-teal' : 'pill-amber'}`;
  byId('auth-status-text').textContent = sync.message;
  byId('signed-in-email').textContent = loggedIn ? `Ingelogd als ${sync.user.email || ''}` : '';
  byId('logout-btn').style.display = loggedIn ? 'block' : 'none';
  byId('signin-btn').style.display = loggedIn ? 'none' : 'block';
  byId('signup-btn').style.display = loggedIn ? 'none' : 'block';
}

export function renderThemeButtons(state) {
  ['light', 'dark'].forEach(theme => byId(`theme-${theme}-btn`)?.classList.toggle('active-theme', state.theme === theme));
}

export function renderProfile(state, sync) {
  byId('profile-name').textContent = state.name;
  byId('avatar-initials').textContent = (state.name || 'S')[0].toUpperCase();
  byId('profile-level-lbl').textContent = `${state.studyLevel} · ${state.xp} XP`;
  byId('profile-meta-lbl').textContent = `Leeftijd ${state.age || '—'}, ${state.studyLevel}`;
  const next = xpToNext(state.xp);
  byId('xp-next-lbl').textContent = `${next.cur} / ${next.needed}`;
  byId('xp-bar').style.width = `${Math.min(100, Math.round(next.cur / Math.max(1, next.needed) * 100))}%`;

  const chart = byId('bar-chart-wrap');
  chart.replaceChildren();
  const days = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  const highest = Math.max(1, ...state.weekData);
  const wrap = document.createElement('div');
  wrap.className = 'bar-chart';
  state.weekData.forEach((minutes, index) => {
    const group = document.createElement('div');
    group.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center';
    const bar = document.createElement('div');
    bar.className = `bar${index === new Date().getDay() ? ' today' : ''}`;
    bar.style.height = `${Math.max(4, Math.round(minutes / highest * 52))}px`;
    bar.style.width = '100%';
    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = days[index];
    group.append(bar, label);
    wrap.append(group);
  });
  chart.append(wrap);

  const grid = byId('badge-grid');
  grid.replaceChildren();
  badges.forEach(([, name, icon, condition]) => {
    const item = document.createElement('div');
    item.className = `badge-item${condition(state) ? ' earned' : ''}`;
    item.textContent = `${icon} ${name}`;
    grid.append(item);
  });
  renderSessionLog(state);
  renderThemeButtons(state);
  renderAuth(sync);
}
