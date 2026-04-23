function createDefaultState() {
  return {
    name: 'Student',
    age: '',
    studyLevel: 'Middelbare school',
    profileComplete: false,
    xp: 0,
    level: 0,
    streak: 0,
    lastStudyDate: null,
    dailyGoalMin: 120,
    studiedMin: 0,
    sessionsToday: 0,
    weekData: [0, 0, 0, 0, 0, 0, 0],
    tasks: [],
    notes: [],
    apiKey: '',
    chatHistory: [],
    timerRunning: false,
    timerMode: 'pomo',
    timerSeconds: 1500,
    timerTotal: 1500,
    timerPhase: 'work',
    timerInterval: null,
    taskFilter: 'all',
    editingNoteIdx: -1,
    theme: 'light'
  };
}

var state = createDefaultState();
var currentNote = { title: '', body: '' };
var currentUser = null;
var supabaseClient = null;
var authMode = 'signup';
var remoteSaveTimer = null;
var isHydratingRemoteState = false;
var pendingGuestMigration = false;
var syncState = 'guest';
var syncMessage = 'Je gegevens staan nu alleen op dit apparaat.';

var LEVELS = ['Beginner', 'Gevorderd', 'Ervaring', 'Expert', 'Gespecialiseerd', 'Meester'];
var LEVEL_XP = [0, 200, 500, 1000, 2000, 3500];
var GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
var MODES = {
  pomo: { s: 1500, label: 'Focus' },
  short: { s: 600, label: 'Focus' },
  long: { s: 3000, label: 'Diep focus' }
};
var BADGES = [
  { id: 'first_session', name: 'Eerste sessie', icon: '>', cond: function() { return state.sessionsToday >= 1 || state.xp >= 50; } },
  { id: 'streak3', name: '3 dagen reeks', icon: '*', cond: function() { return state.streak >= 3; } },
  { id: 'xp100', name: '100 XP', icon: '*', cond: function() { return state.xp >= 100; } },
  { id: 'tasks5', name: '5 taken klaar', icon: '+', cond: function() { return state.tasks.filter(function(t) { return t.done; }).length >= 5; } },
  { id: 'xp500', name: '500 XP', icon: '#', cond: function() { return state.xp >= 500; } },
  { id: 'streak7', name: 'Week reeks', icon: '7', cond: function() { return state.streak >= 7; } },
  { id: 'notes3', name: '3 notities', icon: 'N', cond: function() { return state.notes.length >= 3; } },
  { id: 'ask_ai', name: 'AI student', icon: 'AI', cond: function() { return state.chatHistory.length > 0; } }
];
var SUPABASE_CONFIG = window.STUDY_BUDDY_CONFIG || {};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function var_purple() { return '#534AB7'; }

function getLevel(xp) {
  for (var i = LEVEL_XP.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP[i]) return i;
  }
  return 0;
}

function getLevelName(xp) {
  return LEVELS[getLevel(xp)] || 'Meester';
}

function xpToNext(xp) {
  var level = getLevel(xp);
  if (level >= LEVELS.length - 1) return { cur: xp, needed: xp };
  return { cur: xp - LEVEL_XP[level], needed: LEVEL_XP[level + 1] - LEVEL_XP[level] };
}

function getLocalStorageKey(user) {
  return user && user.id ? 'sb_state_user_' + user.id : 'sb_state_guest';
}

function getGuestState() {
  try {
    var raw = localStorage.getItem(getLocalStorageKey(null));
    return raw ? Object.assign(createDefaultState(), JSON.parse(raw)) : createDefaultState();
  } catch (e) {
    return createDefaultState();
  }
}

function hasMeaningfulProgress(candidate) {
  if (!candidate) return false;
  return !!(
    candidate.xp > 0 ||
    candidate.streak > 0 ||
    candidate.studiedMin > 0 ||
    candidate.sessionsToday > 0 ||
    (candidate.tasks && candidate.tasks.length) ||
    (candidate.notes && candidate.notes.length) ||
    (candidate.chatHistory && candidate.chatHistory.length) ||
    (candidate.name && candidate.name !== 'Student') ||
    candidate.profileComplete
  );
}

function normalizeState(candidate) {
  var next = Object.assign(createDefaultState(), candidate || {});
  if (!Array.isArray(next.weekData) || next.weekData.length !== 7) next.weekData = [0, 0, 0, 0, 0, 0, 0];
  if (!Array.isArray(next.tasks)) next.tasks = [];
  if (!Array.isArray(next.notes)) next.notes = [];
  if (!Array.isArray(next.chatHistory)) next.chatHistory = [];
  next.timerInterval = null;
  next.timerRunning = false;
  next.editingNoteIdx = -1;
  next.taskFilter = next.taskFilter || 'all';
  next.timerMode = MODES[next.timerMode] ? next.timerMode : 'pomo';
  next.timerTotal = MODES[next.timerMode].s;
  next.timerSeconds = Math.min(Math.max(parseInt(next.timerSeconds, 10) || MODES[next.timerMode].s, 0), next.timerTotal);
  next.theme = next.theme === 'dark' ? 'dark' : 'light';
  next.level = getLevel(next.xp || 0);
  next.profileComplete = !!(next.profileComplete && next.name && next.name !== 'Student');
  return next;
}

function getLocalStatePayload() {
  var payload = clone(state);
  payload.timerInterval = null;
  payload.timerRunning = false;
  payload.editingNoteIdx = -1;
  return payload;
}

function getRemoteStatePayload() {
  var payload = getLocalStatePayload();
  payload.apiKey = '';
  return payload;
}

function loadLocalState(user) {
  try {
    var raw = localStorage.getItem(getLocalStorageKey(user));
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

function persistLocalState() {
  try {
    localStorage.setItem(getLocalStorageKey(currentUser), JSON.stringify(getLocalStatePayload()));
  } catch (e) {}
}

function setState(nextState) {
  state = normalizeState(nextState);
  applyTheme();
}

function scheduleRemoteSave() {
  if (!currentUser || !supabaseClient || isHydratingRemoteState) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(function() {
    saveRemoteState();
  }, 500);
}

function save() {
  persistLocalState();
  scheduleRemoteSave();
}

function setSyncStatus(mode, message) {
  syncState = mode;
  syncMessage = message || syncMessage;
  updateAuthUI();
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2200);
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme === 'dark' ? 'dark' : 'light');
}

function updateThemeButtons() {
  var lightBtn = document.getElementById('theme-light-btn');
  var darkBtn = document.getElementById('theme-dark-btn');
  var landingLightBtn = document.getElementById('landing-theme-light-btn');
  var landingDarkBtn = document.getElementById('landing-theme-dark-btn');
  [lightBtn, landingLightBtn].forEach(function(btn) {
    if (btn) btn.classList.toggle('active-theme', state.theme === 'light');
  });
  [darkBtn, landingDarkBtn].forEach(function(btn) {
    if (btn) btn.classList.toggle('active-theme', state.theme === 'dark');
  });
}

function setTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  applyTheme();
  updateThemeButtons();
  save();
}

function updateGoalSelection() {
  document.querySelectorAll('.goal-btn').forEach(function(btn) {
    var active = parseInt(btn.dataset.val, 10) === state.dailyGoalMin;
    btn.classList.toggle('active-goal', active);
    btn.style.background = active ? var_purple() : '';
    btn.style.color = active ? '#fff' : '';
    btn.style.borderColor = active ? var_purple() : '';
  });
}

function selectGoal(btn) {
  state.dailyGoalMin = parseInt(btn.dataset.val, 10);
  updateGoalSelection();
  save();
}

function renderChatHistory() {
  var area = document.getElementById('chat-area');
  if (!area) return;
  area.innerHTML = '';
  if (!state.chatHistory.length) {
    addBubble('ai', 'Hoi! Ik ben je Studiemaatje tutor. Stel me gerust een vraag - ik help je stap voor stap, niet alleen met het antwoord.');
    return;
  }
  state.chatHistory.forEach(function(item) {
    addBubble(item.role === 'assistant' ? 'ai' : 'user', item.content);
  });
}

function renderSessionLog() {
  var log = document.getElementById('sessions-log');
  if (!log) return;
  if (!state.sessionLog || !state.sessionLog.length) {
    log.textContent = 'Nog geen sessies';
    return;
  }
  log.innerHTML = state.sessionLog.map(function(item) {
    return '<div style="font-size:12px;padding:4px 0;border-bottom:0.5px solid var(--color-border-tertiary)">' + esc(item) + '</div>';
  }).join('');
}

function getActiveTabName() {
  var activeTab = document.querySelector('.tab-item.active');
  return activeTab ? activeTab.id.replace('tab-', '') : 'home';
}

function isOnboarded() {
  return !!state.profileComplete;
}

function showAuthLanding() {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('pg-auth-landing').classList.add('active');
  document.getElementById('tab-bar').style.display = 'none';
}

function showProfileSetup() {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('pg-profile-setup').classList.add('active');
  document.getElementById('tab-bar').style.display = 'none';
  document.getElementById('ob-name').value = state.name && state.name !== 'Student' ? state.name : '';
  document.getElementById('ob-age').value = state.age || '';
  document.getElementById('ob-level').value = state.studyLevel || 'Middelbare school';
  updateGoalSelection();
}

function editProfile() {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('pg-profile-setup').classList.add('active');
  document.getElementById('tab-bar').style.display = 'none';
  document.getElementById('ob-name').value = state.name && state.name !== 'Student' ? state.name : '';
  document.getElementById('ob-age').value = state.age || '';
  document.getElementById('ob-level').value = state.studyLevel || 'Middelbare school';
  updateGoalSelection();
}

function ensureAppShell() {
  if (!currentUser) {
    showAuthLanding();
    return;
  }
  if (!isOnboarded()) {
    showProfileSetup();
    return;
  }
  document.getElementById('pg-auth-landing').classList.remove('active');
  document.getElementById('pg-profile-setup').classList.remove('active');
  document.getElementById('tab-bar').style.display = 'flex';
  var tab = getActiveTabName();
  goTo(tab && tab !== 'auth-landing' && tab !== 'profile-setup' ? tab : 'home');
}

function renderAll() {
  applyTheme();
  updateGoalSelection();
  updateTimerDisplay();
  renderTasks();
  renderNotes();
  renderChatHistory();
  updateHome();
  updateProfile();
  ensureAppShell();
}

function goTo(tab) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-item').forEach(function(t) { t.classList.remove('active'); });
  var pg = document.getElementById('pg-' + tab);
  var tb = document.getElementById('tab-' + tab);
  if (pg) pg.classList.add('active');
  if (tb) tb.classList.add('active');
  if (tab === 'home') updateHome();
  if (tab === 'tasks') renderTasks();
  if (tab === 'notes') renderNotes();
  if (tab === 'profile') updateProfile();
  if (tab === 'ai') renderChatHistory();
}

function finishOnboard() {
  var name = document.getElementById('ob-name').value.trim() || 'Student';
  var age = document.getElementById('ob-age').value.trim();
  var studyLevel = document.getElementById('ob-level').value || 'Middelbare school';
  if (!name || name === 'Student') {
    showToast('Voeg eerst je naam toe');
    return;
  }
  state.name = name;
  state.age = age;
  state.studyLevel = studyLevel;
  state.profileComplete = true;
  state.streak = state.streak || 1;
  state.lastStudyDate = new Date().toDateString();
  save();
  ensureAppShell();
}

function updateHome() {
  var h = new Date().getHours();
  var greet = h < 12 ? 'Goedemorgen' : h < 17 ? 'Goedemiddag' : 'Goedenavond';
  document.getElementById('greeting').textContent = greet + ', ' + (state.name || 'Student').split(' ')[0];
  document.getElementById('home-sub').textContent = state.streak > 0 ? 'Dag ' + state.streak + ' reeks - ga zo door!' : 'Start vandaag je eerste sessie!';
  document.getElementById('streak-num').textContent = state.streak;
  document.getElementById('xp-display').textContent = state.xp;
  document.getElementById('level-display').textContent = state.studyLevel || 'Middelbare school';
  document.getElementById('sessions-today').textContent = state.sessionsToday;
  document.getElementById('tasks-done').textContent = state.tasks.filter(function(t) { return t.done; }).length;

  var pct = Math.min(100, Math.round((state.studiedMin / Math.max(state.dailyGoalMin, 1)) * 100));
  document.getElementById('goal-bar').style.width = pct + '%';
  var goalHours = Math.floor(state.dailyGoalMin / 60);
  var studiedHours = Math.floor(state.studiedMin / 60);
  var studiedMin = state.studiedMin % 60;
  document.getElementById('goal-progress-txt').textContent = (studiedHours > 0 ? studiedHours + 'h ' : '') + studiedMin + 'm / ' + goalHours + 'h';

  var upcoming = state.tasks.filter(function(t) { return !t.done; }).slice(0, 3);
  var el = document.getElementById('upcoming-tasks');
  if (!upcoming.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--color-text-secondary)">Nog geen taken</div>';
    return;
  }
  el.innerHTML = upcoming.map(function(task) {
    return '<div class="task-item" style="padding:8px 0"><div style="flex:1;font-size:13px">' + esc(task.title) + '</div><span class="pill pill-' + subColor(task.subject) + '">' + esc(task.subject || 'Algemeen') + '</span></div>';
  }).join('');
}

function updateProfile() {
  document.getElementById('profile-name').textContent = state.name;
  document.getElementById('avatar-initials').textContent = (state.name || 'S').charAt(0).toUpperCase();
  document.getElementById('profile-level-lbl').textContent = (state.studyLevel || 'Middelbare school') + ' · ' + state.xp + ' XP';
  document.getElementById('profile-meta-lbl').textContent = 'Leeftijd ' + (state.age || '-') + ', ' + (state.studyLevel || '-');
  var next = xpToNext(state.xp);
  document.getElementById('xp-next-lbl').textContent = next.cur + ' / ' + next.needed;
  document.getElementById('xp-bar').style.width = Math.min(100, Math.round((next.cur / Math.max(next.needed, 1)) * 100)) + '%';

  renderBarChart();
  renderBadges();
  renderSessionLog();

  var apiEl = document.getElementById('api-key-status');
  apiEl.textContent = 'Via server';
  apiEl.className = 'pill pill-teal';

  updateThemeButtons();
  updateAuthUI();
}

function updateAuthUI() {
  var pill = document.getElementById('auth-status-pill');
  var text = document.getElementById('auth-status-text');
  var signInBtn = document.getElementById('signin-btn');
  var signUpBtn = document.getElementById('signup-btn');
  var logoutBtn = document.getElementById('logout-btn');
  var signedInEmail = document.getElementById('signed-in-email');
  var landingNote = document.getElementById('auth-landing-note');
  if (!pill || !text || !signInBtn || !signUpBtn || !logoutBtn || !signedInEmail) return;

  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    pill.textContent = 'Setup nodig';
    pill.className = 'pill pill-amber';
    text.textContent = 'Voeg je Supabase project URL en anon key toe in config.js om accounts en synchronisatie in te schakelen.';
    signInBtn.style.display = 'none';
    signUpBtn.style.display = 'none';
    logoutBtn.style.display = 'none';
    signedInEmail.style.display = 'none';
    if (landingNote) landingNote.textContent = 'Voeg eerst je Supabase configuratie toe om in te loggen en te synchroniseren.';
    return;
  }

  if (currentUser) {
    pill.textContent = syncState === 'error' ? 'Sync fout' : 'Verbonden';
    pill.className = syncState === 'error' ? 'pill pill-coral' : 'pill pill-teal';
    text.textContent = (currentUser.email || 'Ingelogd') + '. ' + syncMessage;
    signInBtn.style.display = 'none';
    signUpBtn.style.display = 'none';
    logoutBtn.style.display = 'block';
    signedInEmail.style.display = 'block';
    signedInEmail.textContent = 'Ingelogd als ' + (currentUser.email || '');
    if (landingNote) landingNote.textContent = 'Je bent ingelogd. Vul je profiel in om door te gaan.';
  } else {
    pill.textContent = 'Uitgelogd';
    pill.className = 'pill pill-amber';
    text.textContent = 'Log in or create an account to enter the app.';
    signInBtn.style.display = 'block';
    signUpBtn.style.display = 'block';
    logoutBtn.style.display = 'none';
    signedInEmail.style.display = 'none';
    if (landingNote) landingNote.textContent = 'Na het inloggen vragen we een paar profielgegevens zoals je naam en leeftijd.';
  }
}

function renderBarChart() {
  var days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  var today = new Date().getDay();
  var maxH = Math.max(1, Math.max.apply(null, state.weekData.map(function(v) { return v || 0; })));
  var html = '<div class="bar-chart">';
  for (var i = 0; i < 7; i++) {
    var barHeight = ((state.weekData[i] || 0) / 60 / maxH) * 52;
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center"><div class="bar' + (i === today ? ' today' : '') + '" style="height:' + Math.max(4, Math.round(barHeight)) + 'px;width:100%"></div><div class="bar-label">' + days[i] + '</div></div>';
  }
  html += '</div>';
  document.getElementById('bar-chart-wrap').innerHTML = html;
}

function renderBadges() {
  document.getElementById('badge-grid').innerHTML = BADGES.map(function(badge) {
    var earned = badge.cond();
    return '<div class="badge-item' + (earned ? ' earned' : '') + '"><div class="badge-icon" style="font-size:18px">' + esc(badge.icon) + '</div><div>' + esc(badge.name) + '</div></div>';
  }).join('');
}

function setMode(mode) {
  if (state.timerRunning) return;
  state.timerMode = MODES[mode] ? mode : 'pomo';
  state.timerSeconds = MODES[state.timerMode].s;
  state.timerTotal = MODES[state.timerMode].s;
  state.timerPhase = 'work';
  document.getElementById('timer-mode-lbl').textContent = MODES[state.timerMode].label;
  updateTimerDisplay();
  ['pomo', 'short', 'long'].forEach(function(item) {
    var btn = document.getElementById('mode-' + item);
    if (!btn) return;
    btn.style.background = item === state.timerMode ? var_purple() : '';
    btn.style.color = item === state.timerMode ? '#fff' : '';
    btn.style.borderColor = item === state.timerMode ? var_purple() : '';
  });
}

function updateTimerDisplay() {
  if (!document.getElementById('timer-display')) return;
  var seconds = state.timerSeconds;
  var mins = Math.floor(seconds / 60);
  var secs = seconds % 60;
  document.getElementById('timer-display').textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  document.getElementById('timer-mode-lbl').textContent = MODES[state.timerMode].label;
  var arc = document.getElementById('timer-arc');
  var pct = state.timerTotal ? seconds / state.timerTotal : 1;
  arc.style.strokeDashoffset = 515 * (1 - pct);
}

function addXP(amount) {
  state.xp += amount;
  state.level = getLevel(state.xp);
  save();
  updateHome();
  updateProfile();
  showToast('+' + amount + ' XP verdiend!');
}

function toggleTimer() {
  if (state.timerRunning) {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    document.getElementById('btn-start').textContent = 'Hervat';
    return;
  }
  state.timerRunning = true;
  document.getElementById('btn-start').textContent = 'Pauzeer';
  state.timerInterval = setInterval(function() {
    state.timerSeconds--;
    updateTimerDisplay();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      timerComplete();
    }
  }, 1000);
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  state.timerSeconds = MODES[state.timerMode].s;
  state.timerTotal = MODES[state.timerMode].s;
  document.getElementById('btn-start').textContent = 'Start';
  updateTimerDisplay();
}

function updateStreakCheck() {
  var today = new Date().toDateString();
  if (state.lastStudyDate === today) return;
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  state.streak = state.lastStudyDate === yesterday.toDateString() ? state.streak + 1 : 1;
  state.lastStudyDate = today;
}

function timerComplete() {
  var durationMin = Math.round(state.timerTotal / 60);
  var subject = document.getElementById('focus-subject').value;
  var xpEarned = durationMin * 2;

  state.studiedMin += durationMin;
  state.sessionsToday++;
  state.weekData[new Date().getDay()] = (state.weekData[new Date().getDay()] || 0) + durationMin;
  state.xp += xpEarned;
  state.level = getLevel(state.xp);
  state.sessionLog = state.sessionLog || [];
  state.sessionLog.unshift(subject + ' · ' + durationMin + 'min · +' + xpEarned + ' XP');
  state.sessionLog = state.sessionLog.slice(0, 20);

  updateStreakCheck();
  save();
  renderSessionLog();
  document.getElementById('session-complete-msg').textContent = 'Je hebt ' + subject + ' gestudeerd voor ' + durationMin + ' minuten. +' + xpEarned + ' XP!';
  document.getElementById('session-modal').style.display = 'flex';
  document.getElementById('btn-start').textContent = 'Start';
  updateHome();
  updateProfile();
}

function closeSessionModal() {
  document.getElementById('session-modal').style.display = 'none';
  updateHome();
}

function addTask() {
  var input = document.getElementById('new-task-input');
  var value = input.value.trim();
  if (!value) return;
  state.tasks.push({ title: value, subject: 'Algemeen', done: false, created: Date.now() });
  input.value = '';
  save();
  renderTasks();
  updateHome();
  addXP(10);
}

function toggleTask(idx) {
  state.tasks[idx].done = !state.tasks[idx].done;
  if (state.tasks[idx].done) addXP(20);
  save();
  renderTasks();
  updateHome();
}

function deleteTask(idx) {
  state.tasks.splice(idx, 1);
  save();
  renderTasks();
  updateHome();
}

function filterTasks(filterName) {
  state.taskFilter = filterName;
  ['all', 'todo', 'done'].forEach(function(name) {
    var btn = document.getElementById('filter-' + name);
    btn.style.fontWeight = name === filterName ? '500' : '400';
    btn.style.background = name === filterName ? var_purple() : '';
    btn.style.color = name === filterName ? '#fff' : '';
    btn.style.borderColor = name === filterName ? var_purple() : '';
  });
  renderTasks();
}

function renderTasks() {
  var list = state.tasks.filter(function(task) {
    if (state.taskFilter === 'todo') return !task.done;
    if (state.taskFilter === 'done') return task.done;
    return true;
  });
  var el = document.getElementById('task-list');
  if (!list.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--color-text-secondary);padding:8px 0">Geen taken hier</div>';
    return;
  }
  el.innerHTML = list.map(function(task) {
    var realIdx = state.tasks.indexOf(task);
    return '<div class="task-item"><div class="task-check' + (task.done ? ' done' : '') + '" onclick="toggleTask(' + realIdx + ')"></div><div class="task-text' + (task.done ? ' done' : '') + '" style="font-size:13px">' + esc(task.title) + '</div><button onclick="deleteTask(' + realIdx + ')" style="background:none;border:none;cursor:pointer;color:var(--color-text-secondary);font-size:16px;padding:2px 4px">x</button></div>';
  }).join('');
}

function openNoteEditor(idx) {
  state.editingNoteIdx = idx;
  currentNote = idx === -1 ? { title: '', body: '' } : Object.assign({}, state.notes[idx]);
  document.getElementById('note-title-input').value = currentNote.title || '';
  document.getElementById('note-body-input').value = currentNote.body || '';
  document.getElementById('notes-list-view').style.display = 'none';
  document.getElementById('notes-editor-view').style.display = 'flex';
}

function closeNoteEditor() {
  document.getElementById('notes-list-view').style.display = 'block';
  document.getElementById('notes-editor-view').style.display = 'none';
}

function saveNote() {
  var title = document.getElementById('note-title-input').value.trim() || 'Untitled';
  var body = document.getElementById('note-body-input').value.trim();
  if (state.editingNoteIdx === -1) {
    state.notes.unshift({ title: title, body: body, created: Date.now() });
  } else {
    state.notes[state.editingNoteIdx] = { title: title, body: body, created: state.notes[state.editingNoteIdx].created };
  }
  save();
  closeNoteEditor();
  renderNotes();
  addXP(5);
}

function renderNotes() {
  var el = document.getElementById('notes-list');
  if (!state.notes.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--color-text-secondary)">No notes yet. Tap + to create one.</div>';
    return;
  }
  el.innerHTML = state.notes.map(function(note, idx) {
    return '<div class="note-card" onclick="openNoteEditor(' + idx + ')"><div class="note-title">' + esc(note.title) + '</div><div class="note-preview">' + esc(note.body || 'Lege notitie') + '</div></div>';
  }).join('');
}

function explainNote() {
  var body = document.getElementById('note-body-input').value.trim();
  if (!body) {
    showToast('Write some notes first!');
    return;
  }
  goTo('ai');
  document.getElementById('chat-input').value = 'Leg deze notities uit en licht de belangrijkste punten toe:\n\n' + body.slice(0, 400);
  sendMessage();
}

function clearChat() {
  state.chatHistory = [];
  save();
  renderChatHistory();
}

function sendChip(text) {
  document.getElementById('chat-input').value = text;
  sendMessage();
}

function addBubble(role, text) {
  var area = document.getElementById('chat-area');
  var bubble = document.createElement('div');
  bubble.className = 'bubble ' + role;
  bubble.textContent = text;
  area.appendChild(bubble);
  area.scrollTop = area.scrollHeight;
  return bubble;
}

function addTyping() {
  var area = document.getElementById('chat-area');
  var d = document.createElement('div');
  d.className = 'bubble ai typing';
  d.id = 'typing-indicator';
  d.innerHTML = '<div class="dot-loader"><span></span><span></span><span></span></div>';
  area.appendChild(d);
  area.scrollTop = area.scrollHeight;
}

function removeTyping() {
  var indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

async function callGeminiApi(prompt) {
  var resp = await fetch('/api/tutor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt
    })
  });
  var data = await resp.json();
  if (resp.ok) return { ok: true, data: data, model: data.model || 'server' };
  return { ok: false, data: data, error: (data && data.error) ? data.error : 'Onbekende serverfout' };
}

async function sendMessage() {
  var input = document.getElementById('chat-input');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  addBubble('user', text);
  state.chatHistory.push({ role: 'user', content: text });
  if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
  addXP(5);

  addTyping();
  var subject = document.getElementById('ai-subject').value;
  var systemPrompt = 'Je bent Studiemaatje, een vriendelijke en geduldige AI tutor voor leerlingen van middelbare school en mbo/hbo/universiteit. Je doel is leerlingen helpen concepten te begrijpen, niet alleen antwoorden geven.\n\nRegels:\n1. Geef nooit zomaar het eindantwoord. Leg eerst de redenering uit.\n2. Gebruik eenvoudige taal. Leg moeilijke woorden uit.\n3. Geef concrete voorbeelden en analogieën.\n4. Wees warm en aanmoedigend.\n5. Na het uitleggen, stel een controlevraag.\n6. Als gevraagd wordt om een essay te schrijven, stuur dan: "Laten we dit samen opbouwen - begin met een outline."\n\nDe leerling studeert nu: ' + subject + '.';
  var historyText = state.chatHistory.map(function(item) {
    return (item.role === 'assistant' ? 'Tutor' : 'Student') + ': ' + item.content;
  }).join('\n');
  var prompt = systemPrompt + '\n\nConversation so far:\n' + historyText + '\n\nNow respond as the tutor to the latest student message only.';

  try {
    var result = await callGeminiApi(prompt);
    removeTyping();
    if (!result.ok) {
      addBubble('ai', 'API fout: ' + result.error + '. Controleer je API-sleutel in Profiel en zorg dat je Gemini API-sleutel is ingeschakeld in Google AI Studio.');
      return;
    }
    var reply = ((result.data.candidates || [])[0] && (((result.data.candidates || [])[0].content || {}).parts || [])[0]);
    if (reply && reply.text) {
      addBubble('ai', reply.text);
      state.chatHistory.push({ role: 'assistant', content: reply.text });
      save();
    } else if (result.data.error) {
      addBubble('ai', 'API fout: ' + result.data.error.message + '. Controleer je API-sleutel in Profiel.');
    } else {
      addBubble('ai', 'Ik kon dit keer geen antwoord genereren. Probeer het opnieuw.');
    }
  } catch (e) {
    removeTyping();
    addBubble('ai', 'Kon de AI niet bereiken. Controleer je API-sleutel en internetverbinding.');
  }
}

function setApiTestStatus(msg, color) {
  var el = document.getElementById('api-test-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = color || 'var(--color-text-secondary)';
}

function showApiModal() {
  document.getElementById('api-modal').style.display = 'flex';
  document.getElementById('api-key-input').value = '';
  setApiTestStatus('De API-sleutel staat op de server en is niet zichtbaar in de browser.');
}

function closeApiModal() {
  document.getElementById('api-modal').style.display = 'none';
  setApiTestStatus('');
}

async function testApiKey() {
  var buttons = document.querySelectorAll('#api-modal button');
  buttons.forEach(function(btn) { btn.disabled = true; });
  setApiTestStatus('Serververbinding testen...', 'var(--color-text-secondary)');
  try {
    var result = await callGeminiApi('Antwoord exact met: Serververbinding werkt.');
    if (result.ok) {
      setApiTestStatus('Server werkt. Verbonden met ' + result.model + '.', 'var(--teal)');
      showToast('AI-server werkt');
    } else {
      setApiTestStatus('Test mislukt: ' + result.error, 'var(--coral)');
    }
  } catch (e) {
    setApiTestStatus('Test mislukt. Controleer je verbinding en probeer opnieuw.', 'var(--coral)');
  } finally {
    buttons.forEach(function(btn) { btn.disabled = false; });
  }
}

function saveApiKey() {
  closeApiModal();
}

function setAuthModalStatus(msg, color) {
  var el = document.getElementById('auth-modal-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = color || 'var(--color-text-secondary)';
}

function showAuthModal(mode) {
  authMode = mode === 'signin' ? 'signin' : 'signup';
  document.getElementById('auth-modal-title').textContent = authMode === 'signin' ? 'Inloggen' : 'Account maken';
  document.getElementById('auth-modal-sub').textContent = authMode === 'signin'
    ? 'Log in om je Studiemaatje voortgang op dit apparaat te laden.'
    : 'Maak een account om je Studiemaatje voortgang te synchroniseren tussen apparaten.';
  document.getElementById('auth-submit-btn').textContent = authMode === 'signin' ? 'Inloggen' : 'Account maken';
  document.getElementById('auth-modal').style.display = 'flex';
  setAuthModalStatus('');
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
  setAuthModalStatus('');
}

async function submitAuth() {
  if (!supabaseClient) {
    setAuthModalStatus('Cloud synchronisatie is nog niet geconfigureerd. Voeg je Supabase gegevens toe in config.js.', 'var(--coral)');
    return;
  }

  var email = document.getElementById('auth-email-input').value.trim();
  var password = document.getElementById('auth-password-input').value;
  if (!email || !password) {
    setAuthModalStatus('Voer zowel e-mail als wachtwoord in.', 'var(--amber)');
    return;
  }
  if (password.length < 6) {
    setAuthModalStatus('Gebruik een wachtwoord van minimaal 6 tekens.', 'var(--amber)');
    return;
  }

  var submitBtn = document.getElementById('auth-submit-btn');
  submitBtn.disabled = true;
  setAuthModalStatus(authMode === 'signin' ? 'Inloggen...' : 'Account maken...', 'var(--color-text-secondary)');

  try {
    if (authMode === 'signin') {
      pendingGuestMigration = false;
      var signInResult = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (signInResult.error) throw signInResult.error;
      closeAuthModal();
      showToast('Succesvol ingelogd');
    } else {
      pendingGuestMigration = hasMeaningfulProgress(getGuestState());
      var signUpResult = await supabaseClient.auth.signUp({ email: email, password: password });
      if (signUpResult.error) throw signUpResult.error;
      if (!signUpResult.data.session) {
        setAuthModalStatus('Account aangemaakt. Controleer je e-mail om te bevestigen, dan kun je inloggen.', 'var(--teal)');
      } else {
        closeAuthModal();
        showToast('Account aangemaakt');
      }
    }
  } catch (e) {
    setAuthModalStatus(e.message || 'Authenticatie mislukt.', 'var(--coral)');
  } finally {
    submitBtn.disabled = false;
  }
}

async function logoutUser() {
  if (!supabaseClient) return;
  try {
    await supabaseClient.auth.signOut();
    showToast('Uitgelogd');
  } catch (e) {
    showToast('Kon nu niet uitloggen');
  }
}

async function saveRemoteState() {
  if (!currentUser || !supabaseClient || isHydratingRemoteState) return;
  setSyncStatus('syncing', 'Voortgang opslaan naar de cloud...');
  var result = await supabaseClient
    .from('profiles')
    .upsert({
      user_id: currentUser.id,
      email: currentUser.email,
      state: getRemoteStatePayload(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (result.error) {
    setSyncStatus('error', result.error.message || 'Kon je voortgang niet synchroniseren.');
    return;
  }
  setSyncStatus('connected', 'Your progress is synced and available on your other devices.');
}

async function loadRemoteStateForUser(user) {
  var result = await supabaseClient
    .from('profiles')
    .select('state')
    .eq('user_id', user.id)
    .maybeSingle();

  if (result.error && result.error.code !== 'PGRST116') throw result.error;
  return result.data ? result.data.state : null;
}

async function adoptUserState(user) {
  currentUser = user;
  isHydratingRemoteState = true;
  setSyncStatus('syncing', 'Je opgeslagen voortgang laden...');

  try {
    var remoteState = await loadRemoteStateForUser(user);
    var localUserState = loadLocalState(user);
    var nextState;

    if (remoteState) {
      nextState = normalizeState(remoteState);
      if (localUserState && localUserState.apiKey) nextState.apiKey = localUserState.apiKey;
    } else if (localUserState) {
      nextState = normalizeState(localUserState);
    } else if (pendingGuestMigration && hasMeaningfulProgress(getGuestState())) {
      nextState = normalizeState(getGuestState());
    } else {
      nextState = createDefaultState();
    }

    setState(nextState);
    persistLocalState();
    renderAll();
    if (!remoteState) await saveRemoteState();
    setSyncStatus('connected', 'Your progress is synced and available on your other devices.');
  } catch (e) {
    var fallback = loadLocalState(user) || createDefaultState();
    setState(fallback);
    renderAll();
    setSyncStatus('error', e.message || 'Kon je cloudgegevens niet laden.');
  } finally {
    pendingGuestMigration = false;
    isHydratingRemoteState = false;
  }
}

function adoptGuestState() {
  currentUser = null;
  clearTimeout(remoteSaveTimer);
  setState(loadLocalState(null) || createDefaultState());
  renderAll();
  setSyncStatus('guest', 'Your data is currently stored only on this device.');
}

async function initSupabase() {
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey || !window.supabase || !window.supabase.createClient) {
    updateAuthUI();
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (session && session.user) {
      adoptUserState(session.user);
    } else {
      adoptGuestState();
    }
  });

  var sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.data && sessionResult.data.session && sessionResult.data.session.user) {
    await adoptUserState(sessionResult.data.session.user);
  } else {
    adoptGuestState();
  }
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function subColor(subject) {
  var map = { Wiskunde: 'purple', Natuurkunde: 'teal', Scheikunde: 'amber', Biologie: 'green', Geschiedenis: 'coral', Nederlands: 'teal', Algemeen: 'purple' };
  return map[subject] || 'purple';
}

function updateClock() {
  var now = new Date();
  var h = now.getHours() % 12 || 12;
  var m = now.getMinutes();
  document.getElementById('clock').textContent = h + ':' + (m < 10 ? '0' : '') + m;
}

setMode('pomo');
updateClock();
setInterval(updateClock, 10000);
applyTheme();
updateGoalSelection();
renderChatHistory();
renderTasks();
renderNotes();
updateProfile();
initSupabase();
