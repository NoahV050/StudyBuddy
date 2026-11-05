import { createDefaultState, localDateKey, normalizeState, rolloverDailyState, touch } from './modules/state.js';
import { loadState, saveState } from './modules/storage.js';
import { addTask as createTask, deleteTask as removeTask, toggleTask as changeTask } from './modules/tasks.js';
import { saveNote as persistNote } from './modules/notes.js';
import { awardXp } from './modules/gamification.js';
import { completeTimer, pauseTimer, reconcileTimer, resetTimer as resetTimerState, setMode as setTimerMode, startTimer } from './modules/timer.js';
import { addChatMessage, askTutor } from './modules/tutor.js';
import { createAuthService } from './modules/auth.js';
import {
  addBubble,
  byId,
  renderAuth as renderAuthView,
  renderChat as renderChatView,
  renderHome as renderHomeView,
  renderNotes as renderNotesView,
  renderProfile as renderProfileView,
  renderTasks as renderTasksView,
  renderThemeButtons as renderThemeButtonsView,
  renderTimer as renderTimerView
} from './modules/ui.js';

let state = loadState(null) || createDefaultState();
let sync = { mode: 'guest', message: 'Je gegevens staan alleen op dit apparaat.', user: null };
let auth, editingNoteId = null, chatAbortController = null;
const $ = byId;
const save = () => { rolloverDailyState(state); touch(state); saveState(sync.user, state); auth?.scheduleSave(); };
function toast(message) { const element = $('toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }
function setTheme(theme) { state.theme = theme === 'dark' ? 'dark' : 'light'; document.documentElement.dataset.theme = state.theme; save(); renderThemeButtons(); }
const renderThemeButtons = () => renderThemeButtonsView(state);
const renderTimer = () => renderTimerView(state);
const renderTasks = () => renderTasksView(state, toggleTask, deleteTask);
const renderNotes = () => renderNotesView(state, openNoteEditor);
const renderChat = () => renderChatView(state);
const renderHome = () => renderHomeView(state);
const renderProfile = () => renderProfileView(state, sync);
const renderAuth = () => renderAuthView(sync);
function showPage(name, showTabs = true) { document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `pg-${name}`)); document.querySelectorAll('.tab-item').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${name}`)); $('tab-bar').style.display = showTabs && sync.user && state.profileComplete ? 'flex' : 'none'; if (name === 'notes') renderNotes(); if (name === 'ai') renderChat(); if (name === 'profile') renderProfile(); if (name === 'home') renderHome(); }
function ensureShell() { if (!sync.user) return showPage('auth-landing', false); if (!state.profileComplete) return showPage('profile-setup', false); if (!$('pg-home').classList.contains('active')) showPage('home'); }
function renderAll() { document.documentElement.dataset.theme = state.theme; renderTimer(); renderTasks(); renderNotes(); renderChat(); renderHome(); renderProfile(); ensureShell(); }
function completeCurrentTimer(sessionId) { const result = completeTimer(state, sessionId); if (!result.completed) return; awardXp(state, result.minutes * 2, `timer:${sessionId}`); save(); renderAll(); $('session-complete-msg').textContent = `Je hebt ${result.subject} gestudeerd voor ${result.minutes} minuten. +${result.minutes * 2} XP!`; $('session-modal').style.display = 'flex'; }
function tickTimer() { const result = reconcileTimer(state); renderTimer(); if (result.completed) completeCurrentTimer(result.sessionId); }
function setMode(mode) { if (setTimerMode(state, mode)) { save(); renderTimer(); } }
function toggleTimer() { if (state.timerRunning) pauseTimer(state); else startTimer(state, $('focus-subject').value); save(); renderTimer(); }
function resetTimer() { resetTimerState(state); save(); renderTimer(); }
function filterTasks(filter) { state.taskFilter = ['all', 'todo', 'done'].includes(filter) ? filter : 'all'; save(); ['all', 'todo', 'done'].forEach(name => { const button = $(`filter-${name}`); button.style.fontWeight = name === state.taskFilter ? '600' : '400'; }); renderTasks(); }
function addTask() { const input = $('new-task-input'); const task = createTask(state, input.value); if (!task) return; input.value = ''; awardXp(state, 10, `task:create:${task.id}`); save(); renderTasks(); renderHome(); toast('+10 XP verdiend!'); }
function toggleTask(id) { const { item, award } = changeTask(state, id); if (award) awardXp(state, award, `task:complete:${item.id}`); save(); renderTasks(); renderHome(); if (award) toast('+20 XP verdiend!'); }
function deleteTask(id) { if (removeTask(state, id)) { save(); renderTasks(); renderHome(); } }
function openNoteEditor(id) { editingNoteId = id === -1 ? null : id; const note = state.notes.find(item => item.id === editingNoteId); $('note-title-input').value = note?.title || ''; $('note-body-input').value = note?.body || ''; $('notes-list-view').style.display = 'none'; $('notes-editor-view').style.display = 'flex'; $('note-title-input').focus(); }
function closeNoteEditor() { editingNoteId = null; $('notes-list-view').style.display = 'block'; $('notes-editor-view').style.display = 'none'; }
function saveNote() { const result = persistNote(state, editingNoteId, $('note-title-input').value, $('note-body-input').value); if (result.isNew) awardXp(state, 5, `note:create:${result.item.id}`); save(); closeNoteEditor(); renderNotes(); renderProfile(); if (result.isNew) toast('+5 XP verdiend!'); }
async function sendMessage() { const input = $('chat-input'); const question = input.value.trim(); if (!question || chatAbortController) return; input.value = ''; addChatMessage(state, 'user', question); save(); renderChat(); const typing = addBubble('ai', 'Studiemaatje denkt na…'); typing.classList.add('typing'); chatAbortController = new AbortController(); try { const reply = await askTutor({ prompt: question, subject: $('ai-subject').value, state, signal: chatAbortController.signal }); typing.remove(); addChatMessage(state, 'assistant', reply); save(); renderChat(); } catch (error) { typing.textContent = error.name === 'AbortError' ? 'Antwoord gestopt.' : error.message; } finally { chatAbortController = null; } }
function sendChip(text) { $('chat-input').value = text; sendMessage(); }
function finishOnboard() { const name = $('ob-name').value.trim(); if (!name) return toast('Vul eerst je naam in.'); state.name = name.slice(0, 80); state.age = $('ob-age').value.trim().slice(0, 3); state.studyLevel = $('ob-level').value; state.profileComplete = true; if (!state.lastStudyDate) { state.lastStudyDate = localDateKey(); state.streak = 1; } save(); renderAll(); showPage('home'); }
function editProfile() { $('ob-name').value = state.name === 'Student' ? '' : state.name; $('ob-age').value = state.age; $('ob-level').value = state.studyLevel; showPage('profile-setup', false); }
let authMode = 'signin'; function showAuthModal(mode) { authMode = mode; $('auth-modal-title').textContent = mode === 'signin' ? 'Inloggen' : 'Account maken'; $('auth-submit-btn').textContent = mode === 'signin' ? 'Inloggen' : 'Account maken'; $('auth-modal').style.display = 'flex'; }
function closeAuthModal() { $('auth-modal').style.display = 'none'; $('auth-modal-status').textContent = ''; }
async function submitAuth() { const email = $('auth-email-input').value.trim(); const password = $('auth-password-input').value; if (!email || password.length < 6) return $('auth-modal-status').textContent = 'Vul een e-mailadres en een wachtwoord van minimaal 6 tekens in.'; try { const signedIn = authMode === 'signin' ? (await auth.signIn(email, password), true) : await auth.signUp(email, password); if (signedIn) closeAuthModal(); else $('auth-modal-status').textContent = 'Controleer je e-mail om je account te bevestigen.'; } catch (error) { $('auth-modal-status').textContent = error.message || 'Inloggen is mislukt.'; } }
async function logoutUser() { try { await auth.signOut(); toast('Uitgelogd'); } catch { toast('Uitloggen is niet gelukt.'); } }
function closeSessionModal() { $('session-modal').style.display = 'none'; }
Object.assign(window, { goTo: name => showPage(name), setTheme, setMode, toggleTimer, resetTimer, filterTasks, addTask, toggleTask, deleteTask, openNoteEditor, closeNoteEditor, saveNote, sendMessage, sendChip, finishOnboard, editProfile, showAuthModal, closeAuthModal, submitAuth, logoutUser, closeSessionModal });
auth = createAuthService({ config: window.STUDY_BUDDY_CONFIG, getState: () => state, loadLocal: loadState, saveLocal: saveState, guestState: () => loadState(null) || createDefaultState(), onState: update => { if (update.state) state = normalizeState(update.state); sync = { ...sync, ...update }; renderAll(); } });
setInterval(tickTimer, 1000); document.addEventListener('visibilitychange', () => { if (!document.hidden) tickTimer(); }); window.addEventListener('beforeunload', () => saveState(sync.user, state));
renderAll(); auth.init().catch(() => { sync = { ...sync, mode: 'error', message: 'Aanmelden bij synchronisatie is mislukt.' }; renderAuth(); });
