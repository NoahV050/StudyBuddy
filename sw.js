const CACHE_NAME = 'studiemaatje-v28';
const CACHE_PREFIX = 'studiemaatje-';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/js/script.js?version=27',
  '/js/config.js',
  '/js/modules/state.js',
  '/js/modules/storage.js',
  '/js/modules/tasks.js',
  '/js/modules/notes.js',
  '/js/modules/gamification.js',
  '/js/modules/timer.js',
  '/js/modules/tutor.js',
  '/js/modules/auth.js',
  '/js/modules/ui.js',
  '/js/modules/learning.js',
  '/js/modules/learning-ui.js',
  '/js/modules/challenges.js',
  '/js/modules/pwa.js',
  '/js/modules/navigation.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async path => {
      const requestUrl = new URL(path, self.location.origin);
      requestUrl.searchParams.set('cache-version', CACHE_NAME);
      const response = await fetch(requestUrl, { cache: 'reload' });
      if (!response.ok) throw new Error(`App-bestand kon niet worden opgeslagen: ${path}`);
      await cache.put(path, response);
    }));
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(request) || await caches.match('/index.html');
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return await caches.match(request) || await caches.match('/index.html') ||
          new Response('Je bent offline en de app is nog niet beschikbaar.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
