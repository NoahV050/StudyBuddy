const CACHE_NAME = 'studiemaatje-v11';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/script.js?version=10',
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
  '/js/modules/learning-ui.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await Promise.all(urlsToCache.map(async url => {
          const requestUrl = new URL(url, self.location.origin);
          requestUrl.searchParams.set('cache-version', '11');
          const response = await fetch(requestUrl, { cache: 'reload' });
          await cache.put(url, response);
        }));
      })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
