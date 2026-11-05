import { createId, touch } from './state.js';

export async function askTutor({ prompt, subject, state, signal }) {
  const question = String(prompt || '').trim().slice(0, 4000);
  if (!question) throw new Error('Schrijf eerst een vraag.');
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify({ prompt: question, subject, profile: { age: state.age, level: state.studyLevel } }) });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'De tutor is tijdelijk niet bereikbaar.');
  return String(data.reply || '').slice(0, 12000);
}
export function addChatMessage(state, role, content) { state.chatHistory.push({ id: createId('chat'), role: role === 'assistant' ? 'assistant' : 'user', content: String(content).slice(0, 12000), updated_at: new Date().toISOString() }); state.chatHistory = state.chatHistory.slice(-100); touch(state); }
