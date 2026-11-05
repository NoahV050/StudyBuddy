import { createDefaultState, localDateKey, normalizeState, rolloverDailyState, touch } from './modules/state.js';
import { loadState, saveState } from './modules/storage.js';
import { addTask as createTask, deleteTask as removeTask, toggleTask as changeTask } from './modules/tasks.js';
import { saveNote as persistNote } from './modules/notes.js';
import { awardXp } from './modules/gamification.js';
import { completeTimer, pauseTimer, reconcileTimer, resetTimer as resetTimerState, setCustomDuration, setMode as setTimerMode, startTimer } from './modules/timer.js';
import { addChatMessage, askTutor, clearSubjectHistory } from './modules/tutor.js';
import { createAuthService } from './modules/auth.js';
import { addFlashcard, addSubject, completePlanItem, createExamPlan, reviewFlashcard } from './modules/learning.js';
import { renderLearning as renderLearningView } from './modules/learning-ui.js';
import { claimChallenge, useStreakFreeze } from './modules/challenges.js';
import { initializePwa } from './modules/pwa.js';
import {
  addBubble,
  byId,
  renderAuth as renderAuthView,
  renderChat as renderChatView,
  renderHome as renderHomeView,
  renderMarkdown,
  renderNotes as renderNotesView,
  renderProfile as renderProfileView,
  renderTasks as renderTasksView,
  renderThemeButtons as renderThemeButtonsView,
  renderTimer as renderTimerView
} from './modules/ui.js';

let state = loadState(null) || createDefaultState();
let sync = navigator.onLine !== false
  ? { mode: 'guest', message: 'Je gegevens staan alleen op dit apparaat.', user: null }
  : { mode: 'offline', message: 'Offline: wijzigingen staan op dit apparaat en worden later gesynchroniseerd.', user: null };
let auth, editingNoteId = null, chatAbortController = null;
let learningSubjectId = state.subjects?.find(subject => !subject.deleted)?.id || '';
let flashcardRevealed = false;
const $ = byId;
// Keep deletion working while an older service-worker cache still serves the storage module.
function deleteLocalState(user) {
  try {
    localStorage.removeItem(user?.id ? `sb_state_user_${user.id}` : 'sb_state_guest');
    return true;
  } catch (error) {
    console.error('Studiemaatje kon lokale accountgegevens niet verwijderen.', error);
    return false;
  }
}
const save = () => { rolloverDailyState(state); touch(state); saveState(sync.user, state); auth?.scheduleSave(); };
function toast(message) { const element = $('toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }
function setTheme(theme) { state.theme = ['light', 'dark', 'auto'].includes(theme) ? theme : 'auto'; document.documentElement.dataset.theme = state.theme; save(); renderThemeButtons(); }
const renderThemeButtons = () => renderThemeButtonsView(state);
const renderTimer = () => renderTimerView(state);
const renderTasks = () => {
  renderTasksView(state, toggleTask, deleteTask);
  ['all', 'todo', 'done'].forEach(name => $(`filter-${name}`)?.setAttribute('aria-pressed', String(name === state.taskFilter)));
};
const renderNotes = () => renderNotesView(state, openNoteEditor);
const renderChat = () => renderChatView(state, $('ai-subject').value, $('tutor-history-search').value);
const renderHome = () => renderHomeView(state);
const renderProfile = () => renderProfileView(state, sync);
const renderAuth = () => renderAuthView(sync);
const renderLearning = () => renderLearningView(state, learningSubjectId, flashcardRevealed);
function renderOnboarding(stateToRender = state) {
  const options = $('ob-subject-options');
  if (!options) return;
  options.replaceChildren();
  const subjects = stateToRender.subjects.filter(subject => !subject.deleted);
  const preferred = new Set(stateToRender.preferredSubjectIds);
  subjects.forEach((subject, index) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'onboarding-subject';
    checkbox.value = subject.id;
    checkbox.checked = preferred.size ? preferred.has(subject.id) : index === 0;
    const name = document.createElement('span');
    name.textContent = subject.name;
    label.append(checkbox, name);
    options.append(label);
  });
  $('ob-goal').value = stateToRender.dailyGoalMin;
}
function showPage(name, showTabs = true) {
  document.querySelectorAll('.page').forEach(page => {
    const active = page.id === `pg-${name}`;
    page.classList.toggle('active', active);
    if (active) {
      page.tabIndex = -1;
      page.focus({ preventScroll: true });
    }
  });
  document.querySelectorAll('.tab-item').forEach(tab => {
    const active = tab.id === `tab-${name}`;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  $('tab-bar').style.display = showTabs && sync.user && state.profileComplete ? 'flex' : 'none';
  if (name === 'notes') renderNotes();
  if (name === 'ai') renderChat();
  if (name === 'learn') renderLearning();
  if (name === 'profile') renderProfile();
  if (name === 'home') renderHome();
}
let shortcutPage = new URLSearchParams(location.search).get('shortcut');
function ensureShell() {
  if (!sync.user) return showPage('auth-landing', false);
  if (!state.profileComplete) return showPage('profile-setup', false);
  if (['focus', 'tasks', 'ai', 'learn', 'notes', 'profile'].includes(shortcutPage)) {
    const page = shortcutPage;
    shortcutPage = null;
    history.replaceState(null, '', location.pathname);
    return showPage(page);
  }
  if (!$('pg-home').classList.contains('active')) showPage('home');
}
function renderAll() { document.documentElement.dataset.theme = state.theme; renderOnboarding(); renderTimer(); renderTasks(); renderNotes(); renderChat(); renderHome(); renderProfile(); renderLearning(); ensureShell(); }
function completeCurrentTimer(sessionId, taskId) { const result = completeTimer(state, sessionId, new Date(), taskId); if (!result.completed) return; awardXp(state, result.minutes * 2, `timer:${sessionId}`); save(); renderAll(); $('session-complete-msg').textContent = `Je hebt ${result.subject} gestudeerd voor ${result.minutes} minuten. +${result.minutes * 2} XP!`; $('session-modal').style.display = 'flex'; if ('Notification' in window && Notification.permission === 'granted') new Notification('Focussessie afgerond', { body: `${result.minutes} minuten ${result.subject}. Goed gewerkt!` }); }
function tickTimer() { const result = reconcileTimer(state); renderTimer(); if (result.completed) completeCurrentTimer(result.sessionId, result.taskId); }
function setMode(mode) { if (setTimerMode(state, mode)) { save(); renderTimer(); } }
function setCustomFocusDuration() { if (setCustomDuration(state, $('custom-focus-minutes').value)) { save(); renderTimer(); toast(`Timer ingesteld op ${state.timerCustomSeconds / 60} minuten.`); } }
function enableTimerNotifications() { if (!('Notification' in window)) return toast('Deze browser ondersteunt geen meldingen.'); Notification.requestPermission().then(permission => { $('timer-notification-btn').textContent = permission === 'granted' ? 'Meldingen staan aan' : 'Meldingen niet toegestaan'; }).catch(() => toast('Meldingen konden niet worden ingeschakeld.')); }
function toggleTimer() { if (state.timerRunning) pauseTimer(state); else startTimer(state, $('focus-subject').value, $('focus-task').value); save(); renderTimer(); }
function resetTimer() { resetTimerState(state); save(); renderTimer(); }
function filterTasks(filter) { state.taskFilter = ['all', 'todo', 'done'].includes(filter) ? filter : 'all'; save(); ['all', 'todo', 'done'].forEach(name => { const button = $(`filter-${name}`); button.style.fontWeight = name === state.taskFilter ? '600' : '400'; button.setAttribute('aria-pressed', String(name === state.taskFilter)); }); renderTasks(); }
function addTask() { const input = $('new-task-input'); const subject = $('task-subject').value || 'Algemeen'; state.taskSubject = subject; const task = createTask(state, input.value, subject, $('task-due-date').value); if (!task) return; input.value = ''; $('task-due-date').value = ''; awardXp(state, 10, `task:create:${task.id}`); save(); renderTasks(); renderHome(); renderLearning(); toast('+10 XP verdiend!'); }
function toggleTask(id) { const { item, award } = changeTask(state, id); if (award) awardXp(state, award, `task:complete:${item.id}`); save(); renderTasks(); renderHome(); renderLearning(); if (award) toast('+20 XP verdiend!'); }
function deleteTask(id) { if (removeTask(state, id)) { save(); renderTasks(); renderHome(); renderLearning(); } }
function selectLearningSubject(value) { const subject = state.subjects.find(item => item.id === value || item.name === value); if (!subject) return; learningSubjectId = subject.id; flashcardRevealed = false; renderLearning(); }
function selectTutorSubject(subject) { state.tutorSubject = subject; save(); }
function selectTutorMode(mode) { state.tutorMode = mode; save(); }
function addSubjectFromForm() {
  const input = $('new-subject-name');
  const subject = addSubject(state, input.value, { color: $('new-subject-color').value, goalMin: $('new-subject-goal').value });
  if (!subject) return toast('Vul eerst een vaknaam in.');
  learningSubjectId = subject.id;
  input.value = '';
  save();
  renderLearning();
  toast(`Vak ${subject.name} toegevoegd.`);
}
function addFlashcardFromForm() {
  const card = addFlashcard(state, learningSubjectId, $('flashcard-question').value, $('flashcard-answer-input').value);
  if (!card) return toast('Vul een vraag en antwoord in.');
  $('flashcard-question').value = '';
  $('flashcard-answer-input').value = '';
  flashcardRevealed = false;
  save();
  renderLearning();
  toast('Herhaalkaartje toegevoegd.');
}
function revealFlashcard() { flashcardRevealed = true; renderLearning(); }
function rateFlashcard(quality) {
  const cardId = $('flashcard-front').dataset.cardId;
  const card = reviewFlashcard(state, cardId, quality);
  if (!card) return;
  awardXp(state, 2, `review:${card.id}:${localDateKey()}`);
  flashcardRevealed = false;
  save();
  renderLearning();
}
function createExamPlanFromForm() {
  const subjectId = learningSubjectId;
  const plan = createExamPlan(state, subjectId, $('exam-date').value, $('exam-topics').value);
  if (!plan.length) return toast('Kies een toetsdatum tussen morgen en een jaar vanaf nu.');
  $('exam-topics').value = '';
  save();
  renderLearning();
  toast(`Je studieschema met ${plan.length} sessies staat klaar.`);
}
function completePlannedItem(id) {
  if (!completePlanItem(state, id)) return;
  awardXp(state, 5, `plan:done:${id}`);
  save();
  renderLearning();
  toast('+5 XP verdiend!');
}
function claimLearningChallenge(period, id) {
  if (!claimChallenge(state, period, id)) return toast('Dit doel is nog niet afgerond.');
  save();
  renderLearning();
  renderHome();
  renderProfile();
  const reward = period === 'daily' ? 10 : 25;
  toast(`+${reward} XP verdiend. Goed gedaan!`);
}
function useStreakFreezeFromProfile() {
  if (!useStreakFreeze(state)) return toast('Je kunt de reeks-vriezer nu niet gebruiken.');
  save();
  renderHome();
  renderProfile();
  toast('Je reeks is beschermd. De reeks-vriezer is gebruikt.');
}
function openNoteEditor(id) { editingNoteId = id === -1 ? null : id; const note = state.notes.find(item => item.id === editingNoteId); $('note-title-input').value = note?.title || ''; $('note-body-input').value = note?.body || ''; $('notes-list-view').style.display = 'none'; $('notes-editor-view').style.display = 'flex'; $('note-title-input').focus(); }
function closeNoteEditor() { editingNoteId = null; $('notes-list-view').style.display = 'block'; $('notes-editor-view').style.display = 'none'; }
function saveNote() { const result = persistNote(state, editingNoteId, $('note-title-input').value, $('note-body-input').value); if (result.isNew) awardXp(state, 5, `note:create:${result.item.id}`); save(); closeNoteEditor(); renderNotes(); renderProfile(); if (result.isNew) toast('+5 XP verdiend!'); }
async function sendMessage(retry = false) {
  const input = $('chat-input');
  const subject = $('ai-subject').value;
  const mode = $('ai-mode').value;
  const previousQuestion = [...state.chatHistory].reverse().find(item => item.subject === subject && item.role === 'user');
  const question = (retry ? previousQuestion?.content || '' : input.value).trim();
  if (!question || chatAbortController) return;
  state.tutorSubject = subject;
  state.tutorMode = mode;
  input.value = '';
  let userMessage = previousQuestion;
  if (!retry) {
    userMessage = addChatMessage(state, 'user', question, subject, mode);
    save();
  } else {
    const lastAssistant = [...state.chatHistory].reverse().find(item => item.subject === subject && item.role === 'assistant');
    if (lastAssistant) state.chatHistory = state.chatHistory.filter(item => item.id !== lastAssistant.id);
    save();
  }
  renderChat();
  const typing = addBubble('ai', '');
  typing.classList.add('typing');
  $('stop-tutor-btn').disabled = false;
  $('retry-tutor-btn').disabled = true;
  chatAbortController = new AbortController();
  let partialReply = '';
  try {
    const reply = await askTutor({
      prompt: question,
      subject,
      mode,
      state,
      signal: chatAbortController.signal,
      excludeMessageId: userMessage?.id,
      onToken: text => {
        partialReply = text;
        typing.classList.remove('typing');
        renderMarkdown(typing, text);
      }
    });
    if (reply) {
      addChatMessage(state, 'assistant', reply, subject, mode);
      save();
    }
    renderChat();
  } catch (error) {
    typing.classList.remove('typing');
    typing.textContent = error.name === 'AbortError'
      ? 'Antwoord gestopt.'
      : error.message || 'De tutor is tijdelijk niet bereikbaar.';
    if (partialReply) {
      addChatMessage(state, 'assistant', partialReply, subject, mode);
      save();
    }
  } finally {
    chatAbortController = null;
    $('stop-tutor-btn').disabled = true;
    $('retry-tutor-btn').disabled = false;
  }
}
function sendChip(text) { $('chat-input').value = text; sendMessage(); }
function stopTutor() { chatAbortController?.abort(); }
function regenerateTutor() { if (!chatAbortController) sendMessage(true); }
function searchTutorHistory() { renderChat(); }
function clearTutorHistory() {
  const subject = $('ai-subject').value;
  clearSubjectHistory(state, subject);
  save();
  renderChat();
  toast(`De geschiedenis voor ${subject} is gewist.`);
}
function saveTutorAsNote() {
  const subject = $('ai-subject').value;
  const answer = [...state.chatHistory].reverse().find(item => item.subject === subject && item.role === 'assistant');
  if (!answer) return toast('Er is nog geen uitleg om te bewaren.');
  const result = persistNote(state, null, `Uitleg ${subject}`, answer.content);
  awardXp(state, 5, `note:create:${result.item.id}`);
  save();
  renderNotes();
  toast('De uitleg is als notitie bewaard.');
}
function finishOnboard() {
  const name = $('ob-name').value.trim();
  const age = $('ob-age').value.trim();
  if (!name) return toast('Vul eerst je naam in.');
  if (age && (Number(age) < 10 || Number(age) > 100)) return toast('Vul een leeftijd tussen 10 en 100 in, of laat dit veld leeg.');
  state.name = name.slice(0, 80);
  state.age = age.slice(0, 3);
  state.studyLevel = $('ob-level').value;
  state.dailyGoalMin = Math.max(5, Math.min(720, Number($('ob-goal').value) || 120));
  state.preferredSubjectIds = [...document.querySelectorAll('input[name="onboarding-subject"]:checked')].map(input => input.value);
  const primarySubject = state.subjects.find(subject => state.preferredSubjectIds.includes(subject.id));
  if (primarySubject) {
    state.taskSubject = primarySubject.name;
    state.tutorSubject = primarySubject.name;
    state.timerSubject = primarySubject.name;
    learningSubjectId = primarySubject.id;
  }
  state.profileComplete = true;
  if (!state.lastStudyDate) { state.lastStudyDate = localDateKey(); state.streak = 1; }
  save();
  renderAll();
  showPage('home');
}
function editProfile() {
  $('ob-name').value = state.name === 'Student' ? '' : state.name;
  $('ob-age').value = state.age;
  $('ob-level').value = state.studyLevel;
  renderOnboarding();
  showPage('profile-setup', false);
}
let authMode = 'signin'; function showAuthModal(mode) { authMode = mode; $('auth-modal-title').textContent = mode === 'signin' ? 'Inloggen' : 'Account maken'; $('auth-submit-btn').textContent = mode === 'signin' ? 'Inloggen' : 'Account maken'; $('auth-password-input').autocomplete = mode === 'signin' ? 'current-password' : 'new-password'; $('auth-modal').style.display = 'flex'; $('auth-email-input').focus(); }
function closeAuthModal() { $('auth-modal').style.display = 'none'; $('auth-modal-status').textContent = ''; }
async function submitAuth() { const email = $('auth-email-input').value.trim(); const password = $('auth-password-input').value; if (!email || password.length < 6) return $('auth-modal-status').textContent = 'Vul een e-mailadres en een wachtwoord van minimaal 6 tekens in.'; try { const signedIn = authMode === 'signin' ? (await auth.signIn(email, password), true) : await auth.signUp(email, password); if (signedIn) closeAuthModal(); else $('auth-modal-status').textContent = 'Controleer je e-mail om je account te bevestigen.'; } catch (error) { $('auth-modal-status').textContent = error.message || 'Inloggen is mislukt.'; } }
async function logoutUser() { try { await auth.signOut(); toast('Uitgelogd'); } catch { toast('Uitloggen is niet gelukt.'); } }
function exportData() {
  const exportedState = JSON.parse(JSON.stringify(state));
  delete exportedState.apiKey;
  delete exportedState.timerInterval;
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), state: exportedState }, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `studiemaatje-gegevens-${localDateKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Je gegevens zijn gedownload.');
}
async function deleteAccount() {
  if (!auth?.user) return toast('Log eerst in om je account te verwijderen.');
  if (navigator.onLine === false) return toast('Je account kan alleen online worden verwijderd.');
  const confirmed = window.confirm('Weet je zeker dat je je Studiemaatje-account wilt verwijderen? Je cloudprofiel en lokale voortgang op dit apparaat worden definitief gewist.');
  if (!confirmed) return;
  try {
    await auth.deleteAccount();
    showPage('auth-landing', false);
    toast('Je account is verwijderd.');
  } catch (error) {
    toast(error.message || 'Je account kon niet worden verwijderd.');
  }
}
function closeSessionModal() { $('session-modal').style.display = 'none'; }
Object.assign(window, { completePlannedItem, claimChallenge: claimLearningChallenge });
const clickActions = {
  theme: element => setTheme(element.dataset.themeValue),
  'show-auth': element => showAuthModal(element.dataset.mode),
  'finish-onboard': finishOnboard,
  'go-to': element => showPage(element.dataset.page),
  'set-mode': element => setMode(element.dataset.mode),
  'custom-focus': setCustomFocusDuration,
  'timer-notifications': enableTimerNotifications,
  'toggle-timer': toggleTimer,
  'reset-timer': resetTimer,
  'send-chip': element => sendChip(element.dataset.message),
  'stop-tutor': stopTutor,
  'retry-tutor': regenerateTutor,
  'save-tutor-note': saveTutorAsNote,
  'clear-tutor-history': clearTutorHistory,
  'send-message': () => sendMessage(),
  'filter-tasks': element => filterTasks(element.dataset.filter),
  'add-task': addTask,
  'add-subject': addSubjectFromForm,
  'reveal-card': revealFlashcard,
  'rate-card': element => rateFlashcard(Number(element.dataset.quality)),
  'add-flashcard': addFlashcardFromForm,
  'create-exam-plan': createExamPlanFromForm,
  'open-note': element => openNoteEditor(Number(element.dataset.noteId)),
  'close-note-editor': closeNoteEditor,
  'save-note': saveNote,
  'edit-profile': editProfile,
  'use-streak-freeze': useStreakFreezeFromProfile,
  logout: logoutUser,
  'export-data': exportData,
  'delete-account': deleteAccount,
  'close-session-modal': closeSessionModal,
  'close-auth-modal': closeAuthModal,
  'submit-auth': submitAuth
};
document.addEventListener('click', event => {
  const trigger = event.target.closest?.('[data-action]');
  const action = trigger && clickActions[trigger.dataset.action];
  if (action) action(trigger);
});
document.addEventListener('change', event => {
  const control = event.target;
  if (control.dataset.changeAction === 'tutor-subject') selectTutorSubject(control.value);
  if (control.dataset.changeAction === 'tutor-mode') selectTutorMode(control.value);
  if (control.dataset.changeAction === 'learning-subject') selectLearningSubject(control.value);
});
document.addEventListener('input', event => {
  if (event.target.dataset.inputAction === 'search-tutor-history') searchTutorHistory();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey) return;
  const action = event.target.dataset.enterAction;
  if (!action || !clickActions[action]) return;
  event.preventDefault();
  clickActions[action](event.target);
});
auth = createAuthService({ config: window.STUDY_BUDDY_CONFIG, getState: () => state, loadLocal: loadState, saveLocal: saveState, deleteLocal: deleteLocalState, guestState: () => loadState(null) || createDefaultState(), onState: update => { if (update.state) state = normalizeState(update.state); sync = { ...sync, ...update }; renderAll(); } });
setInterval(tickTimer, 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) tickTimer(); }); window.addEventListener('beforeunload', () => saveState(sync.user, state));
window.addEventListener('offline', () => {
  sync = { ...sync, mode: 'offline', message: 'Offline: wijzigingen staan op dit apparaat en worden later gesynchroniseerd.' };
  renderAuth();
});
window.addEventListener('online', () => {
  if (sync.user) {
    sync = { ...sync, mode: 'syncing', message: 'Je offline wijzigingen worden gesynchroniseerd…' };
    auth.scheduleSave();
  } else {
    sync = { ...sync, mode: 'guest', message: 'Je gegevens staan alleen op dit apparaat.' };
  }
  renderAuth();
});
renderAll(); auth.init().catch(() => { sync = { ...sync, mode: 'error', message: 'Aanmelden bij synchronisatie is mislukt.' }; renderAuth(); });
initializePwa().catch(error => {
  console.error('Studiemaatje kon de offlinevoorzieningen niet activeren.', error);
  toast('Offline installeren is op dit moment niet beschikbaar.');
});
