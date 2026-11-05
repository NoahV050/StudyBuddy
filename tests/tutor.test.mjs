import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import handler from '../api/chat.js';
import { addChatMessage, askTutor } from '../js/modules/tutor.js';
import { createDefaultState } from '../js/modules/state.js';

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.chunks = [];
    this.writableEnded = false;
    this.headersSent = false;
  }

  status(code) { this.statusCode = code; return this; }
  json(body) { this.body = body; return this; }
  setHeader(name, value) { this.headers[name] = value; }
  write(chunk) { this.headersSent = true; this.chunks.push(chunk); }
  end(chunk = '') { if (chunk) this.chunks.push(chunk); this.writableEnded = true; }
}

function request(body, method = 'POST') {
  const req = new EventEmitter();
  req.method = method;
  req.headers = { 'x-forwarded-for': '127.0.0.1' };
  req.body = body;
  return req;
}

test('rejects invalid tutor inputs before contacting Gemini', async () => {
  let fetchCalled = false;
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error('unexpected'); };
  process.env.GEMINI_API_KEY = 'test-secret';
  try {
    const res = new MockResponse();
    await handler(request({ prompt: '  ', mode: 'uitleggen', subject: 'Wiskunde' }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Schrijf eerst een vraag.');
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('streams Gemini tokens and keeps the secret out of the endpoint URL', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  let requestUrl = '';
  let requestHeaders;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestHeaders = options.headers;
    const chunk = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Stap ' }] } }] })}\n\n`;
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); }
    }));
  };
  process.env.GEMINI_API_KEY = 'test-secret';
  try {
    const res = new MockResponse();
    await handler(request({ prompt: 'Leg breuken uit', mode: 'uitleggen', subject: 'Wiskunde' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.match(res.chunks.join(''), /Stap/);
    assert.equal(requestHeaders['x-goog-api-key'], 'test-secret');
    assert.equal(requestUrl.includes('test-secret'), false);
    assert.equal(res.writableEnded, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('sends the selected mode and streams responses to the tutor UI callback', async () => {
  const state = createDefaultState();
  const oldMessage = addChatMessage(state, 'user', 'Eerdere vraag', 'Wiskunde', 'uitleggen');
  const currentMessage = addChatMessage(state, 'user', 'Quiz mij', 'Wiskunde', 'overhoren');
  let requestBody;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const events = [
      `event: token\ndata: ${JSON.stringify({ text: 'Eerste ' })}\n\n`,
      `event: token\ndata: ${JSON.stringify({ text: 'stap' })}\n\n`
    ].join('');
    return new Response(events);
  };
  try {
    const tokens = [];
    const reply = await askTutor({
      prompt: 'Quiz mij',
      subject: 'Wiskunde',
      mode: 'overhoren',
      state,
      excludeMessageId: currentMessage.id,
      onToken: text => tokens.push(text)
    });
    assert.equal(requestBody.mode, 'overhoren');
    assert.equal(requestBody.history.length, 1);
    assert.equal(requestBody.history[0].content, oldMessage.content);
    assert.deepEqual(tokens, ['Eerste ', 'Eerste stap']);
    assert.equal(reply, 'Eerste stap');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
