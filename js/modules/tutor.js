import { createId, touch } from './state.js';

export async function askTutor({ prompt, subject, mode, state, signal, onToken, excludeMessageId, image }) {
  const question = String(prompt || '').trim().slice(0, 4000);
  if (!question) throw new Error('Schrijf eerst een vraag.');
  const history = state.chatHistory
    .filter(item => item.subject === subject && item.id !== excludeMessageId)
    .slice(-12)
    .map(item => ({ role: item.role, content: item.content }));
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    signal,
    body: JSON.stringify({
      prompt: question,
      subject,
      mode: mode || 'uitleggen',
      profile: { age: state.age, level: state.studyLevel },
      history,
      ...(image ? { image } : {}),
      stream: true
    })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'De tutor is tijdelijk niet bereikbaar.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming wordt niet ondersteund door je browser.');
  const decoder = new TextDecoder();
  let buffer = '';
  let complete = '';
  const consumeEvent = event => {
    const type = event.match(/^event:\s*(.+)$/m)?.[1];
    const raw = event.match(/^data:\s*(.+)$/m)?.[1];
    if (!raw) return;
    const data = JSON.parse(raw);
    if (type === 'error') throw new Error(data.error || 'De tutor kon geen antwoord maken.');
    if (type === 'token') {
      complete += data.text || '';
      onToken?.(complete);
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    events.forEach(consumeEvent);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  return complete.slice(0, 12000);
}

export function addChatMessage(state, role, content, subject = state.tutorSubject, mode = state.tutorMode, metadata = {}) {
  const message = {
    id: createId('chat'),
    role: role === 'assistant' ? 'assistant' : 'user',
    content: String(content).slice(0, 12000),
    subject,
    mode,
    updated_at: new Date().toISOString()
  };
  if (metadata.imageAttached) message.imageAttached = true;
  state.chatHistory.push(message);
  state.chatHistory = state.chatHistory.slice(-150);
  touch(state);
  return message;
}

export function clearSubjectHistory(state, subject) {
  state.chatHistory = state.chatHistory.filter(item => item.subject !== subject);
  touch(state);
}
