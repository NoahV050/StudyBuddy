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
let sync = { mode: 'guest', message: 'Je gegevens staan alleen op dit apparaat.', user: null };
let auth, editingNoteId = null, chatAbortController = null;
let learningSubjectId = state.subjects?.find(subject => !subject.deleted)?.id || '';
let flashcardRevealed = false;
const $ = byId;
const save = () => { rolloverDailyState(state); touch(state); saveState(sync.user, state); auth?.scheduleSave(); };
function toast(message) { const element = $('toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }
function setTheme(theme) { state.theme = theme === 'dark' ? 'dark' : 'light'; document.documentElement.dataset.theme = state.theme; save(); renderThemeButtons(); }
const renderThemeButtons = () => renderThemeButtonsView(state);
const renderTimer = () => renderTimerView(state);
const renderTasks = () => renderTasksView(state, toggleTask, deleteTask);
const renderNotes = () => renderNotesView(state, openNoteEditor);
const renderChat = () => renderChatView(state, $('ai-subject').value, $('tutor-history-search').value);
const renderHome = () => renderHomeView(state);
const renderProfile = () => renderProfileView(state, sync);
const renderAuth = () => renderAuthView(sync);
const renderLearning = () => renderLearningView(state, learningSubjectId, flashcardRevealed);
function showPage(name, showTabs = true) { document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `pg-${name}`)); document.querySelectorAll('.tab-item').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${name}`)); $('tab-bar').style.display = showTabs && sync.user && state.profileComplete ? 'flex' : 'none'; if (name === 'notes') renderNotes(); if (name === 'ai') renderChat(); if (name === 'learn') renderLearning(); if (name === 'profile') renderProfile(); if (name === 'home') renderHome(); }
function ensureShell() { if (!sync.user) return showPage('auth-landing', false); if (!state.profileComplete) return showPage('profile-setup', false); if (!$('pg-home').classList.contains('active')) showPage('home'); }
function renderAll() { document.documentElement.dataset.theme = state.theme; renderTimer(); renderTasks(); renderNotes(); renderChat(); renderHome(); renderProfile(); renderLearning(); ensureShell(); }
function completeCurrentTimer(sessionId, taskId) { const result = completeTimer(state, sessionId, new Date(), taskId); if (!result.completed) return; awardXp(state, result.minutes * 2, `timer:${sessionId}`); save(); renderAll(); $('session-complete-msg').textContent = `Je hebt ${result.subject} gestudeerd voor ${result.minutes} minuten. +${result.minutes * 2} XP!`; $('session-modal').style.display = 'flex'; if ('Notification' in window && Notification.permission === 'granted') new Notification('Focussessie afgerond', { body: `${result.minutes} minuten ${result.subject}. Goed gewerkt!` }); }
function tickTimer() { const result = reconcileTimer(state); renderTimer(); if (result.completed) completeCurrentTimer(result.sessionId, result.taskId); }
function setMode(mode) { if (setTimerMode(state, mode)) { save(); renderTimer(); } }
function setCustomFocusDuration() { if (setCustomDuration(state, $('custom-focus-minutes').value)) { save(); renderTimer(); toast(`Timer ingesteld op ${state.timerCustomSeconds / 60} minuten.`); } }
function enableTimerNotifications() { if (!('Notification' in window)) return toast('Deze browser ondersteunt geen meldingen.'); Notification.requestPermission().then(permission => { $('timer-notification-btn').textContent = permission === 'granted' ? 'Meldingen staan aan' : 'Meldingen niet toegestaan'; }).catch(() => toast('Meldingen konden niet worden ingeschakeld.')); }
function toggleTimer() { if (state.timerRunning) pauseTimer(state); else startTimer(state, $('focus-subject').value, $('focus-task').value); save(); renderTimer(); }
function resetTimer() { resetTimerState(state); save(); renderTimer(); }
function filterTasks(filter) { state.taskFilter = ['all', 'todo', 'done'].includes(filter) ? filter : 'all'; save(); ['all', 'todo', 'done'].forEach(name => { const button = $(`filter-${name}`); button.style.fontWeight = name === state.taskFilter ? '600' : '400'; }); renderTasks(); }
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
function finishOnboard() { const name = $('ob-name').value.trim(); if (!name) return toast('Vul eerst je naam in.'); state.name = name.slice(0, 80); state.age = $('ob-age').value.trim().slice(0, 3); state.studyLevel = $('ob-level').value; state.profileComplete = true; if (!state.lastStudyDate) { state.lastStudyDate = localDateKey(); state.streak = 1; } save(); renderAll(); showPage('home'); }
function editProfile() { $('ob-name').value = state.name === 'Student' ? '' : state.name; $('ob-age').value = state.age; $('ob-level').value = state.studyLevel; showPage('profile-setup', false); }
let authMode = 'signin'; function showAuthModal(mode) { authMode = mode; $('auth-modal-title').textContent = mode === 'signin' ? 'Inloggen' : 'Account maken'; $('auth-submit-btn').textContent = mode === 'signin' ? 'Inloggen' : 'Account maken'; $('auth-modal').style.display = 'flex'; }
function closeAuthModal() { $('auth-modal').style.display = 'none'; $('auth-modal-status').textContent = ''; }
async function submitAuth() { const email = $('auth-email-input').value.trim(); const password = $('auth-password-input').value; if (!email || password.length < 6) return $('auth-modal-status').textContent = 'Vul een e-mailadres en een wachtwoord van minimaal 6 tekens in.'; try { const signedIn = authMode === 'signin' ? (await auth.signIn(email, password), true) : await auth.signUp(email, password); if (signedIn) closeAuthModal(); else $('auth-modal-status').textContent = 'Controleer je e-mail om je account te bevestigen.'; } catch (error) { $('auth-modal-status').textContent = error.message || 'Inloggen is mislukt.'; } }
async function logoutUser() { try { await auth.signOut(); toast('Uitgelogd'); } catch { toast('Uitloggen is niet gelukt.'); } }
function closeSessionModal() { $('session-modal').style.display = 'none'; }
Object.assign(window, { goTo: name => showPage(name), setTheme, setMode, setCustomFocusDuration, enableTimerNotifications, toggleTimer, resetTimer, filterTasks, addTask, toggleTask, deleteTask, openNoteEditor, closeNoteEditor, saveNote, sendMessage, sendChip, stopTutor, regenerateTutor, saveTutorAsNote, clearTutorHistory, searchTutorHistory, selectLearningSubject, selectTutorSubject, selectTutorMode, addSubjectFromForm, addFlashcardFromForm, revealFlashcard, rateFlashcard, createExamPlanFromForm, completePlannedItem, claimChallenge: claimLearningChallenge, useStreakFreezeFromProfile, finishOnboard, editProfile, showAuthModal, closeAuthModal, submitAuth, logoutUser, closeSessionModal });
auth = createAuthService({ config: window.STUDY_BUDDY_CONFIG, getState: () => state, loadLocal: loadState, saveLocal: saveState, guestState: () => loadState(null) || createDefaultState(), onState: update => { if (update.state) state = normalizeState(update.state); sync = { ...sync, ...update }; renderAll(); } });
setInterval(tickTimer, 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) tickTimer(); }); window.addEventListener('beforeunload', () => saveState(sync.user, state));
renderAll(); auth.init().catch(() => { sync = { ...sync, mode: 'error', message: 'Aanmelden bij synchronisatie is mislukt.' }; renderAuth(); });
