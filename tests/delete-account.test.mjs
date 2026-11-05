import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/delete-account.js';

const userId = 'c0a80123-4567-489a-8abc-1234567890ab';
const profile = { user_id: userId, state: { xp: 25 }, updated_at: '2026-01-01T10:00:00.000Z' };

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockResponse() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function withBackend(run) {
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const oldEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key'
  });
  try {
    await run();
  } finally {
    keys.forEach(key => {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    });
    globalThis.fetch = oldFetch;
  }
}

test('requires a POST request and a verified bearer token', async () => {
  const methodResponse = mockResponse();
  await handler({ method: 'GET', headers: {} }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.Allow, 'POST');

  const authResponse = mockResponse();
  await handler({ method: 'POST', headers: {} }, authResponse);
  assert.equal(authResponse.statusCode, 401);
});

test('deletes only the authenticated user profile and account', async () => {
  await withBackend(async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      const requestUrl = new URL(url);
      calls.push({ path: requestUrl.pathname, method: options.method || 'GET', headers: options.headers });
      if (requestUrl.pathname === '/auth/v1/user') return response(200, { id: userId });
      if (requestUrl.pathname === '/rest/v1/profiles') return response(200, [profile]);
      if (requestUrl.pathname === `/auth/v1/admin/users/${userId}`) return response(200, { id: userId });
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    };
    const res = mockResponse();

    const previousConsoleError = console.error;
    console.error = () => {};
    try {
      await handler({ method: 'POST', headers: { authorization: 'Bearer user-session-token' } }, res);
    } finally {
      console.error = previousConsoleError;
    }

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(calls.map(call => call.method), ['GET', 'DELETE', 'DELETE']);
    assert.equal(calls[0].headers.Authorization, 'Bearer user-session-token');
    assert.equal(calls[1].headers.Authorization, 'Bearer server-only-test-key');
    assert.equal(calls[2].headers.Authorization, 'Bearer server-only-test-key');
  });
});

test('restores the cloud profile if deleting the auth account fails', async () => {
  await withBackend(async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      const requestUrl = new URL(url);
      calls.push({ path: requestUrl.pathname, method: options.method || 'GET', body: options.body });
      if (requestUrl.pathname === '/auth/v1/user') return response(200, { id: userId });
      if (requestUrl.pathname === '/rest/v1/profiles' && options.method === 'DELETE') return response(200, [profile]);
      if (requestUrl.pathname === `/auth/v1/admin/users/${userId}`) return response(500, {});
      if (requestUrl.pathname === '/rest/v1/profiles' && options.method === 'POST') return response(201, {});
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    };
    const res = mockResponse();

    await handler({ method: 'POST', headers: { authorization: 'Bearer user-session-token' } }, res);

    assert.equal(res.statusCode, 502);
    assert.deepEqual(JSON.parse(calls.at(-1).body), [profile]);
    assert.match(res.body.error, /niet verwijderd/i);
  });
});

test('attempts to restore the profile when the Auth deletion request fails', async () => {
  await withBackend(async () => {
    const methods = [];
    globalThis.fetch = async (url, options) => {
      const requestUrl = new URL(url);
      methods.push(options.method || 'GET');
      if (requestUrl.pathname === '/auth/v1/user') return response(200, { id: userId });
      if (requestUrl.pathname === '/rest/v1/profiles') return response(200, [profile]);
      if (requestUrl.pathname === `/auth/v1/admin/users/${userId}`) throw new Error('network unavailable');
      throw new Error(`Unexpected request: ${requestUrl.pathname}`);
    };
    const res = mockResponse();

    const previousConsoleError = console.error;
    console.error = () => {};
    try {
      await handler({ method: 'POST', headers: { authorization: 'Bearer user-session-token' } }, res);
    } finally {
      console.error = previousConsoleError;
    }

    assert.equal(res.statusCode, 502);
    assert.deepEqual(methods, ['GET', 'DELETE', 'DELETE', 'POST']);
  });
});
